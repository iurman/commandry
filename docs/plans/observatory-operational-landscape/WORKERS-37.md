# Measure cumulative browser execution cost

## Goal

Capture opt-in native CPU profiles of the test runner and browser renderer while preserving the original acceptance journey. The previous clean four-CPU candidate passed 13 of 15 cases; its desktop tests exhausted their original total budgets. No renderer or scheduling repair is selected without measurement.

## Non-goals

No product behavior, renderer quality, population, authority, fixtures, original test bodies, deadlines, retries, skips, workers, source activation or deployment changes. Profiling trials do not establish release acceptance.

## Base

- branch: loop/observatory-observation-base-t41
- check command: PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm boundaries:check
- probes: none; local task, no prerequisite remote write probes

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
  "task_id": "T41",
  "title": "Measure native browser and runner CPU during unchanged acceptance",
  "goal": "Add opt-in diagnostic native CPU sampling around the original browser tests.",
  "brief": {
    "change": "Add default-off native profiler hooks without changing any test body",
    "check": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH PLAYWRIGHT_BASE_URL=http://127.0.0.1:1 pnpm exec playwright test tests/e2e/gravity-master-scene.spec.ts tests/e2e/infrastructure-overview.spec.ts --list"
  },
  "seed_files": [
    "docs/plans/observatory-operational-landscape/WORKERS-37.md",
    "AGENTS.md",
    "docs/project/status.md",
    "docs/product/principles.md",
    "playwright.config.ts",
    "package.json",
    "tests/e2e/gravity-master-scene.spec.ts",
    "tests/e2e/infrastructure-overview.spec.ts",
    "packages/contracts/src/infrastructure-overview.ts",
    ".agent/context/T41-control/profiling-api.md",
    ".agent/context/T41-control/packet-command.md"
  ],
  "write_files": [
    "tests/e2e/gravity-master-scene.spec.ts",
    "tests/e2e/infrastructure-overview.spec.ts"
  ],
  "create_files": ["tests/e2e/observatory-diagnostic-profile.ts"],
  "forbidden": [
    "apps",
    "packages",
    ".github",
    "scripts",
    "playwright.config.ts",
    "package.json",
    "pnpm-lock.yaml",
    "tests/e2e/observatory-outline-observer.ts",
    ".agent/context"
  ],
  "acceptance": [
    {
      "id": "A1",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec eslint tests/e2e/gravity-master-scene.spec.ts tests/e2e/infrastructure-overview.spec.ts tests/e2e/observatory-diagnostic-profile.ts",
      "expect": {
        "exit": 0
      },
      "covers": "Scoped lint"
    },
    {
      "id": "A2",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec prettier --check tests/e2e/gravity-master-scene.spec.ts tests/e2e/infrastructure-overview.spec.ts tests/e2e/observatory-diagnostic-profile.ts",
      "expect": {
        "exit": 0
      },
      "covers": "Scoped formatting"
    },
    {
      "id": "A3",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH PLAYWRIGHT_BASE_URL=http://127.0.0.1:1 pnpm exec playwright test tests/e2e/gravity-master-scene.spec.ts tests/e2e/infrastructure-overview.spec.ts --list",
      "expect": {
        "exit": 0
      },
      "covers": "All original fifteen title/project pairs, default-off discovery; actual controls and paired execution are separate root gates"
    }
  ],
  "depends_on": [],
  "size": "S",
  "model": "gpt-6.1-sol",
  "notes": "Verify actual never/Full Access. You are not alone; preserve others edits. Exclusive ownership of two spec imports and one file-level installDiagnosticProfiling(test) registration plus the new test-only utility. Preserve all original test body bytes, titles, assertions, timeouts, fixture and configuration. No new test titles. Implement the detailed diagnostic-only contract below with stable callback node:inspector and own-page CDPSession. Default off. Root owns real helper controls, matched same-source off/on four-CPU runs, optional owned /proc sampler and independent Astra profile review. Stage only these three source paths; build the concrete mandatory packet; do not commit. Full report .agent/scratch/T41/report.md."
}
```

## Convergence order

T41

## Risks

Only imports and one file-level registration may change in each spec. Original bodies remain byte-identical. The utility returns immediately unless COMMANDRY_E2E_DIAGNOSTIC_PROFILE=1; disabled mode registers no hooks and creates no session, timer, network request or file. The helper remains test-only. Export startDiagnosticProfile(page, context) as a small direct entry for root controls, and installDiagnosticProfiling(test) as its default-off hook installer. Use an explicit narrow context type for outputPath, test identity, project, worker and current timeout/status; avoid a fabricated full TestInfo implementation in controls.

Enabled hooks create one same-process node:inspector callback Session, connected without a TCP listener, and one own-page CDPSession. Use Profiler.enable, setSamplingInterval with interval 5000 microseconds, start and stop. Browser Performance metrics and optional browser-scoped SystemInfo GPU information must be labeled raw observations. Sampling does not measure GPU shader time. Do not take heap snapshots, pause scripts, evaluate arbitrary page code, change app state, install private Playwright patches or expose a debugger port.

Retain periodic chunks about every 20 seconds so a test timeout cannot erase every profile. Serialize stop/save/restart checkpoints, prevent overlapping work, unref the timer, and make final stop idempotent. Write native profiles and an index only beneath testInfo.outputPath with UTC and process monotonic calibration brackets around start/stop calls, native profile clock bounds, actual interval, chunk number, Node/browser versions, test and project identity, current timeout/status, errors and cleanup results. Record metric clocks separately; do not subtract unrelated clocks or treat frame cadence as CPU duration. Record callback/transport and save overhead. Do not assume the beforeEach timeout is the later test body timeout.

Final hooks clear timers and detach/disconnect owned sessions even after page closure or failed setup. Keep already saved chunks, record partial/failure status precisely, and preserve the original assertion or timeout as the test failure. Profiling errors are diagnostic errors, never valid measurements or grounds to mask the original test failure. Avoid indefinite final hook work if a session is closed. Any synthetic/control-only shortcut remains outside the production acceptance specs.

Root will execute the actual compiled committed utility against a real Chromium page, including disabled/no-registration, enabled chunk/final-stop, a known busy JavaScript span, and page-closed cleanup. Root separately records owned runtime process CPU ticks, roles and actual affinity if needed, with no broad environment or credential reads. Run the original fifteen cases first with profiling off and then on from the same clean source, original two workers and actual four-CPU affinity, retaining both outcomes and strict normal cleanup. Compare time spans as diagnostic observations, qualify one-pair variance and profiler overhead, and independently review profiles before selecting a repair. Neither a failed diagnostic trial nor a profiled pass authorizes a release-facing PR. The original fifteen-case unprofiled gate and full 207-case main release still apply.

## Escalation answers

The root supplies primary API references and concrete packet command in allowed private seeds. Use the installed Node 24 callback inspector API and Playwright CDPSession; no dependencies. No tracing monkey patches, TCP debugger, module preloads, assertions, forced actions or population reductions. The existing reviewed runner/preview helpers remain unchanged. The root will own private experiment scripts and exact process cleanup.

The official generator misidentifies this tsconfig.base.json TypeScript repository as Python. Use the independently reviewed private exact-target launcher selecting the existing TypeScript resolver for only this root and fresh T41 checkout. Preserve P1-P10 and schemas; generate manifest fields only through official functions.
