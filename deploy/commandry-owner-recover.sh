#!/usr/bin/env bash
# Install as /usr/local/sbin/commandry-owner-recover, root owned, mode 0750.
# Supply the configured owner email and new password as two stdin lines.
set +x
set -euo pipefail
umask 077

installed_path=/usr/local/sbin/commandry-owner-recover
script_path=$(realpath "$0")
if [[ "$script_path" == "$installed_path" ]]; then
  [[ $EUID -eq 0 && $# -eq 0 ]] || {
    printf 'Owner recovery requires root and no arguments.\n' >&2
    exit 1
  }
  base=/opt/commandry
  config_dir=/etc/commandry
  state_dir=/var/lib/commandry
  expected_uid=0
  export PATH=/usr/sbin:/usr/bin:/sbin:/bin
  docker_home=/root
  test_root=''
else
  [[ $# -eq 2 && "$1" == --test-root && -d "$2" ]] || {
    printf 'Use --test-root with a disposable local directory.\n' >&2
    exit 1
  }
  test_root=$(realpath "$2")
  base=$test_root/opt/commandry
  config_dir=$test_root/etc/commandry
  state_dir=$test_root/var/lib/commandry
  expected_uid=$EUID
  export PATH=$test_root/bin:/usr/sbin:/usr/bin:/sbin:/bin
  docker_home=$test_root
fi

env_file=$config_dir/commandry.env
compose_file=$base/compose.production.yaml
lock_file=$state_dir/deploy.lock
web_was_running=false
web_stop_attempted=false

reject() {
  printf 'Owner recovery rejected: %s.\n' "$1" >&2
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

finish() {
  local result=$?
  trap - EXIT INT TERM
  if [[ "$web_was_running" == true && "$web_stop_attempted" == true ]]; then
    if ! compose up -d --no-deps --wait --wait-timeout 120 web >/dev/null; then
      printf 'Owner recovery could not restart web.\n' >&2
      result=1
    fi
  fi
  unset owner_email new_password
  exit "$result"
}

trusted_path "$base" directory
trusted_path "$config_dir" private_directory
trusted_path "$state_dir" private_directory
trusted_path "$compose_file" file
trusted_path "$env_file" private
[[ $(stat -c '%a' "$env_file") == 600 ]] || reject 'the environment file must have mode 0600'
[[ ! -L "$lock_file" ]] || reject 'the deployment lock is a symlink'
exec 9> "$lock_file"
flock -n 9 || reject 'another deployment or recovery holds the lock'

[[ ! -t 0 ]] || reject 'pipe the owner email and new password through standard input'
IFS= read -r owner_email || reject 'the owner email is missing'
IFS= read -r new_password || reject 'the new password is missing'
if IFS= read -r extra; then reject 'only two input lines are allowed'; fi
[[ "$owner_email" =~ ^[^[:space:]@]+@[^[:space:]@]+$ ]] || reject 'the owner email is invalid'
[[ ${#new_password} -ge 12 && ${#new_password} -le 128 ]] || reject 'the password length is invalid'

compose config --quiet >/dev/null 2>&1 || reject 'production Compose configuration is invalid'
running=$(compose ps --status running --services web) || reject 'the web service cannot be inspected'
if [[ "$running" == web ]]; then web_was_running=true; fi
trap finish EXIT
trap 'exit 1' INT TERM
if [[ "$web_was_running" == true ]]; then
  web_stop_attempted=true
  compose stop web >/dev/null || reject 'the web service could not be stopped'
fi
printf '%s\n%s\n' "$owner_email" "$new_password" |
  compose run --rm --no-deps -T worker node apps/worker/dist/recover-local-auth.js
printf 'Owner password recovery completed; prior sessions were revoked.\n'
