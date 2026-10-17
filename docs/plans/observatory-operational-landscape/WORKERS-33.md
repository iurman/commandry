# Migrate Observatory browser guarantees

## Goal

Preserve browser guarantees and persist implicit custom grouping.

## Non-goals

No redesign, schema/API/source/grant/canonical containment change, new integration, renderer change, preference-normalizer change, automatic orbit, unrelated file edit, fixture substitution, skip/retry/deadline/tolerance increase or production operation.

## Base

- branch: loop/migrate-observatory-browser-guarantees/T36
- check command: PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm boundaries:check
- probes: none (scoped local correction; owner forbids remote write probes)

This supersedes WORKERS-32 before the stopped worker resumes. Two actual full unchanged-CSS baselines at422701f each ran9PASS/3FAIL. The original helper exit143 failure is retained and its exact assets were recovered separately. The independently reviewed IPC helper now has actual strict cleanup PASS, independently checked against fresh stopped receipt and real PID/group/directory absence. Both phone baselines still measure the known42percent boundary mismatch. Desktop source-only preflight identified invalid migrated label locators and the omitted original explicit Custom selection.

The same preflight proves a separate product defect: Add resource to sector switches the actual active query to custom, but only saves sectors and leaves saved grouping operational. There is no preview affordance; settings claim to be saved. A reload therefore restores the wrong valid grouping. Do not hide this alternate path by adding a selection to the test. Preserve the original explicit-Custom journey AND add a meaningful implicit-path regression and built reload closure.

The root will normally fast-forward the stopped child to the committed replan before generation. This is an explicit replan, not a base change under active work. Existing uncommitted migrated tests and all actual old evidence remain intact. The generated manifest and administrative STATE pin the new exact immutable base. The same worker exclusively owns the four listed files; no other product source is being edited.

## Interfaces

```json
[
  {
    "file": "packages/ui/src/gravity/observatory-preferences.ts",
    "symbol": "ObservatoryQuery",
    "kind": "type"
  },
  {
    "file": "packages/ui/src/gravity/observatory-preferences.ts",
    "symbol": "ObservatorySector",
    "kind": "type"
  }
]
```

## Tasks

```json
{
  "task_id": "T36",
  "title": "Preserve browser guarantees and implicit custom grouping",
  "goal": "Preserve browser guarantees and persist implicit custom grouping.",
  "brief": {
    "change": "Complete the current browser journeys and persist the actual custom grouping selected by adding a sector member",
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
    "docs/plans/observatory-operational-landscape/WORKERS-32.md",
    "packages/ui/src/gravity/operational-layout.test.ts",
    "packages/ui/package.json",
    "vitest.config.mts",
    "vitest.setup.ts",
    "docs/plans/observatory-operational-landscape/T36-REPLAN.md",
    "docs/plans/observatory-operational-landscape/WORKERS-33.md",
    ".agent/context/T36/mid-migration-review.md",
    ".agent/context/T36/corrected-helper-cleanup-proof.json",
    ".agent/context/T36/baseline-provenance.json",
    ".agent/context/T36/baseline-cleanup-recovery.json",
    ".agent/context/T36/signal-recovery-review.md",
    ".agent/scratch/T36/run-0d792666-e1cb-4de5-af36-4db36b712cdb/build.log",
    ".agent/scratch/T36/run-0d792666-e1cb-4de5-af36-4db36b712cdb/preview.log",
    ".agent/scratch/T36/run-0d792666-e1cb-4de5-af36-4db36b712cdb/browser.log",
    ".agent/scratch/T36/run-0d792666-e1cb-4de5-af36-4db36b712cdb/browser-result.json",
    ".agent/scratch/T36/run-0d792666-e1cb-4de5-af36-4db36b712cdb/cleanup.json",
    ".agent/scratch/T36/run-5848c8d1-8ce8-458a-b917-eb5e55ef9bdc/browser.log",
    ".agent/scratch/T36/run-5848c8d1-8ce8-458a-b917-eb5e55ef9bdc/browser-result.json",
    ".agent/scratch/T36/run-5848c8d1-8ce8-458a-b917-eb5e55ef9bdc/cleanup.json",
    ".agent/scratch/T36/run-5848c8d1-8ce8-458a-b917-eb5e55ef9bdc/runtime/stopped.json",
    ".agent/scratch/T36/baseline-invocation.log",
    ".agent/scratch/T36/baseline-ipc-invocation.log"
  ],
  "write_files": [
    "packages/ui/src/components/OperationalObservatory.tsx",
    "packages/ui/src/gravity/operational-layout.test.ts",
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
    "playwright.config.ts",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    ".agent/context/T36",
    "packages/ui/src/gravity/renderer.ts",
    "packages/ui/src/gravity/observatory-preferences.ts"
  ],
  "acceptance": [
    {
      "id": "A1",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run packages/ui/src/gravity/operational-layout.test.ts packages/ui/src/gravity/observatory-preferences.test.ts",
      "expect": {
        "exit": 0
      },
      "covers": "Retained77controls plus meaningful implicit-custom Add-resource persistence regression that first fails on unchanged product"
    },
    {
      "id": "A2",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm --filter @commandry/ui typecheck",
      "expect": {
        "exit": 0
      },
      "covers": "Strict component and UI types"
    },
    {
      "id": "A3",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node .agent/context/T36/verify-overview.mjs",
      "expect": {
        "exit": 0
      },
      "covers": "Actual full worker/web build, fresh private PostgreSQL18, entire original browser file/all3projects with original guarantees plus both explicit and implicit custom reload paths and verified cleanup"
    },
    {
      "id": "A4",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec prettier --check packages/ui/src/components/OperationalObservatory.tsx packages/ui/src/gravity/operational-layout.test.ts tests/e2e/infrastructure-overview.spec.ts packages/ui/src/components/operational-observatory.css",
      "expect": {
        "exit": 0
      },
      "covers": "Only four scoped source/test/CSS files formatted"
    },
    {
      "id": "A5",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm boundaries:check",
      "expect": {
        "exit": 0
      },
      "covers": "Unchanged domain/platform/fixture boundaries"
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

Keep every original fixture byte, unaffected test, meaningful original assertion,120000ms test/5000ms expectation and poll limit,150ms negative wait,3projects, both themes and screenshots. Preserve topology/search/no-result, exact canonical ID/parent containment, real telemetry/evidence HTTP200/timestamps, unknown unmonitored service availability, the original explicit custom grouping/palette/sector reload journey, projects wallboard persistence without reselecting, deliberate orbit/pause, false-first/withheld observer counters, zero-height clipped ancestor with positive-size canvas container, no-draw and real scroll recovery, phone horizontal fit and1920TVvertical/stage bounds. Follow the complete immutable assertion/geometry maps and preflight report. No old guarantee may be weakened to accommodate aggregation or a missing locator.

The new implicit custom path must first genuinely fail as a component regression against unchanged product. Correct only the source writer(s) demonstrated by preflight, preserving authorized sector members and filters while saving the actual active custom grouping through existing preferences/query paths. Then prove an actual built Add-resource action from a noncustom grouping survives reload without corrective selection, separately from the original explicit-Custom journey. A matching select/storage alone is insufficient: await the real applied scene and exact members. Root will independently review all changes.

## Escalation answers

The old two-file scope is superseded because independent source review found the real alternate-path persistence gap. New four-file ownership is explicit, same worker/worktree. Source and test are complete; no placeholders or guessed control labels. Fix actual current wrapped-label locators through their real combobox descendants as preflight specifies. Do not repeat the unchanged-CSS baseline: two actual phone failures and corrected strict owned cleanup are already retained. After the new component fail-first, the narrow mobile42percent to48percent correction is authorized; preserve strict less than1CSSpixel ring/shared viewport agreement and all bounds/picking/lifecycle checks. Root-owned helpers remain frozen and unchanged, SHA256 in STATE; runtime/setup failure requires escalation, not weakening. Use exact root-provided packet command/base. Root controls any generated-evidence additions and independent packet reexecution/review, then normal convergence/PR/main release and protected deployment. Worker must verify delivered never/fullaccess, is not alone, and may not search/install/commit/push/SSH or touch other sources. Full report is .agent/scratch/T36/report.md. Retain every actual failure and original source qualification.
