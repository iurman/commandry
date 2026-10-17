# Preserve hosted Observatory browser diagnostics

## Goal

Retain the missing causal evidence from the two actual hosted failures while preserving all 207 cases and acceptance semantics. This is a diagnostic correction; product cause remains unproved.

## Non-goals

No product, database, API, renderer, source authority, population, timeout, retry, skip, tolerance, configuration or deployment change. No source activation.

## Base

- branch: feat/observatory-operational-landscape
- check command: PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm boundaries:check
- probes: none; local work, remote write probes forbidden by owner

## Interfaces

```json
[{"file":"packages/contracts/src/infrastructure-overview.ts","symbol":"InfrastructureOverview","kind":"type"}]
```

## Tasks

```json
{
  "task_id": "T37",
  "title": "Retain original browser phase and transition evidence",
  "goal": "Retain phase receipts and transition diagnostics without changing browser acceptance.",
  "brief": {
    "change": "Add Node-side phase receipts to master and finally evidence around full-F1 global switch",
    "check": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec playwright test tests/e2e/gravity-master-scene.spec.ts tests/e2e/infrastructure-overview.spec.ts --list"
  },
  "seed_files": [
    "AGENTS.md",
    "docs/project/status.md",
    "docs/product/principles.md",
    "docs/plans/observatory-operational-landscape/T37.md",
    "playwright.config.ts",
    "package.json",
    "tests/e2e/gravity-master-scene.spec.ts",
    "tests/e2e/infrastructure-overview.spec.ts",
    "apps/web/lib/load-infrastructure-scene.ts",
    "packages/contracts/src/infrastructure-overview.ts",
    "apps/web/app/infrastructure/InfrastructureOverviewScreen.tsx",
    ".agent/scratch/T37-master-scene-diagnosis/report.md",
    ".agent/scratch/T37-global-scene-diagnosis/report.md"
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
    ".agent/context/T36"
  ],
  "acceptance": [
    {
      "id": "A1",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec eslint tests/e2e/gravity-master-scene.spec.ts tests/e2e/infrastructure-overview.spec.ts",
      "expect": {
        "exit": 0
      },
      "covers": "Scoped test lint"
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
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec playwright test tests/e2e/gravity-master-scene.spec.ts tests/e2e/infrastructure-overview.spec.ts --list",
      "expect": {
        "exit": 0
      },
      "covers": "All original fifteen affected cases remain discoverable across three projects"
    }
  ],
  "depends_on": [],
  "size": "M",
  "model": "gpt-6.1-sol",
  "notes": "Exclusive ownership of two tests only. Verify actual never/Full Access. No searches/source simplification/new assertion semantics/fixture or timeout changes. Root executes built shared-world pair and full CI after diagnostic review. No claim causal fix. Full report .agent/scratch/T37/report.md."
}
```

```json
{
  "task_id": "T38",
  "title": "Retain hosted browser artifacts on failure",
  "goal": "Retain hosted browser failure artifacts and machine-readable outcomes.",
  "brief": {
    "change": "Upload only owned synthetic browser test-results with pinned official action",
    "check": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec prettier --check .github/workflows/release-candidate.yml"
  },
  "seed_files": [
    "AGENTS.md",
    "docs/project/status.md",
    "docs/product/principles.md",
    "docs/plans/observatory-operational-landscape/T37.md",
    "playwright.config.ts",
    "package.json",
    ".github/workflows/release-candidate.yml",
    ".agent/context/T38/action-reference.json",
    ".agent/context/T38/check-workflow.py",
    ".agent/context/T38/workflow-before.yml"
  ],
  "write_files": [
    ".github/workflows/release-candidate.yml"
  ],
  "create_files": [],
  "forbidden": [
    "apps",
    "packages",
    "tests",
    "scripts",
    "playwright.config.ts",
    "package.json",
    "pnpm-lock.yaml"
  ],
  "acceptance": [
    {
      "id": "A1",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec prettier --check .github/workflows/release-candidate.yml",
      "expect": {
        "exit": 0
      },
      "covers": "Workflow formatting"
    },
    {
      "id": "A2",
      "kind": "command",
      "run": "python3 .agent/context/T38/check-workflow.py",
      "expect": {
        "exit": 0
      },
      "covers": "Failure-preserving browser command, immutable action, bounded artifact scope, original release gates"
    }
  ],
  "depends_on": [],
  "size": "S",
  "model": "gpt-6.1-sol",
  "notes": "Exclusive workflow ownership. No network/credential/remote operation; root provides verified official action SHA. Report .agent/scratch/T38/report.md."
}
```

## Convergence order

T37, T38

## Risks

Instrumentation must survive a total test timeout without another unbounded browser await. Keep compact Node-side JSONL receipts and log phase start before each major operation. Preserve original ordering, 299 master setup writes, 103 IDs, both themes, grouping/outline/inspection/lens/refresh/search/fallback behavior, all fixture and extra population, four overview titles and unrelated bodies, 180000/120000 test limits, 5000 expectation limits, original negative waits and geometry thresholds. Do not catch or replace failures. Diagnostic finally must rethrow original failure and retain response-parser errors that were previously deferred. Observational protocol records include actual scope, navigation ticket, method/path/status/duration, overview totals/cursor progress, accepted scene keys and missing F1 IDs; never credentials or arbitrary response bodies. Cache before timeout and bound any optional final browser snapshot. Master receipts identify theme/grouping, elapsed UTC/monotonic time, remaining budget, setup progress, navigation/cursor/outline/inspection/screenshot/refresh/search/context-loss phases. Only the two targeted tests gain diagnostics; no product assertion changes.

The workflow keeps the original test command and exit behavior, adds line/json reporters with output under test-results, and uploads that owned directory immediately after browser checks on success/failure using actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9, official v7.0.2 verified by GitHub API on 2026-10-17. Use immutable run/SHA/attempt name, seven-day retention and explicit missing-files warning. Do not use continue-on-error, relax publication or upload secrets/environment/whole repository. Preserve all existing later gates and final Compose cleanup.

## Escalation answers

Workers are not alone. Read only generated manifests, edit only exclusive files, no search/install/commit/push/SSH/DB/browser/cleanup. Verify actual delivered approval never and Full Access. Static diagnostic reports distinguish hypotheses from observed cause. Root owns private harness copies and independent execution: preserve frozen T36 originals; build actual candidate, launch one fresh owned PostgreSQL18/web world with external polling disabled, run both original files/all three projects with unchanged two workers and forced real API F1 creation, collect source hashes/BUILD_ID/phase and protocol artifacts, verify matching IPC cleanup plus actual owned PID/group/directory absence. This reduced 15-case run cannot prove the full 207-case world; if it passes without explaining hosted failures, one instrumented full main suite is required with retained evidence. No unchanged blind rerun. Independent Astra source review and root review-packet checks precede normal convergence. Root will write a separate causal correction plan if actual diagnostics establish one.
