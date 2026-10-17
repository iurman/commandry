# Bounded close-view pressure terrain

## Goal

Correct visibly stepped close-view pressure terrain while preserving complete field membership, bounded planning and ordinary geometry.

## Non-goals

No material, product-control, field-membership, canonical-data, transport, provider or permission changes. No whole-population dense brute force.

## Base

- branch: feat/observatory-operational-landscape
- check command: PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/ui/src/gravity/basin-geometry.test.ts packages/ui/src/gravity/field.test.ts
- probes: none (local geometry only; no remote writes required)

## Interfaces

```json
[
  {
    "file": "packages/ui/src/gravity/model.ts",
    "symbol": "Well",
    "kind": "type"
  },
  {
    "file": "packages/ui/src/gravity/model.ts",
    "symbol": "surfaceHeight",
    "kind": "function"
  }
]
```

## Tasks

```json
{
  "task_id": "T20",
  "title": "Bounded close-view pressure terrain",
  "goal": "Correct visibly stepped close-view pressure terrain while preserving complete field membership, bounded planning and ordinary geometry.",
  "brief": {
    "change": "Refine visible pressure terrain within bounded shared geometry",
    "check": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/ui/src/gravity/basin-geometry.test.ts packages/ui/src/gravity/field.test.ts"
  },
  "seed_files": [
    "AGENTS.md",
    "docs/project/status.md",
    "docs/product/principles.md",
    "docs/project/open-questions.md",
    "docs/domain/core-model.md",
    "docs/features/infrastructure.md",
    "docs/features/gravity-observatory.md",
    "docs/domain/operations.md",
    "docs/ux/information-architecture.md",
    "docs/ux/design-system-and-sensory-language.md",
    "docs/architecture/local-experience-lab.md",
    "docs/architecture/events-and-integrations.md",
    "docs/decisions/0015-show-the-complete-gravity-landscape.md",
    "docs/decisions/0016-project-the-operational-observatory.md",
    "docs/plans/observatory-operational-landscape/T20.md",
    "package.json",
    "pnpm-workspace.yaml",
    "tsconfig.base.json",
    "vitest.config.mts",
    "vitest.setup.ts",
    "packages/ui/package.json",
    "packages/ui/tsconfig.json",
    "packages/ui/src/gravity/renderer.ts",
    "packages/ui/src/gravity/basin-geometry.ts",
    "packages/ui/src/gravity/basin-geometry.test.ts",
    "packages/ui/src/gravity/field.ts",
    "packages/ui/src/gravity/field.test.ts",
    "packages/ui/src/gravity/model.ts",
    "packages/ui/src/gravity/materials.ts",
    "packages/ui/src/gravity/presentation.ts",
    "packages/ui/src/gravity/presentation.test.ts",
    "tests/e2e/gravity-field-gpu.spec.ts"
  ],
  "write_files": [
    "packages/ui/src/gravity/renderer.ts",
    "packages/ui/src/gravity/basin-geometry.ts",
    "packages/ui/src/gravity/basin-geometry.test.ts",
    "packages/ui/src/gravity/field.ts",
    "packages/ui/src/gravity/field.test.ts"
  ],
  "create_files": ["packages/ui/src/gravity/renderer-pressure.test.ts"],
  "forbidden": [
    "apps",
    "packages/application",
    "packages/db",
    "packages/domain",
    "packages/contracts",
    "packages/platform"
  ],
  "acceptance": [
    {
      "id": "A1",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/ui/src/gravity/basin-geometry.test.ts packages/ui/src/gravity/field.test.ts packages/ui/src/gravity/renderer-pressure.test.ts",
      "expect": {
        "exit": 0
      },
      "covers": "Meaningful pressure close-view regression, existing bounded planning, complete-field and ordinary geometry controls"
    },
    {
      "id": "A2",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec tsc -p packages/ui/tsconfig.json --noEmit --incremental false",
      "expect": {
        "exit": 0
      },
      "covers": "Shared renderer and geometry type compatibility"
    },
    {
      "id": "A3",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec prettier --check packages/ui/src/gravity/renderer.ts packages/ui/src/gravity/basin-geometry.ts packages/ui/src/gravity/basin-geometry.test.ts packages/ui/src/gravity/field.ts packages/ui/src/gravity/field.test.ts packages/ui/src/gravity/renderer-pressure.test.ts",
      "expect": {
        "exit": 0
      },
      "covers": "Formatting"
    },
    {
      "id": "A4",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec eslint packages/ui/src/gravity/renderer.ts packages/ui/src/gravity/basin-geometry.ts packages/ui/src/gravity/basin-geometry.test.ts packages/ui/src/gravity/field.ts packages/ui/src/gravity/field.test.ts packages/ui/src/gravity/renderer-pressure.test.ts",
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

T20

## Risks

Camera detail changes can create repeated builds, cracks, memory leaks or lens mismatch. Keep complete floor and field contributions; reuse existing lifecycle. Preserve planning limits and ordinary output so prior F1 evidence remains attributable. Rendered recheck is required after code validation.

## Escalation answers

The owner already authorized geometry correction. The 17.863-pixel projected diagnostic accompanies a visually confirmed defect; it is not an invented owner-approved numeric release gate. Read T20.md for exact reproduction and invariants. Use existing dependencies only. Root provides the prepared isolated worktree and frozen dependencies. Do not install, search, commit or mutate any other file. You are not alone in the codebase; do not revert other work. If the exact scope is insufficient, write an escalation and stop.
