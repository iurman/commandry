# Local browser and QA isolation

**Status: Operational**

The owner authorized browser and QA tooling containers plus safeguards for all twelve identified non-CRM repositories on November 2, 2026. The owner subsequently authorized merging all twelve PRs into main and verifying main as every repository's default and production source. Full application development containers, host maintenance and CRM changes remain outside this scope.

## Delivery

Each repository has a self-contained `tools/browser-safety/` runner, security floor, launch guard, seccomp policy, smoke test, regression test, and runbook. Chromium runs in a temporary unprivileged container without source, home, credential, profile, or container-socket mounts. Existing test code and outputs stay where they already live. Normal local servers and disposable fixtures remain the source of application data.

The runner uses Debian security Chromium at or above 156.0.8078.73 and the repository's installed Playwright version. Every start verifies real Chromium namespace and Seccomp-BPF status. A loopback-only gateway fixes launch options before forwarding to the documented Playwright run-server transport. Client requests cannot replace the executable or turn off the sandbox. Host port forwarding is limited to explicit application ports; ordinary outbound and LAN networking remain available.

| Repository          | Package directory | Local command                                                                       |
| ------------------- | ----------------- | ----------------------------------------------------------------------------------- |
| dontWakeUp          | `.`               | `pnpm browser:isolated pnpm e2e --project=iphone-390x844 --project=android-412x915` |
| tome-and-quill      | `.`               | `npm run browser:isolated -- npm run e2e`                                           |
| commandry           | `.`               | `pnpm browser:isolated pnpm test:e2e`                                               |
| costellourman.party | `.`               | `pnpm browser:isolated pnpm test:e2e`                                               |
| aviune              | `.`               | `pnpm browser:isolated pnpm test`                                                   |
| iyulabs             | `.`               | `pnpm browser:isolated pnpm test:e2e`                                               |
| resupals            | `.`               | `pnpm browser:isolated pnpm test:e2e --project=chromium`                            |
| foreset             | `.`               | `pnpm browser:isolated pnpm test:e2e`                                               |
| decideMyFood        | `.`               | `npm run browser:isolated -- npm run test:e2e`                                      |
| tidefern            | `apps/web`        | `pnpm browser:isolated pnpm test:e2e`                                               |
| wrenscribe          | `site`            | `npm run browser:isolated -- npm run og`                                            |
| cardiac-companion   | `web`             | `pnpm browser:isolated pnpm test:e2e`                                               |

## Verification and review

All twelve repositories passed seven guard tests each, 84 total. All twelve passed a real isolated browser smoke with patched Chromium 156.0.8078.73, active PID/network namespaces and Seccomp-BPF, local HTTP, interaction, PNG capture, rejection of an unapproved host port and rejection of unsafe launch-header overrides. Eleven typed Playwright adapter checks passed; Wrenscribe uses the checked JavaScript screenshot entrypoint. Tooling lint passed, including Costello's Biome rules. IYU's required production build passed. DontWakeUp and ResuPals passed their normal commit hooks.

Node checks now have a dedicated dependency-free CI job and a `.checks.mjs` filename so Vitest does not collect Node test cases. Commandry's disposable owner-auth workflow receives only its explicit loopback fixture port. Tidefern exposes its package command at the monorepo root and allows its existing database-free test port 3001. A stale Foreset balance fixture received a focused passing household-date correction; latest main now supplies that same correction and its version is retained. Production account logic is unchanged.

| Repository          | Review                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------- |
| dontWakeUp          | [iurman/dontWakeUp PR](https://github.com/iurman/dontWakeUp/pull/3)                    |
| tome-and-quill      | [iurman/tome-and-quill PR](https://github.com/iurman/tome-and-quill/pull/118)          |
| commandry           | [iurman/commandry PR](https://github.com/iurman/commandry/pull/57)                     |
| costellourman.party | [iurman/costellourman.party PR](https://github.com/iurman/costellourman.party/pull/21) |
| aviune              | [iurman/aviune PR](https://github.com/iurman/aviune/pull/3)                            |
| iyulabs             | [iurman/iyulabs PR](https://github.com/iurman/iyulabs/pull/3)                          |
| resupals            | [iurman/resupals PR](https://github.com/iurman/resupals/pull/191)                      |
| foreset             | [iurman/foreset PR](https://github.com/iurman/foreset/pull/9)                          |
| decideMyFood        | [iurman/decideMyFood PR](https://github.com/iurman/decideMyFood/pull/5)                |
| tidefern            | [iurman/tidefern PR](https://github.com/iurman/tidefern/pull/113)                      |
| wrenscribe          | [iurman/wrenscribe PR](https://github.com/iurman/wrenscribe/pull/3)                    |
| cardiac-companion   | [iurman/cardiac-companion PR](https://github.com/iurman/cardiac-companion/pull/7)      |

The owner authorized main integration. Eight repositories have completed normal merges with ancestry and guard-file verification; the current rollout record below identifies the remaining checks and approvals. Existing local checkouts retain their own working state until explicitly updated. All twelve dedicated browser-policy CI jobs passed after code integration. Longer application qualification is tracked separately from the measured local tool checks. The latest main changes were integrated into Aviune, Foreset, ResuPals, Tidefern and Wrenscribe before handoff. Newly introduced ResuPals help recording, Tidefern byte measurement and Wrenscribe poster generation use the guarded helper. ResuPals additionally passed a real CDP JPEG screencast frame check. Tidefern Lighthouse verifies its local Chromium version.

Tome and Quill, Costello, Aviune, IYU Labs, Decide My Food, ResuPals, Wrenscribe and Commandry have completed normal main merges with verified ancestry. IYU's export follow-up PR 4 is also merged and serving from main. ResuPals full browser CI passes 215 cases with one skip, zero failures and zero flaky results; real D1, source, production build and Worker bundle checks pass. Foreset's current CI is green after its tested authentication patch and additive migration, but production schema readiness still requires owner authorization and database access. Cardiac Companion's checks pass and its required review remains pending.

Full application collection in Commandry requires its normal built workspace packages; Cardiac Companion requires its normal generated local fixture file. These are not complete application journey passes. Firefox/WebKit remain separate engines. Lighthouse uses a guarded patched local browser. The service does not qualify unrelated rendering runtimes, headed display or visual baselines. No host package installation or CRM edit was performed. Existing deployment pauses are preserved. Foreset production migration 0003 requires explicit authorization before activation.

## Sources

- [Chrome security release](https://chromereleases.googleblog.com/2026/10/stable-channel-update-for-desktop_0562499947.html).
- [Playwright container and remote browser documentation](https://playwright.dev/docs/docker).
- [Debian Chromium security package](https://packages.debian.org/bookworm/chromium).

## Main rollout, November 2, 2026

The owner authorized all twelve merges. Both non-main PRs were reapplied onto current main with only the safety commits, preserving the original feature/evidence branches. All twelve GitHub default branches are main. All nine connected Vercel projects report main as their production branch. Vercel provider notification controls are preserved. The createDeployments field controls GitHub deployment records, not automatic Vercel builds; Wrenscribe production already reports its merged main commit. No Vercel deployment control was changed. ResuPals and Costello use Cloudflare Workers; their live Builds settings still require access verification. Commandry's release pipeline and enrolled controller select qualified main releases.

Each normal merge records the previous main and reviewed PR head, then checks that both are ancestors of the resulting main and that the browser guard exists there. The checkpoint below records verified merge results and remaining gates.

The full Commandry release qualification exposed pre-existing high/critical dependency findings. The merge branch updates Better Auth and its Drizzle adapter from 1.7.6 to 1.7.15, updates Zod to 4.6.6 throughout the workspace and pins vulnerable transitive Zod and Undici resolutions to patched versions. This remains within the existing auth schema generation and does not add a migration. Production audit after the update reports no high or critical findings. Existing source, contract, unit, populated-upgrade and exact-image gates remain enabled.

## Rollout checkpoint

| Repository          | Main integration                                     | Production source                                        |
| ------------------- | ---------------------------------------------------- | -------------------------------------------------------- |
| tome-and-quill      | Merged, verified: `4afaf5bf8b9d`                     | Vercel: main verified                                    |
| commandry           | Merged plus readiness follow-up: `559deafe1ee6`      | Qualified main controller                                |
| costellourman.party | Merged, verified: `c83a4a008d55`                     | Main release policy; live Builds settings access pending |
| aviune              | Merged, verified: `615428df4f62`                     | Vercel: main verified                                    |
| iyulabs             | Merged plus export follow-up: `7e09b104d22a`         | Vercel: main verified                                    |
| foreset             | All CI green; production migration approval required | Vercel: main verified                                    |
| decideMyFood        | Merged, verified: `63d2072d4340`                     | Vercel: main verified                                    |
| tidefern            | Merged, verified: `2e2516efc9a0`                     | Vercel: main verified                                    |
| cardiac-companion   | Passing checks; owner review/admin decision required | Vercel: main verified                                    |
| dontWakeUp          | Qualification running                                | Vercel: main verified                                    |
| resupals            | Merged, verified: `675544214fad`                     | Main release policy; live Builds settings access pending |
| wrenscribe          | Merged, verified: `8d7ea78b1a41`                     | Vercel: main verified                                    |

The default branch of every listed GitHub repository is main. No branch-protection rule was disabled. Cardiac Companion main requires one approving review and rejected the normal merge; the owner decision is pending. Foreset requires its additive 2FA migration before Vercel activates the upgraded auth library. Both blockers were presented to the owner while the independent qualification continued.

Commandry's complete branch rehearsal [41549517699](https://github.com/iurman/commandry/actions/runs/41549517699) passes the exact-image gates and all 207 browser identities: 202 passed, five reviewed skips, no failures, flaky results or retries. Its subsequent merged-main run found two agent-choice tests racing the initial asynchronous read. A readiness follow-up holds the real first routing response until the empty state is observed, then waits for the requested option or pagination control and for each next page to settle. All six MCP/overnight journeys pass against the built app and disposable PostgreSQL across desktop and both phone views. The overnight fixture derives its local datetime in the browser's timezone. No production behavior or release gate is changed. The merged-main qualification [41554524550](https://github.com/iurman/commandry/actions/runs/41554524550) passes all release jobs and publishes its exact image: 207 identities, 202 passed, five reviewed skips and no failures, flakes or retries. Public production still reports the previous release `c83cea7dc8cb` at the November 2 checkpoint. The workflow now wraps its existing browser commands in the isolated runner; that file participates in the enrolled release-control fingerprint. No migration files changed. Root-only live policy and rejection evidence are unavailable through the current operator session. Activation and any required control enrollment remain separate from main integration; the host-change hold and existing controller are preserved.

Tidefern's final [full CI run](https://github.com/iurman/tidefern/actions/runs/41553086310) passes all 385 browser cases. Its required verify and both CodeQL contexts passed before the normal merge. The optional Vercel preview was pending at merge; production now serves merged main `2e2516efc9a0` in READY state. Each independent theme audit starts from neutral body focus, retaining all axe, keyboard, menu and reflow assertions.

DontWakeUp's local integration checks pass for the actual WebM encoder stream, all three recording journeys, tutorial recovery through reload, launcher and salt 90-state geometry, the three-viewport input-composition walk, playground and all four layout profiles. Its final census has 102 identities across disjoint 35/33/34-case shards with a complete union. Each layout profile retains the original five-minute bound and all assertions. The required verify gate checks the actual API result for source checks and each shard on the reviewed commit, rejecting missing, canceled, skipped, pending or wrong-commit results. Nine verifier regressions and seven browser guard checks pass. Full CI on the final head is still required before merge.

At this checkpoint nine of the twelve affected repositories are merged. All twelve GitHub default branches and all nine connected Vercel production branch settings were freshly read back as main. Six merged Vercel applications serve their merged commits in READY state. Cardiac Companion and Foreset remain on their previous production commits pending their respective review and migration gates; DontWakeUp remains in qualification. The Cloudflare dashboard still requires owner sign-in to verify live Builds settings for ResuPals and Costello. No claim is made that these two provider settings were changed or verified.
