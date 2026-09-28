#!/usr/bin/env bash
# Install as /usr/local/sbin/commandry-backup-gate, root owned, mode 0755.
# A repository copy accepts --test-root only for a disposable local rehearsal.
set -euo pipefail
installed_path=/usr/local/sbin/commandry-backup-gate
script_path=$(realpath "$0")
if [[ "$script_path" == "$installed_path" ]]; then
  [[ $EUID -eq 0 && $# -eq 4 ]] || {
    printf 'Commandry backup gate requires root and four approved arguments.\n' >&2
    exit 1
  }
  base=/opt/commandry
  state_dir=/var/lib/commandry
  expected_uid=0
else
  [[ $# -eq 6 && "$1" == --test-root && -d "$2" ]] || {
    printf 'Use --test-root with an existing disposable directory.\n' >&2
    exit 1
  }
  test_root=$(realpath "$2")
  shift 2
  base=$test_root/opt/commandry
  state_dir=$test_root/var/lib/commandry
  expected_uid=$EUID
fi
[[ $# -eq 4 && "$1" == predeploy && \
  "$2" == "$state_dir/predeploy-backup.receipt" ]] || {
  printf 'Commandry backup gate rejected the invocation.\n' >&2
  exit 1
}
runtime_dir=$base/runtime
node_bin=$runtime_dir/node
restic_bin=$runtime_dir/restic
for path in "$base" "$runtime_dir" "$node_bin" "$restic_bin"; do
  [[ ! -L "$path" ]] || {
    printf 'Commandry backup gate rejected an untrusted runtime path.\n' >&2
    exit 1
  }
  [[ -e "$path" ]] || {
    printf 'Commandry backup gate needs root-owned Node.js 24 and restic binaries in %s.\n' "$runtime_dir" >&2
    exit 1
  }
  read -r uid mode_text < <(stat -c '%u %a' "$path")
  [[ "$uid" == "$expected_uid" && "$mode_text" =~ ^[0-7]{3,4}$ ]] || {
    printf 'Commandry backup gate rejected an untrusted runtime owner or mode.\n' >&2
    exit 1
  }
  permissions=$((8#$mode_text))
  (( (permissions & 8#022) == 0 )) || {
    printf 'Commandry backup gate rejected a writable runtime path.\n' >&2
    exit 1
  }
done
[[ -d "$base" && -d "$runtime_dir" && -f "$node_bin" && -x "$node_bin" && \
  -f "$restic_bin" && -x "$restic_bin" ]] || {
  printf 'Commandry backup gate needs executable Node.js 24 and restic binaries.\n' >&2
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
"$restic_bin" version >/dev/null || {
  printf 'Commandry backup gate could not inspect restic.\n' >&2
  exit 1
}
exec /usr/bin/env -i HOME=/root PATH=/usr/sbin:/usr/bin:/sbin:/bin \
  DOCKER_HOST=unix:///var/run/docker.sock "$node_bin" \
  "$base/scripts/commandry-backup-gate.mjs" "$@"
