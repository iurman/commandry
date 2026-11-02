# Local browser and QA isolation

**Status: Operational**

The owner authorized browser and QA tooling containers plus safeguards for all twelve identified non-CRM repositories on November 2, 2026. Full application development containers, production deployments, and CRM changes are outside this scope.

## Delivery

Each repository has a self-contained `tools/browser-safety/` runner, security floor, launch guard, seccomp policy, smoke test, regression test, and runbook. Chromium runs in a temporary unprivileged container without source, home, credential, profile, or container-socket mounts. Existing test code and outputs stay where they already live. Normal local servers and disposable fixtures remain the source of application data.

The runner uses Debian security Chromium at or above 156.0.8078.73 and the repository's installed Playwright version. Every start verifies real Chromium namespace and Seccomp-BPF status. A loopback-only gateway fixes launch options before forwarding to the documented Playwright run-server transport. Client requests cannot replace the executable or turn off the sandbox. Host port forwarding is limited to explicit application ports; ordinary outbound and LAN networking remain available.

| Repository | Package directory | Local command |
| --- | --- | --- |
| dontWakeUp | `.` | `pnpm browser:isolated pnpm e2e` |
| tome-and-quill | `.` | `npm run browser:isolated -- npm run e2e` |
| commandry | `.` | `pnpm browser:isolated pnpm test:e2e` |
| costellourman.party | `.` | `pnpm browser:isolated pnpm test:e2e` |
| aviune | `.` | `pnpm browser:isolated pnpm test` |
| iyulabs | `.` | `pnpm browser:isolated pnpm test:e2e` |
| resupals | `.` | `pnpm browser:isolated pnpm test:e2e` |
| foreset | `.` | `pnpm browser:isolated pnpm test:e2e` |
| decideMyFood | `.` | `npm run browser:isolated -- npm run test:e2e` |
| tidefern | `apps/web` | `pnpm browser:isolated pnpm test:e2e` |
| wrenscribe | `site` | `npm run browser:isolated -- npm run og` |
| cardiac-companion | `web` | `pnpm browser:isolated pnpm test:e2e` |

## Verification and remaining work

- Guard tests currently pass in all twelve repositories: seven assertions groups each, 84 total tests.
- The Commandry isolated smoke passes version, actual sandbox startup, local HTTP, interaction, screenshot, an unapproved-port rejection, and a client attempt to replace launch options.
- Cross-version and per-repository configuration checks are in progress. Per-repository `tools/browser-safety/VERIFICATION.md` records the final evidence.
- Existing CI browser commands are routed through the isolated runner. Hooks and application verification requirements remain active.
- No production deployments, provider configuration changes, host package installations, database mutations, or CRM edits are authorized by this delivery.
- Firefox/WebKit remain separate engines. The isolation service is Chromium-only. Lighthouse uses a guarded patched local browser rather than this protocol endpoint. Custom headed launch flags are not forwarded.

## Sources

- [Chrome security release](https://chromereleases.googleblog.com/2026/10/stable-channel-update-for-desktop_0562499947.html).
- [Playwright container and remote browser documentation](https://playwright.dev/docs/docker).
- [Debian Chromium security package](https://packages.debian.org/bookworm/chromium).
