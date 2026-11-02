# Browser isolation verification

**Status: Operational**

Verified November 2, 2026, on the existing Bazzite host Podman through its Flatpak bridge. No host packages or production services were changed.

- Guard regression suite: 7 passed, including all observed vulnerable browser versions, sandbox bypass options, missing executables, endpoint restrictions and tracked source coverage.
- Isolated runner smoke: passed in 13.3 seconds, including the image cache/build path and container cleanup.
- Actual browser: Debian Chromium 156.0.8078.73. Chromium reported active PID namespaces, network namespaces and Seccomp-BPF sandboxing.
- Real browser checks: local HTTP fixture, button interaction, PNG screenshot, rejection of an unapproved host port, and a connection attempting to replace the executable and turn sandboxing off. The gateway retained the approved options.
- Runtime inspection: no filesystem mounts. The runner stops and removes its own container after the command.
- Package commands: `browser:isolated` and `browser:check` in `./package.json`.
- Configuration, types, lint and normal Git hook evidence are reconciled before final handoff.

The smoke runs only synthetic local HTML. It does not certify the entire application's journeys, databases, production service, Firefox/WebKit, headed display or visual baselines. Existing application fixtures and setup remain required. The Chromium service has ordinary outbound networking; it is not a LAN egress firewall.
