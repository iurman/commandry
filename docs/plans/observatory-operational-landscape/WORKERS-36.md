# Correct the later search observation handoff

## Goal

Retain the original complete F1 search acceptance while observing its minimum result count in one native retrying assertion.

## Non-goals

No product, population, authority, fixture, viewport, theme, deadline, retry, worker, skip, renderer, source activation or deployment change.

## Base

- branch: loop/observatory-observation-base-t40
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
  "task_id": "T40",
  "title": "Observe complete search results in one retrying assertion",
  "goal": "Correct the evidenced search observation handoff without altering acceptance.",
  "brief": {
    "change": "Replace only the runner count loop with the equivalent native retrying ninety-first-button assertion",
    "check": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH PLAYWRIGHT_BASE_URL=http://127.0.0.1:1 pnpm exec playwright test tests/e2e/gravity-master-scene.spec.ts tests/e2e/infrastructure-overview.spec.ts --list"
  },
  "seed_files": [
    "docs/plans/observatory-operational-landscape/WORKERS-36.md",
    "AGENTS.md",
    "docs/project/status.md",
    "docs/product/principles.md",
    "playwright.config.ts",
    "package.json",
    "tests/e2e/infrastructure-overview.spec.ts",
    "packages/contracts/src/infrastructure-overview.ts",
    ".agent/scratch/T39-baseline-search-diagnosis/report.md",
    ".agent/context/T40-control/packet-command.md"
  ],
  "write_files": ["tests/e2e/infrastructure-overview.spec.ts"],
  "create_files": [],
  "forbidden": [
    "apps",
    "packages",
    ".github",
    "scripts",
    "playwright.config.ts",
    "package.json",
    "pnpm-lock.yaml",
    "tests/e2e/gravity-master-scene.spec.ts",
    "tests/e2e/observatory-outline-observer.ts",
    ".agent/context"
  ],
  "acceptance": [
    {
      "id": "A1",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec eslint tests/e2e/infrastructure-overview.spec.ts",
      "expect": {
        "exit": 0
      },
      "covers": "Scoped lint"
    },
    {
      "id": "A2",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec prettier --check tests/e2e/infrastructure-overview.spec.ts",
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
      "covers": "All original fifteen titles remain; behavioral controls and execution are separate root gates"
    }
  ],
  "depends_on": [],
  "size": "S",
  "model": "gpt-6.1-sol",
  "notes": "Verify actual never/Full Access. You are not alone; preserve others edits. Exclusive one-file ownership after T39 convergence. Change only the later F1 searchResults button-count poll, retaining its exact role selector, minimum f1.resources.length and original 5,000ms deadline, with .nth(f1.resources.length - 1).toBeAttached({timeout:5000}). Do not wait for a scene/network result first. All later applied/current-scene/exact-ID/count/authorized-extra/label/selection checks remain byte-identical. Preserve current T39 atomic tuple/probe implementation. No source/fixture/config/deadline/retry/skip/worker/renderer/grant change. Root owns actual extracted-assertion controls, clean four-CPU15case comparison, actual cleanup and Astra final review before release. Full report .agent/scratch/T40/report.md. Concrete mandatory packet command and manifest path are in the allowed packet-command seed. Stage only your one source path before building the packet; do not commit."
}
```

## Convergence order

T40

## Risks

Dispatch only after T39 source/probe acceptance and normal convergence. Freeze its exact new base reference. The original four-CPU baseline search fails with a correct 182-button current DOM captured 1,177 ms before the original 5,000ms deadline; the second runner count returns afterward. The complete 311-resource response contains every one of the 91 F1 identities. This is a separate boundary from the earlier hosted global transition. It does not establish a product, CPU or GPU cause.

For the exact existing nested role selector, attachment of match f1.resources.length-1 is equivalent to count>=f1.resources.length. Keep the original 5,000ms bound explicit and start immediately at the original position after filling Synthetic. Preserve every subsequent current-scene, exact response/result count, full F1 and authorized-extra containment, enabled-label and genuine-selection assertion. This change does not make attachment establish those later properties by itself.

Root executes the actual extracted committed assertion against zero, 90, 91 and 182 matching buttons, an absent region, an appearance before the original deadline and a late appearance after it. Expected-invalid fixtures must reject; positive fixtures must pass. Preserve existing later exact-authority negative tests and require all 15 original built cases using the reviewed four-CPU control, followed by the full 207-case main release. Retain the original failed baseline and exact candidate source/utility/helper/build identities, actual IDs, phases and strict normal cleanup. Synthetic observation controls are separate from real product or hosted performance.

## Escalation answers

Only the one existing test file may change, and only its later search minimum-count observation. The independent trace diagnosis is a supplied read-only seed. The root owns private controls and runtime execution. Do not add E2E titles or reduce population. No forced click, extra wait, changed timeout or retries. A lint/discovery packet is not behavioral acceptance.

The official generator misidentifies this tsconfig.base.json TypeScript repository as Python because tracked Python scripts also exist. Use an independently reviewed private launcher that imports the unchanged official generator and only selects its existing TypeScript resolver for the exact inspected root and fresh T40 checkout. Keep all P1-P10 checks and schemas unchanged, preserve failures and generate manifest fields only with the official functions.
