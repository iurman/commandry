# Stable retained label admission correction

## Goal

Retain stable non-overlapping label positions through unchanged scene refresh.

## Non-goals

No renderer, component, camera, tour, canonical model, source, provider, evidence or authority changes.

## Base

- branch: feat/observatory-operational-landscape
- check command: PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/ui/src/gravity/labels.test.ts packages/ui/src/gravity/renderer-pressure.test.ts
- probes: none (local pure layout)

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
  "task_id": "T25",
  "title": "Settle retained label positions before sleeping",
  "goal": "Retain stable non-overlapping label positions through unchanged scene refresh.",
  "brief": {
    "change": "Keep drawing while collision positions still change",
    "check": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/ui/src/gravity/labels.test.ts packages/ui/src/gravity/renderer-pressure.test.ts"
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
    "docs/plans/observatory-operational-landscape/T25.md",
    "packages/ui/src/gravity/labels.ts",
    "packages/ui/src/gravity/labels.test.ts"
  ],
  "write_files": [
    "packages/ui/src/gravity/labels.ts",
    "packages/ui/src/gravity/labels.test.ts"
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
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/ui/src/gravity/labels.test.ts packages/ui/src/gravity/renderer-pressure.test.ts",
      "expect": {
        "exit": 0
      },
      "covers": "Causal unchanged dense-layout settling and idempotence with original admission and renderer controls"
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
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec prettier --check packages/ui/src/gravity/labels.ts packages/ui/src/gravity/labels.test.ts",
      "expect": {
        "exit": 0
      },
      "covers": "Formatting"
    },
    {
      "id": "A4",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec eslint packages/ui/src/gravity/labels.ts packages/ui/src/gravity/labels.test.ts",
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

T25

## Risks

Reduced-motion smoothing currently updates state before measuring residual, concealing further collision movement. Mark actual changes without perpetual draws, arbitrary truncation or relaxed overlap/admission controls.

## Escalation answers

Owner authorized complete upgrade and stable labels. Read T25.md for confirmed causal evidence. You are not alone: T24 exclusively owns renderer/component and their tests, T23 owns evidence/adapter files. Do not revert or edit those files. Root provisions frozen dependencies. Read only generated manifest, no searches, installs or commits; escalate exact missing context. Capture meaningful failing-before evidence. Root independently verifies packet and actual-built closure.
