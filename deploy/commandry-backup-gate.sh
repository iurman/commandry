#!/usr/bin/env bash
# Install as /usr/local/sbin/commandry-backup-gate, root owned, mode 0755.
# A repository copy accepts --test-root only for a disposable local rehearsal.
set -euo pipefail
umask 077
installed_path=/usr/local/sbin/commandry-backup-gate
script_path=$(realpath "$0")
if [[ "$script_path" == "$installed_path" ]]; then
  [[ $EUID -eq 0 ]] || {
    printf 'Commandry backup gate requires root.\n' >&2
    exit 1
  }
  base=/opt/commandry
  state_dir=/var/lib/commandry
  expected_uid=0
else
  [[ $# -ge 3 && "$1" == --test-root && -d "$2" ]] || {
    printf 'Use --test-root with an existing disposable directory.\n' >&2
    exit 1
  }
  test_root=$(realpath "$2")
  shift 2
  base=$test_root/opt/commandry
  state_dir=$test_root/var/lib/commandry
  expected_uid=$EUID
fi
if [[ $# -eq 4 && "$1" == predeploy && \
  "$2" == "$state_dir/predeploy-backup.receipt" ]]; then
  entry=commandry-backup-gate.mjs
elif [[ $# -eq 1 && "$1" == nightly ]]; then
  entry=commandry-scheduled-backup.mjs
elif [[ $# -eq 1 && "$1" == health ]]; then
  entry=commandry-backup-health.mjs
elif [[ $# -eq 1 && "$1" == alert ]]; then
  entry=commandry-backup-alert.mjs
elif [[ $# -eq 1 && "$1" == monthly ]]; then
  entry=commandry-monthly-restore.mjs
else
  printf 'Commandry backup gate rejected the invocation.\n' >&2
  exit 1
fi
runtime_dir=$base/runtime
script_dir=$base/scripts
node_bin=$runtime_dir/node
restic_bin=$runtime_dir/restic
controlled_paths=("$base" "$runtime_dir" "$script_dir" "$node_bin" \
  "$script_dir/commandry-backup-gate.mjs" \
  "$script_dir/commandry-scheduled-backup.mjs" \
  "$script_dir/commandry-backup-health.mjs" \
  "$script_dir/commandry-monthly-restore.mjs" \
  "$script_dir/host-backup-config.mjs" \
  "$script_dir/host-backup-status.mjs" \
  "$script_dir/restic-postgres.mjs" \
  "$script_dir/restic-host-bundle.mjs" \
  "$script_dir/restic-host-recovery.mjs" \
  "$script_dir/restic-isolated-restore.mjs" \
  "$script_dir/r2-repository.mjs" \
  "$script_dir/container-runtime.mjs" \
  "$script_dir/stream-process.mjs")
if [[ "$entry" == commandry-backup-alert.mjs ]]; then
  controlled_paths+=("$script_dir/commandry-backup-alert.mjs")
fi
if [[ "$entry" != commandry-backup-health.mjs && \
  "$entry" != commandry-backup-alert.mjs ]]; then
  controlled_paths+=("$restic_bin")
fi
for path in "${controlled_paths[@]}"; do
  [[ ! -L "$path" ]] || {
    printf 'Commandry backup gate rejected an untrusted controlled path.\n' >&2
    exit 1
  }
  [[ -e "$path" ]] || {
    printf 'Commandry backup gate needs root-owned source and runtime files under %s.\n' "$base" >&2
    exit 1
  }
  read -r uid mode_text < <(stat -c '%u %a' "$path")
  [[ "$uid" == "$expected_uid" && "$mode_text" =~ ^[0-7]{3,4}$ ]] || {
    printf 'Commandry backup gate rejected an untrusted controlled owner or mode.\n' >&2
    exit 1
  }
  permissions=$((8#$mode_text))
  (( (permissions & 8#022) == 0 )) || {
    printf 'Commandry backup gate rejected a writable controlled path.\n' >&2
    exit 1
  }
done
[[ -d "$base" && -d "$runtime_dir" && -d "$script_dir" && \
  -f "$node_bin" && -x "$node_bin" ]] || {
  printf 'Commandry backup gate needs controlled source and an executable Node.js 24 binary.\n' >&2
  exit 1
}
node_version=$("$node_bin" --version) || {
  printf 'Commandry backup gate could not inspect the Node.js runtime.\n' >&2
  exit 1
}
[[ "$node_version" =~ ^v24\.[0-9]+\.[0-9]+$ ]] || {
  printf 'Commandry backup gate requires Node.js 24.\n' >&2
  exit 1
}
if [[ "$entry" != commandry-backup-health.mjs && \
  "$entry" != commandry-backup-alert.mjs ]]; then
  [[ -f "$restic_bin" && -x "$restic_bin" ]] || {
    printf 'Commandry backup gate needs an executable restic binary.\n' >&2
    exit 1
  }
  "$restic_bin" version >/dev/null || {
    printf 'Commandry backup gate could not inspect restic.\n' >&2
    exit 1
  }
fi
if [[ "$entry" == commandry-scheduled-backup.mjs || \
  "$entry" == commandry-monthly-restore.mjs || \
  "$entry" == commandry-backup-alert.mjs ]]; then
  [[ ! -L "$state_dir" && -d "$state_dir" ]] || {
    printf 'Commandry host operation needs a private state directory.\n' >&2
    exit 1
  }
  read -r state_uid state_mode < <(stat -c '%u %a' "$state_dir")
  [[ "$state_uid" == "$expected_uid" && "$state_mode" == 700 ]] || {
    printf 'Commandry host operation rejected the state directory owner or mode.\n' >&2
    exit 1
  }
  if [[ "$entry" == commandry-backup-alert.mjs ]]; then
    lock_file=$state_dir/backup-alert.lock
  else
    lock_file=$state_dir/deploy.lock
  fi
  [[ ! -L "$lock_file" ]] || {
    printf 'Commandry host operation rejected a symlinked lock.\n' >&2
    exit 1
  }
  exec 9> "$lock_file"
  if [[ "$entry" == commandry-backup-alert.mjs ]]; then
    flock -n 9 || exit 0
  else
    flock -w 900 9 || {
      printf 'Commandry nightly backup could not acquire the deployment lock.\n' >&2
      exit 1
    }
  fi
fi
exec /usr/bin/env -i HOME=/root PATH=/usr/sbin:/usr/bin:/sbin:/bin \
  DOCKER_HOST=unix:///var/run/docker.sock "$node_bin" \
  "$base/scripts/$entry" "$@"
