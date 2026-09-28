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
backup_config=$config_dir/backup.env
lock_file=$state_dir/deploy.lock
approval_file=$config_dir/approved-release
previous_env=$config_dir/previous.env
current_release=$state_dir/current-release
pending_release=$state_dir/pending-first-release
backup_receipt=$state_dir/predeploy-backup.receipt
event_log=$state_dir/deployments.jsonl
compose_file=$base/compose.production.yaml
backup_hook=$hook_dir/commandry-backup-gate
smoke_hook=$hook_dir/commandry-app-smoke
smoke_validator=$base/deploy/validate-app-smoke-receipt.py
smoke_receipt=$state_dir/app-smoke.latest.json
step=preflight
mutated=false
backup_id=''
rollback_result=not_needed
smoke_verified=false
smoke_job_id=''
owner_bootstrapped=false
prior_caddy=false
prior_cloudflared=false
ingress_observed=false
previous_release_existed=false
previous_release_snapshot=''
first_release=false
pending_prepared=false
bootstrap_id=''
cluster_id=''
database_volume=''
database_name=''
app_started=false
ingress_started=false
database_touched=false
database_identity_confirmed=false
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
  printf '{"time":"%s","mode":"%s","actor":"%s","result":"%s","step":"%s","image":"%s","revision":"%s","approvalId":"%s","approvedBy":"%s","backupSnapshot":"%s","smokeVerified":%s,"smokeJobId":"%s","ownerBootstrapped":%s,"rollback":"%s"}\n' \
    "$now" "$mode" "$actor" "$result" "$step" "$image" "$revision" "$approval_id" "$approved_by" "$backup_id" "$smoke_verified" "$smoke_job_id" "$owner_bootstrapped" "$rollback_result" >> "$event_log"
}

restore_previous_env() {
  if [[ -f "$previous_env" ]]; then
    cp "$previous_env" "$env_file.rollback"
    chmod 0600 "$env_file.rollback"
    mv -f "$env_file.rollback" "$env_file"
  fi
}

restore_previous_release() {
  if [[ "$previous_release_existed" == true ]]; then
    install -m 0600 "$previous_release_snapshot" "$current_release.tmp" || return 1
    mv -f "$current_release.tmp" "$current_release"
  else
    rm -f "$current_release"
  fi
}

restore_pending_release() {
  if [[ "$pending_prepared" == true ]]; then
    printf 'IMAGE=%s\nREVISION=%s\nVOLUME=%s\nDB_NAME=%s\nBOOTSTRAP_ID=%s\nCLUSTER_ID=%s\n' \
      "$image" "$revision" "$database_volume" "$database_name" "$bootstrap_id" "$cluster_id" > "$pending_release.tmp" || return 1
    chmod 0600 "$pending_release.tmp" || return 1
    mv -f "$pending_release.tmp" "$pending_release" || return 1
  fi
}

verify_bootstrap_volume() {
  local details
  details=$(docker_cmd volume inspect --format \
    '{{.Driver}}|{{index .Labels "com.docker.compose.project"}}|{{index .Labels "com.docker.compose.volume"}}|{{index .Labels "org.commandry.bootstrap-id"}}' \
    "$database_volume" 2>/dev/null) || reject 'the pending database volume is unavailable'
  [[ "$details" == "local|commandry|postgres_data|$bootstrap_id" ]] ||
    reject 'the pending database volume does not match its bootstrap identity'
}

assert_first_release_quiet() {
  local running_services
  running_services=$(compose ps --status running --services caddy cloudflared web worker migrate) ||
    reject 'Commandry service inventory failed'
  [[ -z "$running_services" ]] ||
    reject 'an unactivated Commandry service is already running'
}

rollback() {
  if [[ "$previous_release_existed" == true ]]; then
    if [[ "$database_touched" != true ]]; then
      restore_previous_env || return 1
      restore_previous_release || return 1
      rollback_result=previous_environment_restored
      return 0
    fi
    if [[ "$database_identity_confirmed" != true ]]; then
      compose stop cloudflared caddy web worker >/dev/null 2>&1 || return 1
      restore_previous_env || return 1
      restore_previous_release || return 1
      rollback_result=database_identity_unverified_services_stopped
      return 0
    fi
    if [[ "$ingress_observed" == true ]]; then
      compose stop cloudflared caddy >/dev/null 2>&1 || return 1
    fi
    restore_previous_env || return 1
    restore_previous_release || return 1
    compose up --no-deps -d --wait --wait-timeout 120 web worker >/dev/null 2>&1 || return 1
    local restore_ingress=()
    [[ "$prior_caddy" != true ]] || restore_ingress+=(caddy)
    [[ "$prior_cloudflared" != true ]] || restore_ingress+=(cloudflared)
    if (( ${#restore_ingress[@]} > 0 )); then
      compose up --no-deps -d --wait --wait-timeout 120 "${restore_ingress[@]}" >/dev/null 2>&1 || return 1
    fi
    rollback_result=previous_code_restored
  else
    if [[ "$ingress_started" == true ]]; then
      compose stop cloudflared caddy >/dev/null 2>&1 || return 1
    fi
    if [[ "$app_started" == true ]]; then
      compose stop web worker >/dev/null 2>&1 || return 1
    fi
    restore_previous_env || return 1
    restore_previous_release || return 1
    restore_pending_release || return 1
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
  if [[ "$previous_release_existed" == true && "$database_touched" == true && "$database_identity_confirmed" != true ]]; then
    printf 'Commandry database identity is unverified. Keep Commandry ingress closed and perform operator recovery before retrying.\n' >&2
  fi
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
trusted_path "$smoke_validator" file
for path in "$base/docker/postgres/initdb/"*; do
  [[ -e "$path" ]] || reject 'PostgreSQL initialization files are missing'
  trusted_path "$path" file
done
for path in "$config_dir/cloudflared/"*; do
  [[ -e "$path" ]] || reject 'Tunnel configuration files are missing'
  trusted_path "$path" private
done
trusted_path "$env_file" private
trusted_path "$backup_config" private
trusted_path "$approval_file" private
trusted_path "$backup_hook" file
trusted_path "$smoke_hook" file
[[ -x "$backup_hook" && -x "$smoke_hook" ]] || reject 'a required backup or application smoke gate is unavailable'
trap 'rm -f "$env_file.staged" "$env_file.rollback" "$previous_env.tmp" "$current_release.tmp" "$pending_release.tmp"; if [[ -n "$previous_release_snapshot" ]]; then rm -f "$previous_release_snapshot"; fi' EXIT

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
old_revision=$(field "$env_file" RELEASE_SHA) || reject 'current revision is missing or duplicated'
field "$env_file" RELEASE_BUILD_TIME >/dev/null || reject 'current build time is missing or duplicated'
database_volume=$(field "$env_file" PRODUCTION_DB_VOLUME_NAME) || reject 'database volume name is missing or duplicated'
[[ "$database_volume" =~ ^commandry[-_][a-z0-9_.-]{1,100}$ ]] ||
  reject 'database volume name is outside the Commandry namespace'
database_name=$(python3 - "$env_file" "$backup_config" 2>/dev/null <<'PY'
import re
import sys
from urllib.parse import urlsplit

def values(path, keys, strict=False):
    found = {}
    assigned = set()
    with open(path, encoding="utf-8") as source:
        for raw in source:
            line = raw.rstrip("\n")
            if strict:
                if not line.strip() or line.lstrip().startswith("#"):
                    continue
                match = re.fullmatch(r"([A-Z][A-Z0-9_]*)=([!-~]+)", line)
                if not match:
                    raise ValueError("unsupported Compose assignment")
                key, value = match.groups()
                if key in assigned or any(char in value for char in ("#", "$", "\\", '"', "'")):
                    raise ValueError("ambiguous Compose assignment")
                assigned.add(key)
                if key in keys:
                    found[key] = value
                continue
            if line.strip() in keys:
                raise ValueError("key without value")
            if "=" not in line:
                continue
            left, value = line.split("=", 1)
            key = left.strip()
            if key not in keys:
                continue
            if left != key or key in found or not value or value != value.strip() or any(ord(char) < 32 for char in value):
                raise ValueError("ambiguous value")
            found[key] = value
    if set(found) != set(keys):
        raise ValueError("missing value")
    return found

try:
    application = values(sys.argv[1], {"DB_NAME", "DATABASE_URL", "DATABASE_MIGRATION_URL"}, strict=True)
    backup = values(sys.argv[2], {"DB_NAME"})
    name = application["DB_NAME"]
    if not re.fullmatch(r"[a-z_][a-z0-9_]{0,62}", name) or backup["DB_NAME"] != name:
        raise ValueError("database names differ")
    for key, role in (("DATABASE_URL", "commandry_app"), ("DATABASE_MIGRATION_URL", "commandry_migrate")):
        raw = application[key]
        if len(raw) > 2048 or any(ord(char) < 33 or ord(char) > 126 for char in raw) or any(char in raw for char in ("?", "#", "\\", '"', "'", "$")):
            raise ValueError("ambiguous URL")
        if re.search(r"%(?![0-9A-Fa-f]{2})", raw):
            raise ValueError("invalid escape")
        parsed = urlsplit(raw)
        if (parsed.scheme != "postgresql" or parsed.netloc.count("@") != 1 or
            parsed.username != role or not parsed.password or
            parsed.hostname != "postgres" or parsed.port != 5432 or
            parsed.path != "/" + name or parsed.query or parsed.fragment):
            raise ValueError("different database target")
    print(name)
except (OSError, UnicodeError, ValueError):
    sys.exit(1)
PY
) || reject 'production and backup database targets differ or are ambiguous'
if [[ -f "$current_release" ]]; then
  [[ ! -e "$pending_release" && ! -L "$pending_release" ]] ||
    reject 'active and pending release markers conflict'
  trusted_path "$current_release" private
  previous_release_existed=true
  [[ "$(field "$current_release" IMAGE)" == "$old_image" ]] ||
    reject 'the recorded release differs from the environment file'
  [[ "$(field "$current_release" REVISION)" == "$old_revision" ]] ||
    reject 'the recorded revision differs from the environment file'
  [[ "$old_image" =~ ^ghcr\.io/[a-z0-9][a-z0-9._/-]*/commandry@sha256:[0-9a-f]{64}$ ]] ||
    reject 'the previous release image is not immutable'
  [[ "$old_revision" =~ ^[0-9a-f]{40}$ ]] || reject 'the previous release revision is invalid'
  active_volume=$(field "$current_release" VOLUME) ||
    reject 'active release lacks database identity; operator recovery is required'
  active_name=$(field "$current_release" DB_NAME) ||
    reject 'active release lacks database identity; operator recovery is required'
  bootstrap_id=$(field "$current_release" BOOTSTRAP_ID) ||
    reject 'active release lacks database identity; operator recovery is required'
  cluster_id=$(field "$current_release" CLUSTER_ID) ||
    reject 'active release lacks database identity; operator recovery is required'
  [[ "$active_volume" == "$database_volume" && "$active_name" == "$database_name" && \
    "$bootstrap_id" =~ ^[0-9a-f]{32}$ && \
    "$cluster_id" =~ ^[1-9][0-9]{14,19}$ ]] ||
    reject 'active release database identity differs from the environment or is invalid'
  cmp -s "$current_release" <(printf 'IMAGE=%s\nREVISION=%s\nVOLUME=%s\nDB_NAME=%s\nBOOTSTRAP_ID=%s\nCLUSTER_ID=%s\n' \
    "$old_image" "$old_revision" "$database_volume" "$database_name" "$bootstrap_id" "$cluster_id") ||
    reject 'active release marker has unexpected content'
  volumes=$(docker_cmd volume ls --format '{{.Name}}') || reject 'database volume inventory failed'
  grep -Fxq -- "$database_volume" <<< "$volumes" ||
    reject 'the active database volume is missing; operator recovery is required'
  verify_bootstrap_volume
  [[ "$old_image" != "$image" ]] || reject 'approved release is already active'
  docker_cmd image inspect "$old_image" >/dev/null 2>&1 || reject 'the rollback image is unavailable'
else
  [[ ! -e "$current_release" && ! -L "$current_release" ]] ||
    reject 'active release marker is not a regular file'
  first_release=true
  if [[ -e "$pending_release" || -L "$pending_release" ]]; then
    trusted_path "$pending_release" private
    pending_image=$(field "$pending_release" IMAGE) || reject 'pending release image is missing or duplicated'
    pending_revision=$(field "$pending_release" REVISION) || reject 'pending release revision is missing or duplicated'
    pending_volume=$(field "$pending_release" VOLUME) || reject 'pending database volume is missing or duplicated'
    pending_name=$(field "$pending_release" DB_NAME) || reject 'pending database name is missing or duplicated'
    bootstrap_id=$(field "$pending_release" BOOTSTRAP_ID) || reject 'pending bootstrap ID is missing or duplicated'
    cluster_id=$(field "$pending_release" CLUSTER_ID) || reject 'pending PostgreSQL cluster ID is missing or duplicated'
    [[ "$bootstrap_id" =~ ^[0-9a-f]{32}$ && "$cluster_id" =~ ^[1-9][0-9]{14,19}$ && \
      "$pending_image" == "$image" && \
      "$pending_revision" == "$revision" && "$pending_volume" == "$database_volume" && \
      "$pending_name" == "$database_name" ]] ||
      reject 'pending first release differs from the approved candidate or volume'
    cmp -s "$pending_release" <(printf 'IMAGE=%s\nREVISION=%s\nVOLUME=%s\nDB_NAME=%s\nBOOTSTRAP_ID=%s\nCLUSTER_ID=%s\n' \
      "$image" "$revision" "$database_volume" "$database_name" "$bootstrap_id" "$cluster_id") ||
      reject 'pending first release has unexpected content'
    pending_prepared=true
    volumes=$(docker_cmd volume ls --format '{{.Name}}') || reject 'database volume inventory failed'
    grep -Fxq -- "$database_volume" <<< "$volumes" ||
      reject 'the pending database volume is missing; operator recovery is required'
    verify_bootstrap_volume
  else
    volumes=$(docker_cmd volume ls --format '{{.Name}}') || reject 'database volume inventory failed'
    ! grep -Fxq -- "$database_volume" <<< "$volumes" ||
      reject 'an unmarked Commandry database volume already exists'
    bootstrap_id=$(od -An -tx1 -N16 /dev/urandom | tr -d ' \n') ||
      reject 'bootstrap identity generation failed'
    [[ "$bootstrap_id" =~ ^[0-9a-f]{32}$ ]] || reject 'bootstrap identity generation failed'
  fi
fi

if [[ "$first_release" == true ]]; then
  step=first_release_services
  assert_first_release_quiet
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

if [[ "$previous_release_existed" == true ]]; then
  previous_release_snapshot=$(mktemp "$state_dir/current-release.rollback.XXXXXXXX")
  cp "$current_release" "$previous_release_snapshot"
fi

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
if [[ "$first_release" == true ]]; then
  step=first_release_volume
  if [[ "$pending_prepared" != true ]]; then
    docker_cmd volume create \
      --label com.docker.compose.project=commandry \
      --label com.docker.compose.volume=postgres_data \
      --label "org.commandry.bootstrap-id=$bootstrap_id" \
      "$database_volume" >/dev/null || failed $?
  fi
  verify_bootstrap_volume
fi
step=database_readiness
database_touched=true
compose up -d --wait --wait-timeout 120 postgres >/dev/null 2>&1 || failed $?
verify_bootstrap_volume
step=cluster_identity
observed_cluster_id=$(compose exec -T postgres psql -X -A -t -v ON_ERROR_STOP=1 \
  -U postgres -d postgres -c 'select system_identifier from pg_control_system()') || failed $?
[[ "$observed_cluster_id" =~ ^[1-9][0-9]{14,19}$ ]] ||
  reject 'PostgreSQL cluster identity is unavailable'
if [[ "$first_release" == true ]]; then
  if [[ "$pending_prepared" == true ]]; then
    [[ "$observed_cluster_id" == "$cluster_id" ]] ||
      reject 'the pending PostgreSQL cluster was replaced or reinitialized'
  else
    cluster_id=$observed_cluster_id
    printf 'IMAGE=%s\nREVISION=%s\nVOLUME=%s\nDB_NAME=%s\nBOOTSTRAP_ID=%s\nCLUSTER_ID=%s\n' \
      "$image" "$revision" "$database_volume" "$database_name" "$bootstrap_id" "$cluster_id" > "$pending_release.tmp"
    chmod 0600 "$pending_release.tmp"
    mv -f "$pending_release.tmp" "$pending_release"
    pending_prepared=true
  fi
  trusted_path "$pending_release" private
else
  [[ "$observed_cluster_id" == "$cluster_id" ]] ||
    reject 'the active PostgreSQL cluster was replaced or reinitialized'
  database_identity_confirmed=true
fi
backup_gate() {
  step=backup_gate
  rm -f "$backup_receipt"
  hook "$backup_hook" predeploy "$backup_receipt" "$image" "$revision" >/dev/null 2>&1 || failed $?
  trusted_path "$backup_receipt" private
  received_backup_id=$(field "$backup_receipt" SNAPSHOT) || reject 'backup snapshot receipt is invalid'
  backup_time=$(field "$backup_receipt" COMPLETED_AT) || reject 'backup timestamp receipt is invalid'
  backup_offsite=$(field "$backup_receipt" OFFSITE) || reject 'backup location receipt is invalid'
  backup_verified=$(field "$backup_receipt" VERIFIED) || reject 'backup verification receipt is invalid'
  backup_restored=$(field "$backup_receipt" RESTORE_PASSED) || reject 'backup restore receipt is invalid'
  host_recovery_passed=$(field "$backup_receipt" HOST_RECOVERY_DRILL_PASSED) || reject 'host recovery drill receipt is invalid'
  backup_dump_sha=$(field "$backup_receipt" DUMP_SHA256) || reject 'backup digest receipt is invalid'
  globals_snapshot=$(field "$backup_receipt" GLOBALS_SNAPSHOT) || reject 'global roles snapshot receipt is invalid'
  globals_sha=$(field "$backup_receipt" GLOBALS_SHA256) || reject 'global roles digest receipt is invalid'
  config_snapshot=$(field "$backup_receipt" CONFIG_SNAPSHOT) || reject 'host configuration snapshot receipt is invalid'
  config_sha=$(field "$backup_receipt" CONFIG_SHA256) || reject 'host configuration digest receipt is invalid'
  backup_release_state=$(field "$backup_receipt" RELEASE_STATE) || reject 'release state receipt is invalid'
  backup_marker_sha=$(field "$backup_receipt" RELEASE_MARKER_SHA256) || reject 'release marker digest receipt is invalid'
  backup_database_name=$(field "$backup_receipt" DB_NAME) || reject 'backup database name receipt is invalid'
  local expected_state marker expected_marker_sha
  expected_state=current-release
  marker=$current_release
  if [[ "$first_release" == true ]]; then
    expected_state=pending-first-release
    marker=$pending_release
  fi
  expected_marker_sha=$(sha256sum "$marker" | awk '{print $1}') || failed $?
  [[ "$backup_release_state" == "$expected_state" && \
    "$backup_marker_sha" == "$expected_marker_sha" && \
    "$backup_database_name" == "$database_name" ]] ||
    reject 'backup receipt does not match the release state'
  [[ "$received_backup_id" =~ ^[0-9a-f]{64}$ && "$backup_dump_sha" =~ ^[0-9a-f]{64}$ && \
    "$globals_snapshot" =~ ^[0-9a-f]{64}$ && "$globals_sha" =~ ^[0-9a-f]{64}$ && \
    "$config_snapshot" =~ ^[0-9a-f]{64}$ && "$config_sha" =~ ^[0-9a-f]{64}$ && \
    "$backup_offsite" == true && "$backup_verified" == true && "$backup_restored" == true ]] ||
    reject 'backup receipt does not prove a verified offsite snapshot'
  [[ "$host_recovery_passed" == true ]] || reject 'backup receipt does not prove isolated host recovery'
  backup_id=$received_backup_id
  [[ "$backup_time" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]] ||
    reject 'backup timestamp is invalid'
  backup_epoch=$(date -u -d "$backup_time" +%s) || reject 'backup timestamp is invalid'
  now_epoch=$(date -u +%s)
  (( backup_epoch <= now_epoch + 60 && backup_epoch >= now_epoch - 1800 )) ||
    reject 'backup snapshot is stale or future-dated'
}

quiesce_ingress() {
  step=ingress_quiesce
  if [[ "$first_release" == true ]]; then
    assert_first_release_quiet
  else
    local running_ingress
    running_ingress=$(compose ps --status running --services caddy cloudflared) || failed $?
    if grep -Fxq caddy <<< "$running_ingress"; then prior_caddy=true; fi
    if grep -Fxq cloudflared <<< "$running_ingress"; then prior_cloudflared=true; fi
    ingress_observed=true
    compose stop cloudflared caddy >/dev/null 2>&1 || failed $?
  fi
}

if [[ "$first_release" == true ]]; then
  quiesce_ingress
  step=migration
  compose run --rm --no-deps migrate >/dev/null 2>&1 || failed $?
  backup_gate
else
  backup_gate
  quiesce_ingress
  step=migration
  compose run --rm --no-deps migrate >/dev/null 2>&1 || failed $?
fi
step=application_start
if [[ "$first_release" == true ]]; then assert_first_release_quiet; fi
app_started=true
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
rm -f "$smoke_receipt"
hook "$smoke_hook" "$env_file" "$image" "$revision" >/dev/null 2>&1 || failed $?
trusted_path "$smoke_receipt" private
python3 "$smoke_validator" "$smoke_receipt" "$image" "$revision" || failed $?
smoke_job_id=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["workerJobId"])' "$smoke_receipt") || failed $?
owner_bootstrapped=$(python3 -c 'import json,sys; print(str(json.load(open(sys.argv[1]))["bootstrapCreated"]).lower())' "$smoke_receipt") || failed $?
smoke_verified=true
step=ingress_start
ingress_started=true
compose up --no-deps -d --wait --wait-timeout 120 caddy cloudflared >/dev/null 2>&1 || failed $?

step=complete
printf 'IMAGE=%s\nREVISION=%s\nVOLUME=%s\nDB_NAME=%s\nBOOTSTRAP_ID=%s\nCLUSTER_ID=%s\n' \
  "$image" "$revision" "$database_volume" "$database_name" "$bootstrap_id" "$cluster_id" > "$current_release.tmp"
chmod 0600 "$current_release.tmp"
mv -f "$current_release.tmp" "$current_release"
if [[ "$first_release" == true ]]; then rm -f "$pending_release"; fi
event succeeded || failed $?
printf 'Commandry deployment completed for %s.\n' "$revision"
