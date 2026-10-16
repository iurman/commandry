# Observatory worker wave one

## Goal
Implement the first independently reviewable slices of phases A-C; the full 58-scenario completion ledger and remaining phases stay active in EXECUTION.md.

## Non-goals
No production writes, dispatcher, new framework or fabricated mappings.

## Base
- branch: feat/observatory-operational-landscape
- check command: PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/ui/src/gravity/field.test.ts
- probes: none (local task wave; user prohibits prerequisite remote write probes)

## Interfaces
```json
[{"file": "packages/ui/src/gravity/model.ts", "symbol": "Well", "kind": "type"}, {"file": "packages/ui/src/gravity/renderer.ts", "symbol": "RendererSettings", "kind": "type"}, {"file": "packages/contracts/src/infrastructure-overview.ts", "symbol": "infrastructureResourceSchema", "kind": "schema"}]
```

## Tasks

```json
{
  "task_id": "T01",
  "title": "Smooth active basin geometry with identity-aware transitions",
  "goal": "Smooth active basin geometry with identity-aware transitions.",
  "brief": {
    "change": "Smooth active basin geometry with identity-aware transitions",
    "check": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/ui/src/gravity/field.test.ts packages/ui/src/gravity/basin-geometry.test.ts"
  },
  "seed_files": [
    "AGENTS.md",
    "docs/project/status.md",
    "docs/product/principles.md",
    "docs/project/open-questions.md",
    "docs/decisions/0015-show-the-complete-gravity-landscape.md",
    "docs/decisions/0016-project-the-operational-observatory.md",
    "docs/domain/core-model.md",
    "docs/features/infrastructure.md",
    "docs/ux/information-architecture.md",
    "docs/ux/design-system-and-sensory-language.md",
    "docs/architecture/local-experience-lab.md",
    "docs/plans/observatory-operational-landscape/PLAN.md",
    "docs/plans/observatory-operational-landscape/ACCEPTANCE.md",
    "package.json",
    "tsconfig.base.json",
    "vitest.config.mts",
    "vitest.setup.ts",
    "docs/plans/observatory-operational-landscape/T01.md",
    "packages/ui/src/gravity/model.ts",
    "packages/ui/src/gravity/field.ts",
    "packages/ui/src/gravity/renderer.ts",
    "packages/ui/src/gravity/materials.ts",
    "packages/ui/src/gravity/field.test.ts",
    "packages/ui/src/gravity/labels.ts",
    "packages/ui/src/gravity/presentation.ts",
    "packages/ui/src/gravity/activity-renderer.ts"
  ],
  "write_files": [
    "packages/ui/src/gravity/field.ts",
    "packages/ui/src/gravity/field.test.ts",
    "packages/ui/src/gravity/renderer.ts",
    "packages/ui/src/gravity/materials.ts"
  ],
  "create_files": [
    "packages/ui/src/gravity/basin-geometry.ts",
    "packages/ui/src/gravity/basin-geometry.test.ts"
  ],
  "forbidden": [
    "apps/web",
    "packages/db",
    "apps/worker"
  ],
  "acceptance": [
    {
      "id": "A1",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/ui/src/gravity/field.test.ts packages/ui/src/gravity/basin-geometry.test.ts",
      "expect": {
        "exit": 0
      },
      "covers": "Smooth active basin geometry with identity-aware transitions behavior including documented failure boundaries"
    },
    {
      "id": "A2",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec prettier --check packages/ui/src/gravity/field.ts packages/ui/src/gravity/field.test.ts packages/ui/src/gravity/renderer.ts packages/ui/src/gravity/materials.ts packages/ui/src/gravity/basin-geometry.ts packages/ui/src/gravity/basin-geometry.test.ts",
      "expect": {
        "exit": 0
      },
      "covers": "Changed code formatting"
    }
  ],
  "depends_on": [],
  "size": "M",
  "model": "gpt-6.1-sol"
}
```

```json
{
  "task_id": "T02",
  "title": "Accessible collision-aware shared floating surfaces",
  "goal": "Accessible collision-aware shared floating surfaces.",
  "brief": {
    "change": "Accessible collision-aware shared floating surfaces",
    "check": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/ui/src/components/FloatingSurface.test.tsx packages/ui/src/floating-position.test.ts"
  },
  "seed_files": [
    "AGENTS.md",
    "docs/project/status.md",
    "docs/product/principles.md",
    "docs/project/open-questions.md",
    "docs/decisions/0015-show-the-complete-gravity-landscape.md",
    "docs/decisions/0016-project-the-operational-observatory.md",
    "docs/domain/core-model.md",
    "docs/features/infrastructure.md",
    "docs/ux/information-architecture.md",
    "docs/ux/design-system-and-sensory-language.md",
    "docs/architecture/local-experience-lab.md",
    "docs/plans/observatory-operational-landscape/PLAN.md",
    "docs/plans/observatory-operational-landscape/ACCEPTANCE.md",
    "package.json",
    "tsconfig.base.json",
    "vitest.config.mts",
    "vitest.setup.ts",
    "docs/plans/observatory-operational-landscape/T02.md",
    "packages/ui/src/components/GravityInfrastructure.tsx",
    "packages/ui/src/gravity/infrastructure.css",
    "apps/lab/stories/GravityObservatory.stories.tsx"
  ],
  "write_files": [],
  "create_files": [
    "packages/ui/src/components/FloatingSurface.tsx",
    "packages/ui/src/components/floating-surface.css",
    "packages/ui/src/components/FloatingSurface.test.tsx",
    "packages/ui/src/floating-position.ts",
    "packages/ui/src/floating-position.test.ts",
    "apps/lab/stories/FloatingSurface.stories.tsx"
  ],
  "forbidden": [
    "apps/web",
    "packages/db",
    "apps/worker"
  ],
  "acceptance": [
    {
      "id": "A1",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/ui/src/components/FloatingSurface.test.tsx packages/ui/src/floating-position.test.ts",
      "expect": {
        "exit": 0
      },
      "covers": "Accessible collision-aware shared floating surfaces behavior including documented failure boundaries"
    },
    {
      "id": "A2",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec prettier --check packages/ui/src/components/FloatingSurface.tsx packages/ui/src/components/floating-surface.css packages/ui/src/components/FloatingSurface.test.tsx packages/ui/src/floating-position.ts packages/ui/src/floating-position.test.ts apps/lab/stories/FloatingSurface.stories.tsx",
      "expect": {
        "exit": 0
      },
      "covers": "Changed code formatting"
    }
  ],
  "depends_on": [],
  "size": "M",
  "model": "gpt-6.1-sol"
}
```

```json
{
  "task_id": "T03",
  "title": "Complete semantic Observatory projection and independent operational facets",
  "goal": "Complete semantic Observatory projection and independent operational facets.",
  "brief": {
    "change": "Complete semantic Observatory projection and independent operational facets",
    "check": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/contracts/src/observatory.test.ts packages/domain/src/observatory.test.ts"
  },
  "seed_files": [
    "AGENTS.md",
    "docs/project/status.md",
    "docs/product/principles.md",
    "docs/project/open-questions.md",
    "docs/decisions/0015-show-the-complete-gravity-landscape.md",
    "docs/decisions/0016-project-the-operational-observatory.md",
    "docs/domain/core-model.md",
    "docs/features/infrastructure.md",
    "docs/ux/information-architecture.md",
    "docs/ux/design-system-and-sensory-language.md",
    "docs/architecture/local-experience-lab.md",
    "docs/plans/observatory-operational-landscape/PLAN.md",
    "docs/plans/observatory-operational-landscape/ACCEPTANCE.md",
    "package.json",
    "tsconfig.base.json",
    "vitest.config.mts",
    "vitest.setup.ts",
    "docs/plans/observatory-operational-landscape/T03.md",
    "packages/contracts/src/infrastructure-overview.ts",
    "packages/domain/src/resource-topology.ts",
    "packages/domain/src/relationships.ts",
    "packages/ui/src/gravity/infrastructure.ts"
  ],
  "write_files": [],
  "create_files": [
    "packages/contracts/src/observatory.ts",
    "packages/contracts/src/observatory.test.ts",
    "packages/domain/src/observatory.ts",
    "packages/domain/src/observatory.test.ts",
    "tests/fixtures/observatory.ts"
  ],
  "forbidden": [
    "apps/web",
    "packages/db",
    "apps/worker"
  ],
  "acceptance": [
    {
      "id": "A1",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/contracts/src/observatory.test.ts packages/domain/src/observatory.test.ts",
      "expect": {
        "exit": 0
      },
      "covers": "Complete semantic Observatory projection and independent operational facets behavior including documented failure boundaries"
    },
    {
      "id": "A2",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec prettier --check packages/contracts/src/observatory.ts packages/contracts/src/observatory.test.ts packages/domain/src/observatory.ts packages/domain/src/observatory.test.ts tests/fixtures/observatory.ts",
      "expect": {
        "exit": 0
      },
      "covers": "Changed code formatting"
    }
  ],
  "depends_on": [],
  "size": "M",
  "model": "gpt-6.1-sol"
}
```

## Convergence order
T01, T02, T03

## Risks
Mandatory repository orientation is large; explicitly permit a 360000-byte manifest budget while keeping exclusive changes at six files. Root integrates shared exports, React DOM dependency if needed and browser/API/MCP wiring after independently checked packets. Actual device and production evidence cannot be substituted.

## Escalation answers
Task-specific specifications are seeded T01.md through T03.md. Use the pinned existing subscription models; no paid fallback. Workers are not alone and must preserve others. Runtime actual permissions must be verified separately. Logs/review/scratch are local only; durable result is committed by coordinator. Existing user authority permits routine implementation and normal gates remain.
