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

## Verification and review

All twelve repositories passed seven guard tests each, 84 total. All twelve passed a real isolated browser smoke with patched Chromium 156.0.8078.73, active PID/network namespaces and Seccomp-BPF, local HTTP, interaction, PNG capture, rejection of an unapproved host port and rejection of unsafe launch-header overrides. Eleven typed Playwright adapter checks passed; Wrenscribe uses the checked JavaScript screenshot entrypoint. Tooling lint passed, including Costello's Biome rules. IYU's required production build passed. DontWakeUp and ResuPals passed their normal commit hooks.

Node checks now have a dedicated dependency-free CI job and a `.checks.mjs` filename so Vitest does not collect Node test cases. Commandry's disposable owner-auth workflow receives only its explicit loopback fixture port. Tidefern exposes its package command at the monorepo root and allows its existing database-free test port 3001. An unchanged Foreset balance test used a stale calendar date; its fixture now uses the existing household date helper, with a passing focused regression. Production account logic is unchanged.

| Repository | Review |
| --- | --- |
| dontWakeUp | [iurman/dontWakeUp PR](https://github.com/iurman/dontWakeUp/pull/3) |
| tome-and-quill | [iurman/tome-and-quill PR](https://github.com/iurman/tome-and-quill/pull/118) |
| commandry | [iurman/commandry PR](https://github.com/iurman/commandry/pull/57) |
| costellourman.party | [iurman/costellourman.party PR](https://github.com/iurman/costellourman.party/pull/21) |
| aviune | [iurman/aviune PR](https://github.com/iurman/aviune/pull/3) |
| iyulabs | [iurman/iyulabs PR](https://github.com/iurman/iyulabs/pull/3) |
| resupals | [iurman/resupals PR](https://github.com/iurman/resupals/pull/191) |
| foreset | [iurman/foreset PR](https://github.com/iurman/foreset/pull/9) |
| decideMyFood | [iurman/decideMyFood PR](https://github.com/iurman/decideMyFood/pull/5) |
| tidefern | [iurman/tidefern PR](https://github.com/iurman/tidefern/pull/113) |
| wrenscribe | Local changes tested; commit/push awaiting owner authorization under its AGENTS.md rule |
| cardiac-companion | [iurman/cardiac-companion PR](https://github.com/iurman/cardiac-companion/pull/7) |

These are review branches. No merge or production deployment has been performed. Existing checkouts do not gain the safeguards until the change is integrated. Hosted application CI is separate from the measured local tool checks and may still be running on the latest push.

Full application collection in Commandry requires its normal built workspace packages; Cardiac Companion requires its normal generated local fixture file. These are not complete application journey passes. Firefox/WebKit remain separate engines. Lighthouse uses a guarded patched local browser. The service does not qualify unrelated rendering runtimes, headed display or visual baselines. No host package installation, provider configuration change, database mutation or CRM edit was performed.

## Sources

- [Chrome security release](https://chromereleases.googleblog.com/2026/10/stable-channel-update-for-desktop_0562499947.html).
- [Playwright container and remote browser documentation](https://playwright.dev/docs/docker).
- [Debian Chromium security package](https://packages.debian.org/bookworm/chromium).
