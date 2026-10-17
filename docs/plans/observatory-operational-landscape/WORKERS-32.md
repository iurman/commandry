# Migrate Observatory browser guarantees

## Goal

Preserve current browser guarantees and align the phone lens boundary.

## Non-goals

No redesign, new canonical capability/source/grant, observer success injection, test skip, retry/deadline/tolerance increase, fixture substitution, changed device matrix, unrelated test edit, renderer change or production operation. T35 owns saved active-query correction and must converge before this task starts.

## Base

- branch: loop/migrate-observatory-browser-guarantees/T36
- check command: PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm boundaries:check
- probes: none (disposable local browser correction; owner forbids remote write probes)

This task starts only after T35 independent source review and normal local convergence. Actual main6d release39038533370 failed6legacy infrastructure browser cases with196pass/5skip after all earlier gates and container startup passed. Full failed log is retained. Source and independent assertion audits require full behavioral migration, not selector-only substitutions. Read T36.md and the immutable assertion/geometry maps.

## Interfaces

```json
[]
```

## Tasks

```json
{
  "task_id": "T36",
  "title": "Preserve current browser guarantees and phone lens alignment",
  "goal": "Preserve current browser guarantees and align the phone lens boundary.",
  "brief": {
    "change": "Migrate both original legacy browser contracts without weakening their guarantees and correct the phone ring cap",
    "check": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node .agent/context/T36/verify-overview.mjs"
  },
  "seed_files": [
    "AGENTS.md",
    "docs/project/status.md",
    "docs/product/principles.md",
    "docs/ux/information-architecture.md",
    "docs/ux/design-system-and-sensory-language.md",
    "docs/features/gravity-observatory.md",
    "docs/domain/core-model.md",
    "docs/project/open-questions.md",
    "docs/decisions/0016-project-the-operational-observatory.md",
    "docs/architecture/local-experience-lab.md",
    "tests/e2e/infrastructure-overview.spec.ts",
    "tests/e2e/gravity-master-scene.spec.ts",
    "tests/e2e/observatory-overlays.spec.ts",
    "apps/web/app/infrastructure/InfrastructureOverviewScreen.tsx",
    "packages/ui/src/components/OperationalObservatory.tsx",
    "packages/ui/src/components/operational-observatory.css",
    "packages/ui/src/gravity/renderer.ts",
    "packages/ui/src/gravity/observatory-preferences.ts",
    "playwright.config.ts",
    "package.json",
    ".agent/context/T36/verify-overview.mjs",
    ".agent/context/T36/preview.mjs",
    ".agent/context/T36/assertion-map.md",
    ".agent/context/T36/geometry-contract.md",
    "docs/plans/observatory-operational-landscape/T36.md",
    "docs/plans/observatory-operational-landscape/WORKERS-32.md"
  ],
  "write_files": [
    "tests/e2e/infrastructure-overview.spec.ts",
    "packages/ui/src/components/operational-observatory.css"
  ],
  "create_files": [],
  "forbidden": [
    "apps",
    ".github",
    "scripts",
    "packages/application",
    "packages/domain",
    "packages/contracts",
    "packages/db",
    "packages/test-support",
    "packages/ui/src/components/OperationalObservatory.tsx",
    "packages/ui/src/gravity",
    "playwright.config.ts",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    ".agent/context/T36"
  ],
  "acceptance": [
    {
      "id": "A1",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node .agent/context/T36/verify-overview.mjs",
      "expect": {
        "exit": 0
      },
      "covers": "Actual full worker/web build, fresh PostgreSQL18/private compiled app, entire infrastructure-overview file at all3unchanged projects and verified owned cleanup"
    },
    {
      "id": "A2",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec prettier --check tests/e2e/infrastructure-overview.spec.ts packages/ui/src/components/operational-observatory.css",
      "expect": {
        "exit": 0
      },
      "covers": "Only migrated browser assertions and narrow phone lens CSS are formatted"
    },
    {
      "id": "A3",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm boundaries:check",
      "expect": {
        "exit": 0
      },
      "covers": "Unchanged architecture and fixture/deployment boundaries"
    }
  ],
  "depends_on": [],
  "size": "M",
  "model": "gpt-6.1-sol"
}
```

## Convergence order

T36

## Risks

An absent legacy locator stopped each old test before downstream defects could execute. Preserve the complete original fixture, expected canonical identity/membership, measurements/evidence HTTP200, separate telemetry/unknownavailability/no-source states, both themes and original screen matrix. Keep120000ms test and5000ms expectation/poll limits. Retain original observer firstfalse and thenwithheld callbacks, verify injection actually occurred, preserve150ms no-draw negative and actual clipped-ancestor/scroll recovery. Never reselect grouping after reload/navigation to hide restoration failure. Measure the current shared lens viewport with less than1CSSpixel tolerance, bounds and lifecycle; visibility alone is insufficient. Renderer lens is x=.76W,y=.30H,diameter=min(.44H,.44W,440). Its ring must match that same boundary. The current mobile CSS42percent cap disagrees; change only that cap to the existing48percent ordinary cap, after retaining a genuine failing measured phone control. Do not encode min(diameter,.42W) as success. This is a proved visual mismatch, not a claim of canonical picking failure.

## Escalation answers

You own only the two write files and are not alone. Root supplies a private child checkout/frozen offline deps and identical immutable reviewed helpers; no worker search/install/SSH/database access outside helper/commit/push or helper mutation. Confirm actual never/fullaccess. Change only the two failing original test definitions, necessary shared helper additions/imports and exact relevant mobilecap. Preserve every unaffected test, fixture body, existing meaningful comment, screenshot and limit. Open Topology before asserting nonempty topology labels and after final Exit wallboard before legacy outer form search. Current Gravity interactions use inner Operational Observatory, exact canonical outline/inspector IDs, Appearance and views, page-scoped portaled fields, Optional selected-subject lens and Pause scene. Use supplied full assertion map for every old guarantee, including complete counts, actual source times/evidence, custom sector membership after reload, project grouping across wallboard, deliberate camera orbit then pause, phone fit and1920TVstage/vertical bounds. Keep measured geometry and observer negative controls. Build the migrated tests before changing CSS and retain actual measured phone failure through immutable helper; do not guess success. The reviewed helper runs actual pnpm build, fresh isolated PostgreSQL18, private compiled app and entire test file across all3original projects, no test grep/retry/deadline overrides, no worker or externalpolling, with verified owned cleanup. It preserves raw per-invocation logs and failure receipts. Root provisions test-local configuration as needed; helper explicitly overrides build env and disposable web env, never uses production. Helper startup/setup failures require escalation, not source/test weakening. Administrative STATE supplies exactbase/manifest/helperhashes/escalationcodes and packet build command. Root independently reruns packet, reviews source, reconciles affected built evidence and executes normal PR/main release. All human/device/source limits remain explicit.
