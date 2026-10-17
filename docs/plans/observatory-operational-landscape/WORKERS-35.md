# Reduce redundant browser observations without weakening acceptance

## Goal

Remove measured redundant browser observation handoffs from the original master and global-F1 journeys. Preserve the original interactions, current-scene identity, complete population assertions and release gates. This is a test-control correction, not a measured product rendering or hardware fix.

## Non-goals

No product, database, API, authorization, source configuration, renderer, geometry, fixture population, timeout, retry, skip, tolerance, worker-count or deployment change. No collector restart: the retained hosted population is already complete and stable.

## Base

- branch: loop/observatory-observation-base-t39
- check command: PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm boundaries:check
- probes: none; local task, owner forbids prerequisite remote write probes

## Interfaces

```json
[
  {
    "file": "packages/contracts/src/infrastructure-overview.ts",
    "symbol": "InfrastructureOverview",
    "kind": "type"
  }
]
```

## Tasks

```json
{
  "task_id": "T39",
  "title": "Reduce redundant browser observations in unchanged journeys",
  "goal": "Reduce redundant browser observation round trips without altering acceptance.",
  "brief": {
    "change": "Atomically sample current scene tuples and mounted collapsed representation IDs while retaining genuine pointer expansion",
    "check": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH PLAYWRIGHT_BASE_URL=http://127.0.0.1:1 pnpm exec playwright test tests/e2e/gravity-master-scene.spec.ts tests/e2e/infrastructure-overview.spec.ts --list"
  },
  "seed_files": [
    "docs/plans/observatory-operational-landscape/WORKERS-35.md",
    "AGENTS.md",
    "docs/project/status.md",
    "docs/product/principles.md",
    "docs/plans/observatory-operational-landscape/T39.md",
    "playwright.config.ts",
    "package.json",
    "tests/e2e/gravity-master-scene.spec.ts",
    "tests/e2e/infrastructure-overview.spec.ts",
    ".agent/context/T39-control/outline-contract.md",
    "packages/contracts/src/infrastructure-overview.ts",
    ".agent/scratch/T39-master-trace/report.md",
    ".agent/scratch/T39-global-trace/report.md"
  ],
  "write_files": [
    "tests/e2e/gravity-master-scene.spec.ts",
    "tests/e2e/infrastructure-overview.spec.ts"
  ],
  "create_files": ["tests/e2e/observatory-outline-observer.ts"],
  "forbidden": [
    "apps",
    "packages",
    ".github",
    "scripts",
    "playwright.config.ts",
    "package.json",
    "pnpm-lock.yaml",
    ".agent/context/T36",
    ".agent/context/T37",
    ".agent/context/T39-control"
  ],
  "acceptance": [
    {
      "id": "A1",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec eslint tests/e2e/gravity-master-scene.spec.ts tests/e2e/infrastructure-overview.spec.ts tests/e2e/observatory-outline-observer.ts",
      "expect": {
        "exit": 0
      },
      "covers": "Scoped browser-test lint"
    },
    {
      "id": "A2",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec prettier --check tests/e2e/gravity-master-scene.spec.ts tests/e2e/infrastructure-overview.spec.ts tests/e2e/observatory-outline-observer.ts",
      "expect": {
        "exit": 0
      },
      "covers": "Scoped test formatting"
    },
    {
      "id": "A3",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH PLAYWRIGHT_BASE_URL=http://127.0.0.1:1 pnpm exec playwright test tests/e2e/gravity-master-scene.spec.ts tests/e2e/infrastructure-overview.spec.ts --list",
      "expect": {
        "exit": 0
      },
      "covers": "All original fifteen cases remain discoverable in the three original projects; actual execution remains a separate root gate"
    }
  ],
  "depends_on": [],
  "size": "M",
  "model": "gpt-6.1-sol",
  "notes": "Verify actual never/Full Access. Exclusive two-test and new observation-utility ownership. You are not alone; preserve others edits. Implement only the evidenced atomic current-DOM tuple and mounted-ID discovery changes described below. No product/private-harness/configuration/build/test execution beyond listed acceptance, no timeout/retry/skip/fixture/ID/tolerance/assertion weakening. Preserve original phases and guarded observational finally behavior. Root owns reviewed isolated baseline/candidate builds, real PostgreSQL18, all15 cases, original2workers and4CPU control, root independent packet rerun and Astra final source/execution review before merge. Do not claim product/GPU performance fixed. Full report .agent/scratch/T39/report.md. Put the bounded observational outline probe in the new utility so root can execute the same probe against missing-commit negative controls without registering another E2E case. Candidate browser verification runs only after these three source paths are normally committed; no dirty non-test source is accepted."
}
```

## Convergence order

T39

## Risks

The actual hosted trace establishes observation cost, not a CPU or GPU root cause. All five global overview pages retain total227, and the admitted scene preserves every91F1 identity plus136extras. The correct current DOM exists before the original5000ms deadline, but three sequential attribute reads do not finish. Sample grouping/view/projection attributes synchronously in one evaluation of the exact existing region. Use that same tuple with the unchanged validated browserScenes lookup and all-ID predicate; keep the subsequent applied-project check and original deadline. Do not choose an arbitrary latest response or assemble attributes across DOM generations.

Master light operational expansion takes51.610s and hosts33.592s. Twelve count calls in those loops consume23.276s and13.634s respectively; real11pointer targets are distinct and local state commits correctly. Discover mounted collapsed representation IDs in one DOM-ordered atomic read per pass, then pointer-click each exact representation's own toggle once. Repeat for newly mounted deeper levels. Reject missing/duplicate IDs, preserve the total103attempt guard and final exact103canonical IDs/count. No forced click, DOM click, hidden child substitution, population shortcut or added per-click protocol wait. The new observational probe must record each real pointer dispatch and its local aria commit, fail if any next dispatch sees a prior target uncommitted or loses a committed expansion, reject duplicate/missing targets, and settle the last target within the existing5000ms guard. Install one probe per complete outline-expansion call and read it per pass, preserving committed history across every pass, with an in-page capture listener and MutationObserver; it must never prevent, replay or replace product events, set DOM attributes or alter UI state. Drain queued mutation records before dispatch/settlement checks. Observe aria-expanded with attributeOldValue so a committed true-to-false-to-true transition cannot disappear before delivery. Record a violation when it happens; later correct state cannot erase it. One bounded end-of-pass acknowledgement may wait for the final commit. Dispose all listeners/observers in finally without masking the original failure. Export this probe from the new test utility so a root-owned genuine-pointer missing-commit negative control executes the actual implementation, not a copied model. The real fixture's completed passes contain no deeper expandable controls; deeper trees can change from depth-first order to mounted-pass order, so do not claim identical intermediate ordering. Completeness and every real pointer interaction remain required. Retain diagnostic target order and batch/action durations through guarded Node-side evidence without adding awaited browser observations inside the original deadline.

## Escalation answers

Only the two tests and the new observational test utility may change. Product paths are read-only reference. Preserve all207 full-suite cases, all15 affected cases, all103master identities, both themes, all groupings, real inspection/lens/screenshots, refresh failure/recovery, F1 complete API fixture and every extra, observer negative controls, context-loss and geometry checks, original180000/120000/5000limits, two workers and zero retries. Existing diagnostics remain best-effort and must not mask the original failure. Source/global-scene completeness and client authority stay intact.

The worker packet's commands prove lint, formatting and discovery only. They do not establish behavioral acceptance. Root must independently reexecute the packet and complete the control below before merge; an independent Astra source/executed-evidence review must accept the result. No unchanged hosted retry.

### Root-owned controlled verification

The full UI module is replaced in the read set by a root-supplied verbatim OutlineNode excerpt and source hash; this prevents unrelated UI imports and test callers from exceeding the scoped read budget. The canonical product file stays unchanged.

First write and independently review new private copies of the T37 controller/preview under .agent/context/T39-control. Preserve unique invocation IDs, matching IPC stop messages, loopback-only PostgreSQL18, private immutable built assets, run-owned output and strict normal cleanup plus actual PID/group/directory absence. Preserve the frozen T36/T37 originals. Compute actual clean/dirty source state and exact source/test/helper/build identity; do not reuse the old hardcoded dirty-candidate claims. Provider polling stays off and no production/private inventory is imported.

Execute the original tests first from the clean completed T37 child at07d833bab5f2c8f85fe59b3666241f0a11ccf9e0, after proving every runtime/test/configuration path byte-equivalent to hosted maina1c760a, then the clean normally committed candidate from its exclusive child, against the same documented mixed synthetic fixture recipe and original fifteen-case/two-worker/zero-retry workload. Limit only each owned controller and descendants to four already-allowed logical CPUs with taskset. Record actual affinity. The [official public-runner specification](https://docs.github.com/en/actions/reference/runners/github-hosted-runners) lists four vCPUs for public ubuntu-24.04 jobs; affinity is a bounded local control, not proof of equivalent actual runner hardware. The local shared-world fixture previously yielded311resources versus227in this hosted transition; record the actual new counts and do not claim world equivalence.

Retain actual failed baseline, candidate outcomes, source hashes, per-phase observation/target evidence, complete scope/ID sets, request/admission/DOM tuple timing, viewport and cleanup results. A candidate pass alone is insufficient if the baseline does not reproduce: report that limit and perform a scoped deterministic observation-boundary control before claiming the reduced-handoff mechanism. Such a model is separate from real browser/product performance evidence. Preserve negative cases for missing region, wrong tuple, stale scope/navigation, missing F1 ID, incomplete population and completion after the unchanged deadline. Do not weaken any acceptance to obtain a pass.

Then require all15 original real built cases and the full207-case main release suite. Only actual full success and immutable publication may advance to the protected approval and constrained deployment workflow.

### Manifest generation isolation

The official generator classifies a repository without root tsconfig.json as Python when any .py exists. This Node/TypeScript repository uses tracked tsconfig.base.json and also contains Python deployment/collector scripts. Both root and fresh-child unmodified checks consequently fail P8 despite the real TypeScript declaration. The root's old ignored worktrees additionally inflate scanning and context. Preserve those failed attempts. Run final preflight/generation in the fresh exclusive T39 checkout, using only exact private Markdown seeds and an exact-target language launcher. It imports the unchanged official generator and selects its existing TypeScript resolver only when its target matches the resolved current inspected checkout; its allowlist contains only this root and that exact child. Marker checks use that same target and every other target retains official language detection. Do not edit installed skills, the resolver/checks/interface extractor, or manifest fields. All original P1-P10 checks remain required. A frozen local base reference records the actual plan/source commit once setup is final; the integration branch remains feat/observatory-operational-landscape.
