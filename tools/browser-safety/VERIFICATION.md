# Browser isolation verification

**Status: Operational**

Verified November 2, 2026, on the existing Bazzite host Podman through its Flatpak bridge. No host packages or production services were changed.

- Guard regression suite: 7 passed, including all observed vulnerable browser versions, sandbox bypass options, missing executables, endpoint restrictions and tracked source coverage.
- Isolated runner smoke: passed in 13.3 seconds, including the image cache/build path and container cleanup.
- Actual browser: Debian Chromium 156.0.8078.73. Chromium reported active PID namespaces, network namespaces and Seccomp-BPF sandboxing.
- Real browser checks: local HTTP fixture, button interaction, PNG screenshot, rejection of an unapproved host port, and a connection attempting to replace the executable and turn sandboxing off. The gateway retained the approved options.
- Runtime inspection: no filesystem mounts. The runner stops and removes its own container after the command.
- Package commands: `browser:isolated` and `browser:check` in `./package.json`.
- Tooling lint and the typed Playwright adapter check passed. The Node guard checks also run in a dedicated GitHub Actions job without installing project dependencies.
- Node checks use the explicit `.checks.mjs` filename so application Vitest suites do not collect them.

The smoke runs only synthetic local HTML. It does not certify the entire application's journeys, databases, production service, Firefox/WebKit, headed display or visual baselines. Existing application fixtures and setup remain required. The Chromium service has ordinary outbound networking; it is not a LAN egress firewall.

Configuration and typed adapter checks pass. Full application test collection needs the normal built workspace packages; no complete application journey pass is claimed.

Draft review: https://github.com/iurman/commandry/pull/57
