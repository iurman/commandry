#!/usr/bin/env bash
# One-shot host commissioning. Run only a reviewed, root-owned copy.
# --test-root redirects every write and host command to a disposable fixture.
set -euo pipefail
umask 077
PATH=/usr/sbin:/usr/bin:/sbin:/bin
export PATH

die() {
  printf 'Commandry commissioning: %s\n' "$1" >&2
  exit 1
}

usage() {
  die 'expected --bundle-dir DIR --revision SHA --archive-sha SHA --manifest-sha SHA --node-file FILE --node-sha SHA --restic-file FILE --restic-sha SHA --public-key FILE --key-sha SHA --tailnet-context CONTEXT --public-context CONTEXT [--test-root DIR]'
}

bundle_dir= revision= archive_sha= manifest_sha= node_file= node_sha=
restic_file= restic_sha= public_key= key_sha= tailnet_context= public_context= test_root=
while (( $# > 0 )); do
  (( $# >= 2 )) || usage
  case "$1" in
    --bundle-dir) bundle_dir=$2 ;;
    --revision) revision=$2 ;;
    --archive-sha) archive_sha=$2 ;;
    --manifest-sha) manifest_sha=$2 ;;
    --node-file) node_file=$2 ;;
    --node-sha) node_sha=$2 ;;
    --restic-file) restic_file=$2 ;;
    --restic-sha) restic_sha=$2 ;;
    --public-key) public_key=$2 ;;
    --key-sha) key_sha=$2 ;;
    --tailnet-context) tailnet_context=$2 ;;
    --public-context) public_context=$2 ;;
    --test-root) test_root=$2 ;;
    *) usage ;;
  esac
  shift 2
done

[[ "$revision" =~ ^[0-9a-f]{40}$ ]] || usage
for digest in "$archive_sha" "$manifest_sha" "$node_sha" "$restic_sha" "$key_sha"; do
  [[ "$digest" =~ ^[0-9a-f]{64}$ ]] || usage
done
[[ -n "$bundle_dir" && -n "$node_file" && -n "$restic_file" && -n "$public_key" ]] || usage
[[ -n "$tailnet_context" && -n "$public_context" && "$tailnet_context" != "$public_context" ]] || usage
for context in "$tailnet_context" "$public_context"; do
  python3 - "$context" <<'PY' || die 'SSH client context must supply real host, source IP, server IP, and port 22'
import ipaddress
import re
import sys

match = re.fullmatch(r"host=([A-Za-z0-9_.:-]+),addr=([^,]+),laddr=([^,]+),lport=22", sys.argv[1])
if not match:
    raise SystemExit(1)
try:
    source = ipaddress.ip_address(match.group(2))
    local = ipaddress.ip_address(match.group(3))
except ValueError:
    raise SystemExit(1)
if (source.is_unspecified or source.is_loopback or local.is_unspecified
        or local.is_loopback or source == local or source.version != local.version):
    raise SystemExit(1)
PY
done

if [[ -n "$test_root" ]]; then
  [[ -d "$test_root" && ! -L "$test_root" ]] || die 'test root must be a real directory'
  prefix=$(realpath -e -- "$test_root")
  [[ "$prefix" != / ]] || die 'the filesystem root is not a test root'
  tools_dir=$prefix/tools
  [[ -d "$tools_dir" && ! -L "$tools_dir" ]] || die 'test tools are missing'
  for tool in useradd userdel groupdel getent id visudo sshd systemctl; do
    [[ -x "$tools_dir/$tool" && ! -L "$tools_dir/$tool" ]] || die "test tool is missing: $tool"
  done
else
  [[ $EUID -eq 0 ]] || die 'production commissioning requires root'
  [[ ! -L "$0" ]] || die 'the executing installer must not be a symlink'
  script_path=$(realpath -e -- "$0")
  [[ -f "$script_path" && ! -L "$script_path" ]] || die 'the executing installer is missing or symlinked'
  read -r script_uid script_mode < <(stat -c '%u %a' -- "$script_path")
  [[ "$script_uid" == 0 && $((8#$script_mode & 8#022)) -eq 0 ]] ||
    die 'the executing installer must be root-owned and not group/world writable'
  script_parent=$(dirname -- "$script_path")
  read -r parent_uid parent_mode < <(stat -c '%u %a' -- "$script_parent")
  [[ "$parent_uid" == 0 && $((8#$parent_mode & 8#022)) -eq 0 ]] ||
    die 'the installer parent must be root-owned and not group/world writable'
  prefix=
  tools_dir=
fi

tool() {
  if [[ -n "$test_root" ]]; then
    printf '%s/%s\n' "$tools_dir" "$1"
  else
    case "$1" in
      useradd|userdel|groupdel|visudo|sshd) printf '/usr/sbin/%s\n' "$1" ;;
      getent|id|systemctl) printf '/usr/bin/%s\n' "$1" ;;
      *) die 'unknown host tool' ;;
    esac
  fi
}

trusted_directory() {
  local path=$1 uid mode
  [[ -d "$path" && ! -L "$path" ]] || die "required host directory is missing or symlinked: $path"
  if [[ -z "$test_root" ]]; then
    read -r uid mode < <(stat -c '%u %a' -- "$path")
    [[ "$uid" == 0 && $((8#$mode & 8#022)) -eq 0 ]] ||
      die "required host directory is not root-controlled: $path"
  fi
}

opt_parent=$prefix/opt
config_parent=$prefix/etc
state_parent=$prefix/var/lib
bin_parent=$prefix/usr/local/sbin
sudo_parent=$prefix/etc/sudoers.d
ssh_parent=$prefix/etc/ssh
for path in "$prefix/" "$prefix/usr" "$prefix/usr/local" "$prefix/var" "$prefix/run" \
  "$opt_parent" "$config_parent" "$state_parent" "$bin_parent" "$sudo_parent" "$ssh_parent"; do
  trusted_directory "$path"
done
lock_dir=$prefix/run/commandry-commission.lock
[[ ! -L "$lock_dir" ]] || die 'commission lock path is symlinked'
mkdir -m 0700 "$lock_dir" || die 'another commissioning run or stale lock exists'
trap 'rmdir -- "$lock_dir"' EXIT
sshd_config=$ssh_parent/sshd_config
[[ -f "$sshd_config" && ! -L "$sshd_config" ]] || die 'sshd_config is missing or symlinked'
if [[ -z "$test_root" ]]; then
  read -r config_uid config_mode < <(stat -c '%u %a' -- "$sshd_config")
  [[ "$config_uid" == 0 && $((8#$config_mode & 8#022)) -eq 0 ]] ||
    die 'sshd_config is not root-controlled'
fi

base=$opt_parent/commandry
private_config=$config_parent/commandry
private_state=$state_parent/commandry
auth_dir=$ssh_parent/authorized_keys
auth_file=$auth_dir/commandry-deploy
sudo_file=$sudo_parent/commandry-deploy
for path in "$base" "$private_config" "$private_state" "$auth_file" "$sudo_file"; do
  [[ ! -e "$path" && ! -L "$path" ]] || die "refusing an existing Commandry path: $path"
done
for name in commandry-deploy commandry-backup-gate commandry-app-smoke commandry-owner-recover commandry-ssh-dispatch; do
  [[ ! -e "$bin_parent/$name" && ! -L "$bin_parent/$name" ]] ||
    die "refusing an existing host command: $name"
done
if [[ -e "$auth_dir" || -L "$auth_dir" ]]; then trusted_directory "$auth_dir"; fi
"$(tool getent)" passwd commandry-deploy >/dev/null && die 'deploy account already exists'
"$(tool getent)" group commandry-deploy >/dev/null && die 'deploy group already exists'
"$(tool systemctl)" is-active --quiet ssh || die 'existing SSH service is not active'

archive_source=$bundle_dir/commandry-controls-${revision:0:7}.tar.gz
manifest_source=$bundle_dir/source.sha256
for input in "$archive_source" "$manifest_source" "$node_file" "$restic_file" "$public_key"; do
  [[ -f "$input" && ! -L "$input" ]] || die "a source input is missing or symlinked: $input"
done

stage=$(mktemp -d "$opt_parent/commandry.stage.XXXXXXXX")
chmod 0700 "$stage"
created_identity=0
installed_key=0
installed_sudo=0
created_base=0
created_config=0
created_state=0
created_auth_dir=0
installed_wrappers=()
sshd_changed=0
completed=0
sshd_temp=
cleanup() {
  local result=$? restore_ok=1 wrapper
  trap - EXIT
  if (( completed == 0 )); then
    if (( installed_key == 1 )); then
      rm -f -- "$auth_file" ||
        printf 'Commandry commissioning: urgent: remove deploy authorized key\n' >&2
    fi
    if (( installed_sudo == 1 )); then
      rm -f -- "$sudo_file" ||
        printf 'Commandry commissioning: urgent: remove deploy sudo rule\n' >&2
    fi
    if (( sshd_changed == 1 )); then
      if ! cp -p -- "$stage/sshd_config.original" "$sshd_config"; then
        restore_ok=0
        printf 'Commandry commissioning: urgent: restore sshd_config from %s\n' "$private_state/sshd_config.before-commission" >&2
      fi
      if ! "$(tool systemctl)" reload ssh; then
        restore_ok=0
        printf 'Commandry commissioning: urgent: SSH reload of original configuration failed\n' >&2
      fi
    fi
    if (( created_identity == 1 )); then
      "$(tool userdel)" commandry-deploy ||
        printf 'Commandry commissioning: urgent: manually lock/remove commandry-deploy\n' >&2
      "$(tool groupdel)" commandry-deploy >/dev/null 2>&1 || true
    fi
    for wrapper in "${installed_wrappers[@]}"; do
      rm -f -- "$bin_parent/$wrapper" ||
        printf 'Commandry commissioning: inspect host command %s\n' "$wrapper" >&2
    done
    if (( created_base == 1 )); then
      rm -rf -- "$base" || printf 'Commandry commissioning: inspect installed controls at %s\n' "$base" >&2
    fi
    if (( created_config == 1 )); then
      rm -rf -- "$private_config" || printf 'Commandry commissioning: inspect private config at %s\n' "$private_config" >&2
    fi
    if (( created_state == 1 && restore_ok == 1 )); then
      rm -rf -- "$private_state" || printf 'Commandry commissioning: inspect private state at %s\n' "$private_state" >&2
    fi
    if (( created_auth_dir == 1 )); then rmdir -- "$auth_dir" || true; fi
  fi
  if [[ -n "$sshd_temp" && -e "$sshd_temp" ]]; then rm -f -- "$sshd_temp"; fi
  rm -rf -- "$stage" || printf 'Commandry commissioning: inspect temporary files at %s\n' "$stage" >&2
  rmdir -- "$lock_dir" ||
    printf 'Commandry commissioning: inspect stale lock at %s\n' "$lock_dir" >&2
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

install -m 0600 -- "$archive_source" "$stage/archive.tar.gz"
install -m 0600 -- "$manifest_source" "$stage/source.sha256"
install -m 0600 -- "$node_file" "$stage/node"
install -m 0600 -- "$restic_file" "$stage/restic"
install -m 0600 -- "$public_key" "$stage/deploy.pub"
for pair in "archive.tar.gz:$archive_sha" "source.sha256:$manifest_sha" "node:$node_sha" "restic:$restic_sha" "deploy.pub:$key_sha"; do
  filename=${pair%%:*}
  expected=${pair#*:}
  actual=$(sha256sum -- "$stage/$filename")
  [[ "${actual%% *}" == "$expected" ]] || die "copied source hash mismatch: $filename"
done

chmod 0700 "$stage/node" "$stage/restic"
[[ $("$stage/node" --version) == v24.20.0 ]] || die 'Node runtime version is not v24.20.0'
[[ $("$stage/restic" version) == 'restic 0.19.1'* ]] || die 'restic runtime version is not 0.19.1'
[[ $(wc -l < "$stage/deploy.pub") -eq 1 ]] || die 'deploy public key must have one line'
[[ $(cat -- "$stage/deploy.pub") =~ ^ssh-ed25519\ [A-Za-z0-9+/]+={0,2}(\ [A-Za-z0-9._-]+)?$ ]] ||
  die 'deploy public key must be one plain ed25519 key'
ssh-keygen -lf "$stage/deploy.pub" >/dev/null || die 'deploy public key is invalid'

mkdir -m 0755 "$stage/payload"
python3 - "$stage/archive.tar.gz" "$stage/source.sha256" "$stage/payload" <<'PY'
import hashlib
import os
import pathlib
import re
import sys
import tarfile

archive, manifest, destination = sys.argv[1:]
expected = {}
for line in pathlib.Path(manifest).read_text(encoding="utf-8").splitlines():
    match = re.fullmatch(r"([0-9a-f]{64})  ([A-Za-z0-9._/-]+)", line)
    if not match:
        raise SystemExit("Commandry commissioning: invalid source manifest")
    digest, name = match.groups()
    parts = pathlib.PurePosixPath(name).parts
    if (name.startswith("/") or name != pathlib.PurePosixPath(name).as_posix()
            or any(part in ("", ".", "..") for part in parts) or "//" in name):
        raise SystemExit("Commandry commissioning: unsafe source path")
    if name in expected:
        raise SystemExit("Commandry commissioning: duplicate source path")
    expected[name] = digest
required = {
    "compose.production.yaml",
    "deploy/commandry-deploy.sh",
    "deploy/commandry-backup-gate.sh",
    "deploy/commandry-app-smoke.sh",
    "deploy/commandry-owner-recover.sh",
    "deploy/commandry-ssh-dispatch.sh",
    "deploy/commandry-deploy.sudoers",
    "deploy/sshd-commandry-deploy.match.example",
}
if not required <= expected.keys():
    raise SystemExit("Commandry commissioning: source controls are incomplete")
with tarfile.open(archive, "r:gz") as source:
    members = source.getmembers()
    names = [member.name for member in members]
    if len(names) != len(set(names)) or set(names) != set(expected):
        raise SystemExit("Commandry commissioning: archive path set differs from manifest")
    if any(not member.isfile() for member in members):
        raise SystemExit("Commandry commissioning: archive contains a non-file entry")
    if any(member.size > 10 * 1024 * 1024 for member in members) or sum(member.size for member in members) > 50 * 1024 * 1024:
        raise SystemExit("Commandry commissioning: source archive exceeds the controls size limit")
    for member in members:
        target = pathlib.Path(destination, member.name)
        target.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
        stream = source.extractfile(member)
        if stream is None:
            raise SystemExit("Commandry commissioning: unreadable archive entry")
        digest = hashlib.sha256()
        with target.open("xb") as output:
            for block in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(block)
                output.write(block)
        if digest.hexdigest() != expected[member.name]:
            raise SystemExit("Commandry commissioning: source file hash mismatch")
        target.chmod(0o644)
PY

"$(tool visudo)" -cf "$stage/payload/deploy/commandry-deploy.sudoers" >/dev/null ||
  die 'sudoers candidate is invalid'
cp -p -- "$sshd_config" "$stage/sshd_config.original"
cp -p -- "$sshd_config" "$stage/sshd_config.candidate"
printf '\n' >> "$stage/sshd_config.candidate"
cat -- "$stage/payload/deploy/sshd-commandry-deploy.match.example" >> "$stage/sshd_config.candidate"
printf '    PubkeyAuthentication yes\n    AuthorizedKeysCommand none\n    TrustedUserCAKeys none\n    AllowStreamLocalForwarding no\n    DisableForwarding yes\n' >> "$stage/sshd_config.candidate"
"$(tool sshd)" -t -f "$stage/sshd_config.candidate" || die 'sshd candidate syntax is invalid'
for real_context in "$tailnet_context" "$public_context"; do
  client_addr=${real_context#*addr=}
  client_addr=${client_addr%%,*}
  ip_context="host=$client_addr,${real_context#*,}"
  for context in "$real_context" "$ip_context"; do
    effective=$("$(tool sshd)" -T -f "$stage/sshd_config.candidate" \
      -C "user=commandry-deploy,$context") || die "sshd candidate effective configuration failed for $context"
    for line in \
      'forcecommand /usr/local/sbin/commandry-ssh-dispatch' \
      'authorizedkeysfile /etc/ssh/authorized_keys/commandry-deploy' \
      'authorizedkeyscommand none' \
      'trustedusercakeys none' \
      'authenticationmethods publickey' \
      'passwordauthentication no' \
      'kbdinteractiveauthentication no' \
      'pubkeyauthentication yes' \
      'permittty no' \
      'allowtcpforwarding no' \
      'allowagentforwarding no' \
      'allowstreamlocalforwarding no' \
      'x11forwarding no' \
      'permittunnel no' \
      'disableforwarding yes' \
      'permituserrc no'; do
      grep -Fxq -- "$line" <<< "$effective" || die "sshd effective setting missing for $context: $line"
    done
  done
done

# Arm cleanup before mv; a caught signal may run between mv and the next line.
created_base=1
mv -T -- "$stage/payload" "$base"
install -d -m 0755 "$base/runtime"
install -m 0755 "$stage/node" "$base/runtime/node"
install -m 0755 "$stage/restic" "$base/runtime/restic"
for name in commandry-deploy commandry-backup-gate commandry-app-smoke commandry-ssh-dispatch; do
  installed_wrappers+=("$name")
  install -m 0755 "$base/deploy/$name.sh" "$bin_parent/$name"
done
installed_wrappers+=(commandry-owner-recover)
install -m 0750 "$base/deploy/commandry-owner-recover.sh" "$bin_parent/commandry-owner-recover"
created_config=1
created_state=1
install -d -m 0700 "$private_config" "$private_config/cloudflared" "$private_state"
install -m 0600 -- "$stage/sshd_config.original" "$private_state/sshd_config.before-commission"
if [[ ! -d "$auth_dir" ]]; then
  created_auth_dir=1
  install -d -m 0755 "$auth_dir"
fi
printf 'restrict,command="/usr/local/sbin/commandry-ssh-dispatch" %s\n' \
  "$(cat -- "$stage/deploy.pub")" > "$stage/authorized-key"
installed_key=1
install -m 0600 "$stage/authorized-key" "$auth_file"
installed_sudo=1
install -m 0440 "$base/deploy/commandry-deploy.sudoers" "$sudo_file"
trusted_directory "$auth_dir"
expected_uid=0
if [[ -n "$test_root" ]]; then expected_uid=$EUID; fi
for item in "$auth_file:600" "$sudo_file:440"; do
  path=${item%:*}
  expected_mode=${item#*:}
  [[ -f "$path" && ! -L "$path" ]] || die "installed access control is missing or symlinked: $path"
  read -r uid mode < <(stat -c '%u %a' -- "$path")
  [[ "$uid" == "$expected_uid" && "$mode" == "$expected_mode" ]] ||
    die "installed access control has an unsafe owner or mode: $path"
done
"$(tool visudo)" -cf "$sudo_file" >/dev/null || die 'installed sudoers rule is invalid'
created_identity=1
"$(tool useradd)" --system --user-group --no-create-home --home-dir /nonexistent \
  --shell /bin/sh --password '!' commandry-deploy
shadow=$("$(tool getent)" shadow commandry-deploy) || die 'deploy shadow entry is missing'
[[ "${shadow#*:}" == \!* ]] || die 'deploy password is not locked'
[[ $("$(tool id)" -nG commandry-deploy) == commandry-deploy ]] ||
  die 'deploy account has supplementary groups'

sshd_temp=$(mktemp "$ssh_parent/.sshd_config.commandry.XXXXXXXX")
cp -p -- "$stage/sshd_config.candidate" "$sshd_temp"
# The original is secured above, so rollback can be armed before replacement.
sshd_changed=1
mv -T -- "$sshd_temp" "$sshd_config"
sshd_temp=
"$(tool systemctl)" reload ssh || die 'SSH reload failed; original configuration will be restored'
completed=1
printf 'Commandry inert controls and restricted deploy identity installed. No production service or ingress was started.\n'
