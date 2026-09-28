#!/usr/bin/env bash
# Install as /usr/local/sbin/commandry-ssh-dispatch, root owned, mode 0755.
# The repository copy accepts --test-root only in a disposable local fixture.
set -euo pipefail
umask 077

installed_path=/usr/local/sbin/commandry-ssh-dispatch
script_path=$(realpath "$0")
if [[ "$script_path" == "$installed_path" ]]; then
  [[ $# -eq 0 && $EUID -ne 0 && $(id -un) == commandry-deploy ]] || {
    printf 'Commandry SSH dispatch rejected the identity or arguments.\n' >&2
    exit 1
  }
  sudo_bin=/usr/bin/sudo
  deploy_bin=/usr/local/sbin/commandry-deploy
else
  [[ $# -eq 2 && "$1" == --test-root && -d "$2" ]] || {
    printf 'Use --test-root with an existing disposable directory.\n' >&2
    exit 1
  }
  test_root=$(realpath "$2")
  sudo_bin=$test_root/usr/bin/sudo
  deploy_bin=$test_root/usr/local/sbin/commandry-deploy
fi

[[ -z ${SSH_ORIGINAL_COMMAND:-} && -z ${SSH_TTY:-} ]] || {
  printf 'Commandry SSH dispatch rejected a requested command or TTY.\n' >&2
  exit 1
}
[[ -f "$sudo_bin" && -x "$sudo_bin" && -f "$deploy_bin" && -x "$deploy_bin" ]] || {
  printf 'Commandry SSH dispatch needs the controlled deploy command.\n' >&2
  exit 1
}
exec /usr/bin/env -i HOME=/nonexistent PATH=/usr/sbin:/usr/bin:/sbin:/bin \
  "$sudo_bin" -n "$deploy_bin"
