# Ancestor breadcrumb context correction

## Goal

Restore ancestor reading context and adopt direct current breadcrumbs without moving their camera.

## Non-goals

No new camera store, replacement renderer, coordinator, source, evidence, canonical model, mappings or permissions.

## Base

- branch: feat/observatory-operational-landscape
- check command: PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/ui/src/gravity/operational-layout.test.ts packages/ui/src/gravity/renderer-pressure.test.ts
- probes: none (local component history)

## Interfaces

```json
[
  {
    "file": "packages/ui/src/gravity/model.ts",
    "symbol": "Well",
    "kind": "type"
  }
]
```

## Tasks

```json
{
  "task_id": "T27",
  "title": "Restore ancestor breadcrumb reading context",
  "goal": "Restore ancestor reading context and adopt direct current breadcrumbs without moving their camera.",
  "brief": {
    "change": "Restore saved ancestor poses and retain accepted automatic camera context",
    "check": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/ui/src/gravity/operational-layout.test.ts packages/ui/src/gravity/renderer-pressure.test.ts"
  },
  "seed_files": [
    "AGENTS.md",
    "docs/project/status.md",
    "docs/product/principles.md",
    "docs/project/open-questions.md",
    "docs/domain/core-model.md",
    "docs/domain/operations.md",
    "docs/features/infrastructure.md",
    "docs/features/gravity-observatory.md",
    "docs/ux/information-architecture.md",
    "docs/ux/design-system-and-sensory-language.md",
    "docs/architecture/local-experience-lab.md",
    "docs/architecture/events-and-integrations.md",
    "docs/architecture/security-and-permissions.md",
    "docs/architecture/technology-stack.md",
    "docs/decisions/0015-show-the-complete-gravity-landscape.md",
    "docs/decisions/0016-project-the-operational-observatory.md",
    "package.json",
    "tsconfig.base.json",
    "vitest.config.mts",
    "vitest.setup.ts",
    "packages/ui/package.json",
    "packages/ui/tsconfig.json",
    "packages/ui/src/gravity/model.ts",
    "packages/ui/src/gravity/presentation.ts",
    "packages/ui/src/gravity/presentation.test.ts",
    "packages/ui/src/gravity/infrastructure.ts",
    "packages/ui/src/gravity/infrastructure.test.ts",
    "packages/ui/src/gravity/operational-layout.ts",
    "packages/ui/src/gravity/labels.ts",
    "packages/ui/src/gravity/field.ts",
    "packages/ui/src/gravity/basin-geometry.ts",
    "packages/ui/src/gravity/activity-types.ts",
    "packages/ui/src/gravity/materials.ts",
    "packages/ui/src/gravity/observatory-preferences.ts",
    "packages/test-support/src/observatory.ts",
    "packages/contracts/src/observatory.ts",
    "apps/web/app/infrastructure/InfrastructureOverviewScreen.tsx",
    "packages/ui/src/gravity/labels.test.ts",
    "docs/plans/observatory-operational-landscape/T27.md",
    "packages/ui/src/components/OperationalObservatory.tsx",
    "packages/ui/src/gravity/operational-layout.test.ts",
    "packages/ui/src/gravity/renderer.ts",
    "packages/ui/src/gravity/renderer-pressure.test.ts"
  ],
  "write_files": [
    "packages/ui/src/components/OperationalObservatory.tsx",
    "packages/ui/src/gravity/operational-layout.test.ts",
    "packages/ui/src/gravity/renderer.ts",
    "packages/ui/src/gravity/renderer-pressure.test.ts"
  ],
  "create_files": [],
  "forbidden": [
    "apps",
    "packages/db",
    "packages/platform",
    "packages/domain",
    "packages/contracts"
  ],
  "acceptance": [
    {
      "id": "A1",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/ui/src/gravity/operational-layout.test.ts packages/ui/src/gravity/renderer-pressure.test.ts",
      "expect": {
        "exit": 0
      },
      "covers": "Preserved causal breadcrumb pose and tour-current-crumb adoption controls, exact history/alias/Back/Escape behavior"
    },
    {
      "id": "A2",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm --filter @commandry/ui typecheck",
      "expect": {
        "exit": 0
      },
      "covers": "UI types"
    },
    {
      "id": "A3",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec prettier --check packages/ui/src/components/OperationalObservatory.tsx packages/ui/src/gravity/operational-layout.test.ts packages/ui/src/gravity/renderer.ts packages/ui/src/gravity/renderer-pressure.test.ts",
      "expect": {
        "exit": 0
      },
      "covers": "Formatting"
    },
    {
      "id": "A4",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec eslint packages/ui/src/components/OperationalObservatory.tsx packages/ui/src/gravity/operational-layout.test.ts packages/ui/src/gravity/renderer.ts packages/ui/src/gravity/renderer-pressure.test.ts",
      "expect": {
        "exit": 0
      },
      "covers": "Lint"
    }
  ],
  "depends_on": [],
  "size": "M",
  "model": "gpt-6.1-sol"
}
```

## Convergence order

T27

## Risks

Use exact representation history and existing saved pose. Preserve authorization pruning, direct intent and Back without introducing duplicate history/refit feedback.

## Escalation answers

Owner authorized useful breadcrumbs and reading-context preservation. Read T27.md. You are not alone; T24 must converge before this task starts, then T26 coordinator can own separate files, and T25 owns labels only. Do not revert others. Root provisions frozen dependencies, no install/search/commit. Exact .agent/manifests/T27.json/CURRENT administrative reads and python3 .agent/tools/review_packet.py build --manifest .agent/manifests/T27.json --repo . --base <immutablebasefrommanifest> verification are authorized. Fullreport/logs go .agent/scratch/T27/ and packet artifacts .agent/review/. Verify actual never/FullAccess before command work; precise escalation for missing context. Root owns independent review/new-built pose closure.

## Independent review correction

The original T27 candidate passes65 focused tests and fixes manual breadcrumb restoration. Independent review retains a failed tour-host to current-breadcrumb to child to ancestor control: the component accepts the shown subject, but renderer focus identity still points to the prior overview, so later navigation saves/restores a fitted host pose. Extend only the existing renderer and pressure-test ownership alongside the component and component tests. Preserve the immediate current-crumb no-focus/no-movement assertion and exact later position/target. A small explicit context-adoption operation may reuse current renderer state and saved poses; do not add a second camera store. Keep T24 direct-selection behavior and geometry unchanged. The coordinator already forwards complete focus options and is read-only for T27 because T29 owns it. Root must regenerate at the new immutable documentation base before resuming the same worktree.
