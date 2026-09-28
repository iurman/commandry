#!/usr/bin/env bash
# Install as /usr/local/sbin/commandry-deploy, owned by root, mode 0755.
# The sudo rule permits that installed path with no arguments. A repository
# copy accepts --test-root only for a disposable local rehearsal.
set -euo pipefail
umask 077

installed_path=/usr/local/sbin/commandry-deploy
script_path=$(realpath "$0")
if [[ "$script_path" == "$installed_path" ]]; then
  [[ $# -eq 0 && $EUID -eq 0 ]] || {
    printf 'Commandry deployment rejected: installed command needs root and no arguments.\n' >&2
    exit 1
  }
  mode=production
  expected_uid=0
  base=/opt/commandry
  config_dir=/etc/commandry
  state_dir=/var/lib/commandry
  hook_dir=/usr/local/sbin
  export PATH=/usr/sbin:/usr/bin:/sbin:/bin
else
  [[ $# -eq 2 && "$1" == --test-root && -d "$2" ]] || {
    printf 'Use --test-root with an existing disposable directory for local rehearsal.\n' >&2
    exit 1
  }
  mode=local_rehearsal
  expected_uid=$EUID
  test_root=$(realpath "$2")
  base=$test_root/opt/commandry
  config_dir=$test_root/etc/commandry
  state_dir=$test_root/var/lib/commandry
  hook_dir=$test_root/usr/local/sbin
  export PATH=$test_root/bin:/usr/sbin:/usr/bin:/sbin:/bin
fi

env_file=$config_dir/commandry.env
lock_file=$state_dir/deploy.lock
approval_file=$config_dir/approved-release
previous_env=$config_dir/previous.env
current_release=$state_dir/current-release
backup_receipt=$state_dir/predeploy-backup.receipt
event_log=$state_dir/deployments.jsonl
compose_file=$base/compose.production.yaml
backup_hook=$hook_dir/commandry-backup-gate
smoke_hook=$hook_dir/commandry-app-smoke
step=preflight
mutated=false
backup_id=''
rollback_result=not_needed
image=''
revision=''
approval_id=''
approved_by=''
actor=${SUDO_USER:-operator}
[[ "$actor" =~ ^[a-z_][a-z0-9_-]{0,63}$ ]] || actor=operator

reject() {
  printf 'Commandry deployment rejected: %s.\n' "$1" >&2
  if [[ "$mutated" == true ]]; then
    failed 1
  fi
  exit 1
}

trusted_path() {
  local path=$1 kind=$2 uid mode_text permissions
  [[ ! -L "$path" ]] || reject 'a controlled path is a symlink'
  if [[ "$kind" == directory || "$kind" == private_directory ]]; then
    [[ -d "$path" ]] || reject 'a controlled directory is missing'
  else
    [[ -f "$path" ]] || reject 'a controlled file is missing'
  fi
  read -r uid mode_text < <(stat -c '%u %a' "$path")
  [[ "$uid" == "$expected_uid" && "$mode_text" =~ ^[0-7]{3,4}$ ]] ||
    reject 'a controlled path has an unexpected owner or mode'
  permissions=$((8#$mode_text))
  (( (permissions & 8#022) == 0 )) || reject 'a controlled path is group or world writable'
  if [[ "$kind" == private || "$kind" == private_directory ]]; then
    (( (permissions & 8#077) == 0 )) || reject 'a private file is readable by another user'
  fi
}

docker_cmd() {
  if [[ "$mode" == production ]]; then
    env -i HOME=/root PATH="$PATH" DOCKER_HOST=unix:///var/run/docker.sock docker "$@"
  else
    env -i HOME="$test_root" PATH="$PATH" COMMANDRY_TEST_ROOT="$test_root" docker "$@"
  fi
}

compose() {
  docker_cmd compose --project-directory "$base" --env-file "$env_file" \
    -f "$compose_file" -p commandry "$@"
}

hook() {
  if [[ "$mode" == production ]]; then
    env -i HOME=/root PATH="$PATH" "$@"
  else
    env -i HOME="$test_root" PATH="$PATH" COMMANDRY_TEST_ROOT="$test_root" "$@"
  fi
}

field() {
  awk -F= -v key="$2" '$1 == key { count++; value = substr($0, length(key) + 2) }
    END { if (count == 1) print value; else exit 1 }' "$1"
}

event() {
  local result=$1 now
  now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  printf '{"time":"%s","mode":"%s","actor":"%s","result":"%s","step":"%s","image":"%s","revision":"%s","approvalId":"%s","approvedBy":"%s","backupSnapshot":"%s","rollback":"%s"}\n' \
    "$now" "$mode" "$actor" "$result" "$step" "$image" "$revision" "$approval_id" "$approved_by" "$backup_id" "$rollback_result" >> "$event_log"
}

restore_previous_env() {
  if [[ -f "$previous_env" ]]; then
    cp "$previous_env" "$env_file.rollback"
    chmod 0600 "$env_file.rollback"
    mv -f "$env_file.rollback" "$env_file"
  fi
}

rollback() {
  if [[ -f "$current_release" ]]; then
    restore_previous_env || return 1
    compose up --no-deps -d --wait --wait-timeout 120 web worker >/dev/null 2>&1 || return 1
    rollback_result=previous_code_restored
  else
    compose stop cloudflared caddy web worker >/dev/null 2>&1 || return 1
    restore_previous_env || return 1
    rollback_result=first_release_stopped
  fi
}

failed() {
  local code=$1
  trap - ERR INT TERM
  set +e
  if [[ "$mutated" == true ]]; then
    rollback || rollback_result=failed
  fi
  event failed
  printf 'Commandry deployment failed at %s; rollback: %s.\n' "$step" "$rollback_result" >&2
  exit "$code"
}

trap 'failed $?' ERR
trap 'step=interrupted; failed 1' INT TERM

for path in "$base" "$base/deploy" "$base/docker" "$base/docker/postgres" \
  "$base/docker/postgres/initdb" "$hook_dir"; do
  trusted_path "$path" directory
done
for path in "$config_dir" "$config_dir/cloudflared" "$state_dir"; do
  trusted_path "$path" private_directory
done
trusted_path "$compose_file" file
trusted_path "$base/deploy/Caddyfile" file
for path in "$base/docker/postgres/initdb/"*; do
  [[ -e "$path" ]] || reject 'PostgreSQL initialization files are missing'
  trusted_path "$path" file
done
for path in "$config_dir/cloudflared/"*; do
  [[ -e "$path" ]] || reject 'Tunnel configuration files are missing'
  trusted_path "$path" private
done
trusted_path "$env_file" private
trusted_path "$approval_file" private
trusted_path "$backup_hook" file
trusted_path "$smoke_hook" file
[[ -x "$backup_hook" && -x "$smoke_hook" ]] || reject 'a required backup or application smoke gate is unavailable'
trap 'rm -f "$env_file.staged" "$env_file.rollback" "$previous_env.tmp" "$current_release.tmp"' EXIT

image=$(field "$approval_file" IMAGE) || reject 'approved image is missing or duplicated'
revision=$(field "$approval_file" REVISION) || reject 'approved revision is missing or duplicated'
build_time=$(field "$approval_file" BUILD_TIME) || reject 'approved build time is missing or duplicated'
approval_id=$(field "$approval_file" APPROVAL_ID) || reject 'approval ID is missing or duplicated'
approved_by=$(field "$approval_file" APPROVED_BY) || reject 'approver is missing or duplicated'
expires_at=$(field "$approval_file" EXPIRES_AT) || reject 'approval expiry is missing or duplicated'
target=$(field "$approval_file" TARGET) || reject 'approval target is missing or duplicated'
[[ "$target" == production ]] || reject 'approval target is not production'
[[ "$image" =~ ^ghcr\.io/[a-z0-9][a-z0-9._/-]*/commandry@sha256:[0-9a-f]{64}$ ]] ||
  reject 'approved image is not an immutable Commandry digest'
[[ "$revision" =~ ^[0-9a-f]{40}$ ]] || reject 'approved revision is invalid'
[[ "$build_time" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]] ||
  reject 'approved build time is invalid'
[[ "$approval_id" =~ ^[a-zA-Z0-9._-]{1,80}$ && "$approved_by" =~ ^[a-zA-Z0-9._-]{1,80}$ ]] ||
  reject 'approval metadata is invalid'
[[ "$expires_at" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]] ||
  reject 'approval expiry is invalid'
expiry_epoch=$(date -u -d "$expires_at" +%s) || reject 'approval expiry is invalid'
now_epoch=$(date -u +%s)
(( expiry_epoch > now_epoch && expiry_epoch <= now_epoch + 86400 )) ||
  reject 'approval is expired or exceeds one day'

[[ ! -L "$lock_file" ]] || reject 'deployment lock is a symlink'
exec 9> "$lock_file"
flock -n 9 || reject 'another deployment holds the lock'

old_image=$(field "$env_file" COMMANDRY_IMAGE) || reject 'current image is missing or duplicated'
field "$env_file" RELEASE_SHA >/dev/null || reject 'current revision is missing or duplicated'
field "$env_file" RELEASE_BUILD_TIME >/dev/null || reject 'current build time is missing or duplicated'
if [[ -f "$current_release" ]]; then
  trusted_path "$current_release" private
  [[ "$(field "$current_release" IMAGE)" == "$old_image" ]] ||
    reject 'the recorded release differs from the environment file'
  [[ "$old_image" =~ ^ghcr\.io/[a-z0-9][a-z0-9._/-]*/commandry@sha256:[0-9a-f]{64}$ ]] ||
    reject 'the previous release image is not immutable'
  [[ "$old_image" != "$image" ]] || reject 'approved release is already active'
  docker_cmd image inspect "$old_image" >/dev/null 2>&1 || reject 'the rollback image is unavailable'
fi

step=image_verification
docker_cmd pull "$image" >/dev/null 2>&1 || reject 'approved image pull failed'
repo_digests=$(docker_cmd image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "$image" 2>/dev/null) ||
  reject 'approved image inspection failed'
grep -Fxq -- "$image" <<< "$repo_digests" || reject 'pulled image digest does not match approval'
actual_revision=$(docker_cmd image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image" 2>/dev/null) ||
  reject 'image revision label is unavailable'
source_clean=$(docker_cmd image inspect --format '{{index .Config.Labels "org.commandry.source.clean"}}' "$image" 2>/dev/null) ||
  reject 'image source label is unavailable'
[[ "$actual_revision" == "$revision" && "$source_clean" == true ]] ||
  reject 'image revision or source provenance differs from approval'

step=environment_update
cp "$env_file" "$previous_env.tmp"
chmod 0600 "$previous_env.tmp"
mv -f "$previous_env.tmp" "$previous_env"
awk -v image="$image" -v revision="$revision" -v built="$build_time" '
  /^COMMANDRY_IMAGE=/ { image_count++; print "COMMANDRY_IMAGE=" image; next }
  /^RELEASE_SHA=/ { revision_count++; print "RELEASE_SHA=" revision; next }
  /^RELEASE_BUILD_TIME=/ { built_count++; print "RELEASE_BUILD_TIME=" built; next }
  { print }
  END { if (image_count != 1 || revision_count != 1 || built_count != 1) exit 1 }
' "$env_file" > "$env_file.staged"
chmod 0600 "$env_file.staged"
mv -f "$env_file.staged" "$env_file"
mutated=true

step=compose_validation
compose config --quiet >/dev/null 2>&1 || failed $?
step=database_readiness
compose up -d --wait --wait-timeout 120 postgres >/dev/null 2>&1 || failed $?
step=backup_gate
rm -f "$backup_receipt"
hook "$backup_hook" predeploy "$backup_receipt" "$image" "$revision" >/dev/null 2>&1 || failed $?
trusted_path "$backup_receipt" private
received_backup_id=$(field "$backup_receipt" SNAPSHOT) || reject 'backup snapshot receipt is invalid'
backup_time=$(field "$backup_receipt" COMPLETED_AT) || reject 'backup timestamp receipt is invalid'
backup_offsite=$(field "$backup_receipt" OFFSITE) || reject 'backup location receipt is invalid'
backup_verified=$(field "$backup_receipt" VERIFIED) || reject 'backup verification receipt is invalid'
backup_restored=$(field "$backup_receipt" RESTORE_PASSED) || reject 'backup restore receipt is invalid'
backup_dump_sha=$(field "$backup_receipt" DUMP_SHA256) || reject 'backup digest receipt is invalid'
[[ "$received_backup_id" =~ ^[0-9a-f]{64}$ && "$backup_dump_sha" =~ ^[0-9a-f]{64}$ && \
  "$backup_offsite" == true && "$backup_verified" == true && "$backup_restored" == true ]] ||
  reject 'backup receipt does not prove a verified offsite snapshot'
backup_id=$received_backup_id
[[ "$backup_time" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]] ||
  reject 'backup timestamp is invalid'
backup_epoch=$(date -u -d "$backup_time" +%s) || reject 'backup timestamp is invalid'
now_epoch=$(date -u +%s)
(( backup_epoch <= now_epoch + 60 && backup_epoch >= now_epoch - 1800 )) ||
  reject 'backup snapshot is stale or future-dated'

step=migration
compose run --rm --no-deps migrate >/dev/null 2>&1 || failed $?
step=application_start
compose up --no-deps -d --wait --wait-timeout 120 web worker >/dev/null 2>&1 || failed $?
step=version_and_health
compose exec -T web node -e '
  (async () => {
    const origin = "http://127.0.0.1:3000";
    for (const path of ["/health/live", "/health/ready"]) {
      const response = await fetch(origin + path, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) process.exit(1);
    }
    const response = await fetch(origin + "/version", { signal: AbortSignal.timeout(5000) });
    const version = await response.json();
    if (!response.ok || version.sha !== process.env.RELEASE_SHA ||
        version.imageDigest !== process.env.RELEASE_IMAGE_DIGEST ||
        version.environment !== "production") process.exit(1);
  })().catch(() => process.exit(1));
' >/dev/null 2>&1 || failed $?
step=application_smoke
hook "$smoke_hook" "$env_file" "$image" "$revision" >/dev/null 2>&1 || failed $?
step=ingress_start
compose up --no-deps -d --wait --wait-timeout 120 caddy cloudflared >/dev/null 2>&1 || failed $?

step=complete
printf 'IMAGE=%s\nREVISION=%s\n' "$image" "$revision" > "$current_release.tmp"
chmod 0600 "$current_release.tmp"
mv -f "$current_release.tmp" "$current_release"
event succeeded
printf 'Commandry deployment completed for %s.\n' "$revision"
