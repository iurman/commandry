#!/usr/bin/env bash
# Install as /usr/local/sbin/commandry-backup-gate, root owned, mode 0755.
set -euo pipefail
[[ $EUID -eq 0 && $# -eq 4 && "$1" == predeploy && \
  "$2" == /var/lib/commandry/predeploy-backup.receipt ]] || {
  printf 'Commandry backup gate rejected the invocation.\n' >&2
  exit 1
}
exec /usr/bin/env -i HOME=/root PATH=/usr/sbin:/usr/bin:/sbin:/bin \
  DOCKER_HOST=unix:///var/run/docker.sock /usr/bin/node \
  /opt/commandry/scripts/commandry-backup-gate.mjs "$@"
