#!/usr/bin/env bash
# Install as /usr/local/sbin/commandry-app-smoke, root owned, mode 0755.
# The deployment command forwards two stdin lines: owner email and password.
set +x
set -euo pipefail
umask 077

installed_path=/usr/local/sbin/commandry-app-smoke
script_path=$(realpath "$0")
if [[ "$script_path" == "$installed_path" ]]; then
  [[ $EUID -eq 0 && $# -eq 3 ]] || {
    printf 'Application smoke requires root and three fixed arguments.\n' >&2
    exit 1
  }
  base=/opt/commandry
  config_dir=/etc/commandry
  state_dir=/var/lib/commandry
  expected_uid=0
  docker_home=/root
  test_root=''
  export PATH=/usr/sbin:/usr/bin:/sbin:/bin
else
  [[ $# -eq 5 && "$1" == --test-root && -d "$2" ]] || {
    printf 'Use --test-root with a disposable local directory.\n' >&2
    exit 1
  }
  test_root=$(realpath "$2")
  shift 2
  base=$test_root/opt/commandry
  config_dir=$test_root/etc/commandry
  state_dir=$test_root/var/lib/commandry
  expected_uid=$EUID
  docker_home=$test_root
  export PATH=$test_root/bin:/usr/sbin:/usr/bin:/sbin:/bin
fi

env_file=$config_dir/commandry.env
compose_file=$base/compose.production.yaml
validator=$base/deploy/validate-app-smoke-receipt.py
receipt=$state_dir/app-smoke.latest.json
temporary=$state_dir/app-smoke.$$.tmp
image=$2
revision=$3

reject() {
  printf 'Application smoke rejected: %s.\n' "$1" >&2
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
  (( (permissions & 8#022) == 0 )) || reject 'a controlled path is writable by others'
  if [[ "$kind" == private || "$kind" == private_directory ]]; then
    (( (permissions & 8#077) == 0 )) || reject 'a private path is accessible to others'
  fi
}

docker_cmd() {
  if [[ -n "$test_root" ]]; then
    env -i HOME="$docker_home" PATH="$PATH" COMMANDRY_TEST_ROOT="$test_root" docker "$@"
  else
    env -i HOME="$docker_home" PATH="$PATH" DOCKER_HOST=unix:///var/run/docker.sock docker "$@"
  fi
}

compose() {
  docker_cmd compose --project-directory "$base" --env-file "$env_file" \
    -f "$compose_file" -p commandry "$@"
}

[[ "$1" == "$env_file" ]] || reject 'the environment file path differs from the fixed path'
[[ "$image" =~ ^ghcr\.io/[a-z0-9][a-z0-9._/-]*/commandry@sha256:[0-9a-f]{64}$ ]] ||
  reject 'the approved image is invalid'
[[ "$revision" =~ ^[0-9a-f]{40}$ ]] || reject 'the approved revision is invalid'
trusted_path "$base" directory
trusted_path "$config_dir" private_directory
trusted_path "$state_dir" private_directory
trusted_path "$compose_file" file
trusted_path "$base/deploy" directory
trusted_path "$validator" file
trusted_path "$env_file" private
[[ $(stat -c '%a' "$env_file") == 600 ]] || reject 'the environment file must have mode 0600'
[[ ! -t 0 ]] || reject 'owner credentials must arrive on standard input'
compose config --quiet >/dev/null 2>&1 || reject 'production Compose configuration is invalid'

[[ ! -L "$receipt" ]] || reject 'the previous receipt is a symlink'
rm -f "$receipt"
trap 'rm -f "$temporary"' EXIT
if ! compose run --rm --no-deps -T worker node apps/worker/dist/deployment-smoke.js \
  "$image" "$revision" > "$temporary"; then
  reject 'owner login, read, or worker completion failed'
fi
chmod 0600 "$temporary"
python3 "$validator" "$temporary" "$image" "$revision" || reject 'the smoke receipt is invalid'
mv -f "$temporary" "$receipt"
printf 'Application smoke passed and wrote a private receipt.\n'
