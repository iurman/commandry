# Calibrate complete browser journey budgets

## Goal

Retain the complete acceptance journeys while allowing their cumulative software-graphics work to finish. The unchanged matched T41 trials each passed 13 of 15 cases and exhausted only the two desktop composite deadlines. This task changes two aggregate budgets; it makes no product performance improvement claim. Independent interpretation must support this bounded next step before worker dispatch.

## Non-goals

No product, renderer, quality, population, assertion, per-operation timeout, observer guard, fixture, retry, worker, skip, trace, source activation or deployment change. Do not reclassify earlier failed trials as passes.

## Base

- branch: loop/observatory-measurement-base-t42
- check command: PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm boundaries:check
- probes: none; local task, no prerequisite remote write probes

## Interfaces

```json
[]
```

## Tasks

```json
{
  "task_id": "T42",
  "title": "Calibrate aggregate budgets for complete software-graphics journeys",
  "goal": "Calibrate only the two cumulative browser journey budgets.",
  "brief": {
    "change": "Change only master-scene180000ms to300000ms and canonical-resource journey120000ms to240000ms",
    "check": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH PLAYWRIGHT_BASE_URL=http://127.0.0.1:1 pnpm exec playwright test tests/e2e/gravity-master-scene.spec.ts tests/e2e/infrastructure-overview.spec.ts --list"
  },
  "seed_files": [
    "docs/plans/observatory-operational-landscape/WORKERS-38.md",
    "AGENTS.md",
    "docs/project/status.md",
    "docs/product/principles.md",
    "playwright.config.ts",
    "package.json",
    "tests/e2e/gravity-master-scene.spec.ts",
    "tests/e2e/infrastructure-overview.spec.ts",
    ".agent/context/T42-control/verify-timeout-only.py"
  ],
  "write_files": [
    "tests/e2e/gravity-master-scene.spec.ts",
    "tests/e2e/infrastructure-overview.spec.ts"
  ],
  "create_files": [],
  "forbidden": [
    "apps",
    "packages",
    ".github",
    "scripts",
    "playwright.config.ts",
    "package.json",
    "pnpm-lock.yaml",
    "tests/e2e/observatory-outline-observer.ts",
    "tests/e2e/observatory-diagnostic-profile.ts",
    ".agent/context"
  ],
  "acceptance": [
    {
      "id": "A1",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec eslint tests/e2e/gravity-master-scene.spec.ts tests/e2e/infrastructure-overview.spec.ts",
      "expect": {
        "exit": 0
      },
      "covers": "Scoped lint"
    },
    {
      "id": "A2",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec prettier --check tests/e2e/gravity-master-scene.spec.ts tests/e2e/infrastructure-overview.spec.ts",
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
      "covers": "Original fifteen title/project pairs"
    },
    {
      "id": "A4",
      "kind": "command",
      "run": "python3 .agent/context/T42-control/verify-timeout-only.py",
      "expect": {
        "exit": 0
      },
      "covers": "Exact two-literal conservation against frozen base; every other source byte unchanged"
    }
  ],
  "depends_on": [],
  "size": "S",
  "model": "gpt-6.1-sol",
  "notes": "Verify actual never/Full Access. You are not alone; preserve others edits. Exclusive ownership of the two numeric total-budget replacements only. Canonical-resource budget is only the test titled Gravity uses canonical resources, persisted appearance, focus and truthful source evidence. Do not change other120000ms tests, any operation/observer timeout, assertion, fixture, title, worker, retries, skip, trace, viewport, diagnostic hook or product behavior. Root owns actual unprofiled four-CPU built fifteen-case execution and full207discovery/main release. Build mandatory packet using official review_packet.py; do not commit. Report .agent/scratch/T42/report.md."
}
```

## Convergence order

T42

## Risks

The master journey inspects every authorized resource through multiple groupings and themes; the canonical-resource journey also exercises dense mixed populations,4K layouts and restoration. Actual original180000/120000ms composite deadlines expired at late boundaries. Saved periodic native profiles and separately observed process CPU place most sampled owned CPU in Chromium SwiftShader processes; neither identifies a shader stage or a product responsiveness defect. Native program/idle stacks are not CPU or GPU duration.

Use finite aggregate300000ms and240000ms budgets for these two journeys only. These are conservative test harness allowances under the measured two-worker software-graphics environment, not new interactive latency targets. Every existing explicit per-operation assertion/guard remains byte-identical. Unqualified Playwright click/focus/scroll actions inherit remaining test time, so raising the aggregate budget can also extend those implicit maximum waits. Do not claim all effective action bounds are unchanged; retain action timings and investigate any new stall. A full per-operation failure under the new total budget is a real failure to investigate; do not extend its guard or retry it into a pass. No further aggregate increase is authorized by this plan.

Root must preserve clean source identity, exact original fifteen cases, two workers, zero retries/skips, default-off profiling, actual four-CPU controller/preview/web/PostgreSQL affinity and strict normal cleanup. Only an actual unprofiled15/15 plus independent evidence review permits a release-facing PR. Full207-case discovery, full main release, immutable publication, genuine protected approval and existing constrained deployment remain required. A longer budget does not establish faster rendering or physical lower-power device performance.

## Escalation answers

The two budget locations are explicit. Original master has one180000ms assignment. Replace only the120000ms assignment inside the exact canonical-resource test title, leaving all other120000ms assignments untouched. The read-only seed verifies the entire two files against the frozen base with only those literal changes. Do not add comments or reformat unrelated lines.

The official generator's repository-language detection needs the same exact-target TypeScript selection already reviewed for T41; keep all official P1-P10 checks and manifest schemas. Root supplies the read-only seed into the fresh task checkout before dispatch. Do not search beyond the generated manifest.
