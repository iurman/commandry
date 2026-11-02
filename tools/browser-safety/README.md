# Local browser safety

**Status: Operational**

Run these commands from `.` in this repository after its normal dependency installation:

```sh
pnpm browser:isolated pnpm test:e2e
pnpm browser:check
```

`browser:isolated` accepts any command and runs it after an isolated Chromium passes version, sandbox and page checks. Keep the application's existing local server and disposable database setup. This runner isolates Chromium; it does not start the application, seed a database, or containerize the coding agent.

The browser runs as UID 1000 with a read-only image, no added capabilities, no-new-privileges, a seccomp policy, a 2 GiB memory limit, two CPU cores, a 512-process limit and temporary memory-backed storage. It has no repository, home, credentials, profiles, or container-socket mounts. Its random WebSocket endpoint is published only on host loopback. Test code, outputs and authentication state stay in their existing repository locations. No project data is copied into the image. The image build context is only this tools directory.

Chromium comes from Debian's security repository, not Playwright's bundled browser. Its actual executable must report at least `156.0.8078.73`; the image build and every service start enforce that floor. A start also checks Chromium's actual PID namespace, network namespace and Seccomp-BPF status. Failed checks stop the command. There is no fallback to an unsandboxed browser. The Playwright client and service versions must match; the runner reads the installed project package version.

The runner forwards only these application ports from browser requests to the host: `3000`. For another local test port, set `SAFE_BROWSER_ALLOWED_PORTS` to a comma-separated list of port numbers on the command invocation. This is an explicit expansion of network access. The container still has ordinary outbound networking, including reachable LAN services; this is filesystem and process isolation, not an egress firewall. It receives only the pages and test data that the selected command sends to it. Use synthetic data and dedicated test accounts.

Direct Chromium scripts and Playwright configs use `browser-safety.cjs`. Outside the isolated runner, they require the same browser version floor and sandboxing. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to a separately maintained patched executable to use that local path. The currently cached older Playwright browsers are intentionally refused. Do not restore `--no-sandbox`, set `chromiumSandbox: false`, or bypass the guard to make a test pass.

The isolated service is Chromium-only. Existing Firefox and WebKit projects keep their separate launch settings; select the relevant Chromium project when running a mixed-engine suite through this runner. Headed display, custom browser launch flags and host filesystem URLs are not forwarded to the isolated browser. Screenshot scripts send their existing HTML or use local HTTP routes instead. Lighthouse uses its own browser launcher and is guarded locally rather than connected to this service. Browser updates can change rendering; regenerate visual evidence only after reviewing the result.

The runner detects local Podman/Docker and existing host Podman through `flatpak-spawn`. It builds a version-matched image, starts a task-specific container, verifies it, runs the command, then stops and removes only that container. Images are reusable build caches. Set `SAFE_BROWSER_REBUILD=1` on the same command to rebuild without cache when changing the security floor or refreshing browser packages; do not treat a cached image as permanently current.

## Sources

- [Chrome's October 27 fixes](https://chromereleases.googleblog.com/2026/10/stable-channel-update-for-desktop_0562499947.html).
- [Playwright sandbox and remote connection guidance](https://playwright.dev/docs/docker).
- [Playwright launch options](https://playwright.dev/docs/api/class-browsertype).
- [Debian Chromium security package](https://packages.debian.org/bookworm/chromium).
- `seccomp_profile.json` derives from [Microsoft Playwright v1.64.1](https://github.com/microsoft/playwright/blob/v1.64.1/utils/docker/seccomp_profile.json), under the [Apache 2.0 license](https://github.com/microsoft/playwright/blob/v1.64.1/LICENSE). It additionally permits `clone3` for current runtimes and `chroot` for Chromium's filesystem jail inside its user namespace. Container capabilities remain dropped.

## Verification

Implementation and verification for this change are recorded in `VERIFICATION.md` beside this file. Application suites require their existing local fixtures and services; the browser smoke does not certify an entire application's behavior or a production deployment.
