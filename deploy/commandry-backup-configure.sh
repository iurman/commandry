#!/usr/bin/env bash
# Initial R2 backup configuration. Install a reviewed copy as root, mode 0700.
# --test-root is available only from a repository copy and writes to a fixture.
set +x
set -euo pipefail
umask 077
PATH=/usr/sbin:/usr/bin:/sbin:/bin
LC_ALL=C
export PATH LC_ALL

fail() {
  printf 'Commandry backup configuration: %s\n' "$1" >&2
  exit 1
}

# Bash `read` preserves an inherited export attribute. Clear these names before
# any external command or secret read so entered values stay shell-local.
unset -v access_key secret_key restic_password restic_password_again 2>/dev/null ||
  fail 'inherited secret variables could not be cleared'

installed_path=/usr/local/sbin/commandry-backup-configure
script_path=$(realpath -e -- "$0") || fail 'the executing script is unavailable'
test_root=
if [[ "$script_path" == "$installed_path" ]]; then
  [[ $# -eq 0 ]] || fail 'the installed command accepts no arguments'
  [[ $EUID -eq 0 ]] || fail 'the installed command requires root'
  [[ -t 0 && -t 1 && -t 2 ]] || fail 'the installed command requires an interactive terminal, not a pipe'
  while IFS= read -r name; do
    case "$name" in
      AWS_*|RESTIC_*|R2_*|CLOUDFLARE_*|CF_API_TOKEN|COMMANDRY_BACKUP_*)
        fail 'backup credentials must be entered at the terminal, not supplied through the environment' ;;
    esac
  done < <(compgen -e)
  prefix=
  expected_uid=0
  exec 3<> /dev/tty || fail 'the operator terminal is unavailable'
elif [[ $# -eq 2 && "$1" == --test-root ]]; then
  [[ ! -L "$2" && -d "$2" ]] || fail 'the test root must be a real directory'
  test_root=$(realpath -e -- "$2")
  [[ "$test_root" != / && -f "$test_root/.commandry-backup-configure-fixture" &&
    ! -L "$test_root/.commandry-backup-configure-fixture" ]] || fail 'the test fixture marker is missing'
  prefix=$test_root
  expected_uid=$EUID
  exec 3<&0
else
  fail 'run the reviewed installed command, or use --test-root with a disposable fixture'
fi

trusted_path() {
  local path=$1 kind=$2 uid mode_text permissions
  [[ ! -L "$path" ]] || fail 'a controlled path is symlinked'
  if [[ "$kind" == directory ]]; then
    [[ -d "$path" ]] || fail 'a controlled directory is missing'
  else
    [[ -f "$path" ]] || fail 'a controlled file is missing'
  fi
  read -r uid mode_text < <(stat -c '%u %a' -- "$path")
  [[ "$uid" == "$expected_uid" && "$mode_text" =~ ^[0-7]{3,4}$ ]] ||
    fail 'a controlled owner or mode is invalid'
  permissions=$((8#$mode_text))
  (( (permissions & 8#022) == 0 )) || fail 'a controlled path is group or world writable'
}

if [[ -z "$test_root" ]]; then
  [[ ! -L "$0" ]] || fail 'the installed command must not be a symlink'
  for path in / /usr /usr/local /usr/local/sbin /etc /var /var/lib /opt \
    /opt/commandry /opt/commandry/runtime /opt/commandry/scripts; do
    trusted_path "$path" directory
  done
  trusted_path "$script_path" file
  [[ $(stat -c '%a' -- "$script_path") == 700 ]] || fail 'the installed command must have mode 0700'
  node_bin=/opt/commandry/runtime/node
  parser=/opt/commandry/scripts/host-backup-config.mjs
  trusted_path "$node_bin" file
  trusted_path "$parser" file
  trusted_path /opt/commandry/scripts/r2-repository.mjs file
  [[ -x "$node_bin" && $("$node_bin" --version) =~ ^v24\.[0-9]+\.[0-9]+$ ]] ||
    fail 'the controlled Node.js 24 runtime is unavailable'
else
  for path in "$test_root" "$prefix/etc" "$prefix/etc/commandry" \
    "$prefix/var" "$prefix/var/lib" "$prefix/var/lib/commandry"; do
    trusted_path "$path" directory
  done
fi

config_dir=$prefix/etc/commandry
state_dir=$prefix/var/lib/commandry
trusted_path "$config_dir" directory
trusted_path "$state_dir" directory
[[ $(stat -c '%a' -- "$config_dir") == 700 &&
  $(stat -c '%a' -- "$state_dir") == 700 ]] || fail 'private Commandry directories must have mode 0700'
password_file=$config_dir/restic-password
config_file=$config_dir/backup.env
for path in "$password_file" "$config_file"; do
  [[ ! -e "$path" && ! -L "$path" ]] || fail 'backup configuration already exists; refusing to overwrite it'
done

lock_file=$state_dir/backup-configure.lock
if [[ -e "$lock_file" || -L "$lock_file" ]]; then
  trusted_path "$lock_file" file
  [[ $(stat -c '%a' -- "$lock_file") == 600 ]] || fail 'the configuration lock must have mode 0600'
fi
exec 9> "$lock_file"
flock -n 9 || fail 'another backup configuration is running'
chmod 0600 -- "$lock_file"
for path in "$password_file" "$config_file"; do
  [[ ! -e "$path" && ! -L "$path" ]] || fail 'backup configuration appeared while acquiring the lock'
done

password_tmp=
config_tmp=
audit_tmp=
audit_final=
completed=0
audit_ready=1
if [[ -z "$test_root" ]]; then
  audit_actor=vps-root-operator-cli
  audit_approval=interactive-root-confirmation
  audit_source=production-vps-configuration
  audit_verification=strict-config-validated
else
  audit_actor=local-test-fixture
  audit_approval=synthetic-fixture-confirmation
  audit_source=synthetic-test-root
  audit_verification=synthetic-input-validated
fi
audit_event() {
  local outcome=$1 verification=$2 event_name occurred_at
  occurred_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  audit_tmp=$(mktemp "$state_dir/.backup-configure-event.XXXXXXXX") || return 1
  event_name=${audit_tmp##*/}
  audit_final=$state_dir/${event_name/#.backup-configure-event./backup-configure-event.}.json
  if ! printf '{"schemaVersion":1,"occurredAt":"%s","operation":"commandry.host.backup.configure","capability":"commandry.host.backup.configure","risk":"sensitive","actor":"%s","approval":"%s","sourceLabel":"%s","target":"commandry-backups/production","outcome":"%s","verification":"%s","containsSecrets":false}\n' \
    "$occurred_at" "$audit_actor" "$audit_approval" "$audit_source" "$outcome" "$verification" > "$audit_tmp"; then
    return 1
  fi
  chmod 0600 -- "$audit_tmp" || return 1
  ln -- "$audit_tmp" "$audit_final" || return 1
  if [[ "$outcome" == configured ]]; then test_signal_at after-audit-link; fi
}
cleanup() {
  local result=$?
  trap - EXIT
  trap '' INT TERM
  if (( completed == 0 )); then
    if [[ -n "$audit_tmp" && -n "$audit_final" && -e "$audit_final" &&
      "$audit_final" -ef "$audit_tmp" ]]; then rm -f -- "$audit_final"; fi
    if [[ -n "$audit_tmp" ]]; then rm -f -- "$audit_tmp"; fi
    audit_tmp=
    audit_final=
    if [[ -n "$config_tmp" && -e "$config_file" && "$config_file" -ef "$config_tmp" ]]; then
      rm -f -- "$config_file"
    fi
    if [[ -n "$password_tmp" && -e "$password_file" && "$password_file" -ef "$password_tmp" ]]; then
      rm -f -- "$password_file"
    fi
    if (( audit_ready == 1 )); then
      audit_event failed rolled-back ||
        printf 'Commandry backup configuration: could not record the failed attempt\n' >&2
    fi
  fi
  if [[ -n "$audit_tmp" ]]; then rm -f -- "$audit_tmp"; fi
  if [[ -n "$config_tmp" ]]; then rm -f -- "$config_tmp"; fi
  if [[ -n "$password_tmp" ]]; then rm -f -- "$password_tmp"; fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

test_signal_at() {
  if [[ -n "$test_root" && -f "$test_root/.interrupt-$1" ]]; then
    kill -TERM "$BASHPID"
  fi
}

read_value() {
  local label=$1 destination=$2
  if [[ -z "$test_root" ]]; then
    printf '%s: ' "$label" >&3
    IFS= read -r -s -u 3 "$destination" || fail 'terminal input ended early'
    printf '\n' >&3
  else
    IFS= read -r -u 3 "$destination" || fail 'test fixture input ended early'
  fi
}

if [[ -z "$test_root" ]]; then
  printf 'Configure the reserved Commandry R2 bucket for encrypted backups.\n' >&3
  printf 'Target: commandry-backups/production. This does not enable a timer or deploy Commandry.\n' >&3
  printf 'Type CONFIGURE to confirm this root-operator action: ' >&3
fi
IFS= read -r -u 3 confirmation || fail 'confirmation input ended early'
[[ "$confirmation" == CONFIGURE ]] || fail 'root-operator confirmation was not given'

read_value 'R2 bucket access key ID' access_key
read_value 'R2 bucket secret access key' secret_key
read_value 'New restic repository password, at least 32 characters' restic_password
read_value 'Repeat restic repository password' restic_password_again
read_value 'Retain recent snapshots (1-100)' retention_last
read_value 'Retain daily snapshots (1-366)' retention_daily
read_value 'Retain weekly snapshots (1-104)' retention_weekly
read_value 'Retain monthly snapshots (1-120)' retention_monthly
read_value 'Maximum backup age in hours (1-168)' max_backup_age_hours

[[ "$access_key" =~ ^[A-Za-z0-9/+_=-]{8,256}$ &&
  "$secret_key" =~ ^[A-Za-z0-9/+_=-]{16,512}$ ]] || fail 'R2 credential format is invalid'
[[ "$restic_password" =~ ^[[:print:]]{32,256}$ &&
  "$restic_password" == "$restic_password_again" ]] || fail 'restic password format or confirmation is invalid'
validate_positive() {
  local value=$1 maximum=$2
  [[ "$value" =~ ^[1-9][0-9]{0,2}$ ]] || fail 'retention and freshness values must be positive decimal integers'
  (( 10#$value <= maximum )) || fail 'retention or freshness value exceeds its supported limit'
}
validate_positive "$retention_last" 100
validate_positive "$retention_daily" 366
validate_positive "$retention_weekly" 104
validate_positive "$retention_monthly" 120
validate_positive "$max_backup_age_hours" 168

if [[ -n "$test_root" && -f "$test_root/.capture-child-environment" ]]; then
  [[ ! -e "$test_root/child-environment.bin" && ! -L "$test_root/child-environment.bin" ]] ||
    fail 'the synthetic environment capture already exists'
  (set -C; /usr/bin/env -0 > "$test_root/child-environment.bin") ||
    fail 'the synthetic environment capture failed'
fi

repository=s3:https://86b423adc3fb0269c3f4a708c9c7faed.r2.cloudflarestorage.com/commandry-backups/production
password_tmp=$(mktemp "$config_dir/.restic-password.XXXXXXXX")
config_tmp=$(mktemp "$config_dir/.backup.env.XXXXXXXX")
printf '%s\n' "$restic_password" > "$password_tmp"
printf 'DB_NAME=commandry\nRESTIC_REPOSITORY=%s\nRESTIC_PASSWORD_FILE=%s\nAWS_ACCESS_KEY_ID=%s\nAWS_SECRET_ACCESS_KEY=%s\nRETENTION_LAST=%s\nRETENTION_DAILY=%s\nRETENTION_WEEKLY=%s\nRETENTION_MONTHLY=%s\nMAX_BACKUP_AGE_HOURS=%s\n' \
  "$repository" "$password_file" "$access_key" "$secret_key" \
  "$retention_last" "$retention_daily" "$retention_weekly" \
  "$retention_monthly" "$max_backup_age_hours" > "$config_tmp"
chmod 0600 -- "$password_tmp" "$config_tmp"
ln -- "$password_tmp" "$password_file" || fail 'the restic password destination already exists'
test_signal_at after-password-link
if [[ -z "$test_root" ]]; then
  /usr/bin/env -i HOME=/root PATH=/usr/sbin:/usr/bin:/sbin:/bin LC_ALL=C \
    "$node_bin" --input-type=module -e '
    import { parsePrivateConfig } from "/opt/commandry/scripts/host-backup-config.mjs";
    try { parsePrivateConfig(process.argv[1]); } catch { process.exit(1); }
  ' "$config_tmp" >/dev/null 2>&1 || fail 'the installed strict backup configuration parser rejected the values'
fi
ln -- "$config_tmp" "$config_file" || fail 'the backup environment destination already exists'
test_signal_at after-config-link
audit_event configured "$audit_verification" || fail 'the private audit event could not be recorded'
completed=1
printf 'Commandry backup configuration saved. No backup timer or production service was activated.\n'
