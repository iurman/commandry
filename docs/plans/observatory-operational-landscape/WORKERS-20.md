# Guided-tour activation correction

## Goal

Preserve automatic guided-tour progression while honoring every direct selection intent.

## Non-goals

No new controls, settings, canonical data, mappings, availability, runtime, CI, source adapters or terrain planning changes. Keep the reviewed local terrain correction intact.

## Base

- branch: feat/observatory-operational-landscape
- check command: PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/ui/src/gravity/renderer-pressure.test.ts packages/ui/src/gravity/operational-layout.test.ts packages/ui/src/gravity/presentation.test.ts packages/ui/src/gravity/infrastructure.test.ts apps/web/app/infrastructure/observatory-work-client.test.ts
- probes: none (local shared renderer/component only)

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
  "task_id": "T24",
  "title": "Preserve automatic guided tour progression",
  "goal": "Preserve automatic guided-tour progression while honoring every direct selection intent.",
  "brief": {
    "change": "Separate automatic tour feature from direct activation",
    "check": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/ui/src/gravity/renderer-pressure.test.ts packages/ui/src/gravity/operational-layout.test.ts packages/ui/src/gravity/presentation.test.ts packages/ui/src/gravity/infrastructure.test.ts apps/web/app/infrastructure/observatory-work-client.test.ts"
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
    "docs/plans/observatory-operational-landscape/T24.md",
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
    "packages/ui/src/gravity/renderer.ts",
    "packages/ui/src/components/OperationalObservatory.tsx",
    "packages/ui/src/gravity/renderer-pressure.test.ts",
    "packages/ui/src/gravity/operational-layout.test.ts",
    "apps/web/app/infrastructure/observatory-work-client.test.ts",
    "apps/web/package.json",
    "apps/web/tsconfig.json",
    "apps/web/app/projects/api.ts",
    "apps/web/lib/load-infrastructure-scene.ts",
    "apps/web/app/infrastructure/observatory-work-client.ts"
  ],
  "write_files": [
    "packages/ui/src/gravity/renderer.ts",
    "packages/ui/src/components/OperationalObservatory.tsx",
    "packages/ui/src/gravity/renderer-pressure.test.ts",
    "packages/ui/src/gravity/operational-layout.test.ts",
    "apps/web/app/infrastructure/InfrastructureOverviewScreen.tsx",
    "apps/web/app/infrastructure/observatory-work-client.test.ts"
  ],
  "create_files": [],
  "forbidden": [
    "packages/db",
    "packages/platform",
    "packages/domain",
    "packages/contracts"
  ],
  "acceptance": [
    {
      "id": "A1",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/ui/src/gravity/renderer-pressure.test.ts packages/ui/src/gravity/operational-layout.test.ts packages/ui/src/gravity/presentation.test.ts packages/ui/src/gravity/infrastructure.test.ts apps/web/app/infrastructure/observatory-work-client.test.ts",
      "expect": {
        "exit": 0
      },
      "covers": "Causal natural tour progression and actual component direct/automatic activation regressions plus existing terrain and presentation tests; repeated outer same-ID selection and actual coordinator intent regression"
    },
    {
      "id": "A2",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm --filter @commandry/ui --filter @commandry/web typecheck",
      "expect": {
        "exit": 0
      },
      "covers": "Shared renderer-hook consumer compatibility"
    },
    {
      "id": "A3",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec prettier --check packages/ui/src/gravity/renderer.ts packages/ui/src/components/OperationalObservatory.tsx packages/ui/src/gravity/renderer-pressure.test.ts packages/ui/src/gravity/operational-layout.test.ts apps/web/app/infrastructure/InfrastructureOverviewScreen.tsx apps/web/app/infrastructure/observatory-work-client.test.ts",
      "expect": {
        "exit": 0
      },
      "covers": "Formatting"
    },
    {
      "id": "A4",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec eslint packages/ui/src/gravity/renderer.ts packages/ui/src/components/OperationalObservatory.tsx packages/ui/src/gravity/renderer-pressure.test.ts packages/ui/src/gravity/operational-layout.test.ts apps/web/app/infrastructure/InfrastructureOverviewScreen.tsx apps/web/app/infrastructure/observatory-work-client.test.ts",
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

T24

## Risks

Automatic selection currently reaches both manual camera state and focusSubject interruption. Correct both feedback paths while preserving direct clicks/search/drag, scope resets and all canonical IDs. RendererHooks is deliberately mutable within its write set; pin only the unchanged Well boundary. Existing consumers must remain compatible.

## Escalation answers

Owner authorized the complete upgrade and deliberate guided tour. Read T24.md for the exact built reproduction and result. Existing frozen dependencies will be provisioned by root. You are not alone: T23 owns separate evidence/adapter files and reviewers use immutable20a6967 built assets. Do not revert their work, install or commit. Read only the generated manifest; stop with a precise escalation for missing context. Capture causal failures and preserve the original thresholds/deadlines. Root owns independent actual-built closure.

## Independent review correction

The first four-file candidate passed64tests and root packet verification, then independent actual-component review confirmed repeated external selection is lost. The tour features B locally while the coordinator still holds selectedId A. The real outer source-issue action select(A) sets an unchanged primitive, so the tour and inspector stay on B. Preserve automatic local feature semantics and every direct selection intent with an explicit coordinator intent/revision or equally verified canonical callback boundary. An optional UI prop may preserve existing consumers; do not overload unchanged IDs as repeated user intent. Add causal actual parent/component tests, verify changed and repeated IDs, direct same-feature selection, automatic callbacks, refresh, scope resets and no duplicate camera/history feedback.

This corrected task exclusively adds InfrastructureOverviewScreen.tsx and observatory-work-client.test.ts to its write set (six files total). T26 pulse work remains undispatched until T24 is accepted/merged; its base/manifest will then be regenerated, so coordinator writes never run concurrently. The intended mutable OperationalObservatoryProps/RendererHooks boundaries are not immutable pins; unchanged Well remains pinned. Preserve the original report/packet/reviewer failures. Root regenerates official manifests after a normal doc-only commit/cherry-pick and reruns actual acceptance with no guard bypass. Exact administrative manifest .agent/manifests/T24.json/CURRENT reads and packet command python3 .agent/tools/review_packet.py build --manifest .agent/manifests/T24.json --repo . --base <immutablebasefrommanifest> are authorized.
