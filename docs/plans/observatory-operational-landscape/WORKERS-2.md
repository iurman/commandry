# Observatory worker wave two

## Goal
Shared authorized queries and the interactive operational scene. Full phases A-F and all58 scenarios remain active.

## Non-goals
No production writes, dispatcher or assumed mappings.

## Base
- branch: feat/observatory-operational-landscape
- check command: PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/domain/src/observatory.test.ts
- probes: none (local-only wave)

## Interfaces
```json
[
  {
    "file": "packages/domain/src/observatory.ts",
    "symbol": "ObservatoryInput",
    "kind": "type"
  },
  {
    "file": "packages/domain/src/observatory.ts",
    "symbol": "ObservatoryScene",
    "kind": "type"
  },
  {
    "file": "packages/ui/src/gravity/model.ts",
    "symbol": "Well",
    "kind": "type"
  },
  {
    "file": "packages/ui/src/gravity/renderer.ts",
    "symbol": "RendererSettings",
    "kind": "type"
  }
]
```

## Tasks

```json
{
  "task_id": "T04",
  "title": "Authorized shared Observatory query services",
  "goal": "Authorized shared Observatory query services.",
  "brief": {
    "change": "Authorized shared Observatory query services",
    "check": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/contracts/src/observatory-queries.test.ts packages/application/src/observatory.test.ts"
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
    "docs/plans/observatory-operational-landscape/T04.md",
    "packages/domain/src/observatory.ts",
    "packages/contracts/src/observatory.ts",
    "tests/fixtures/observatory.ts",
    "packages/application/src/foundation-work.ts",
    "packages/contracts/src/foundation-access.ts",
    "packages/contracts/src/agent-foundation.ts",
    "packages/domain/src/agent-foundation.ts"
  ],
  "write_files": [],
  "create_files": [
    "packages/contracts/src/observatory-queries.ts",
    "packages/contracts/src/observatory-queries.test.ts",
    "packages/application/src/observatory.ts",
    "packages/application/src/observatory.test.ts"
  ],
  "forbidden": [
    "apps/worker",
    "packages/db",
    "apps/web"
  ],
  "acceptance": [
    {
      "id": "A1",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/contracts/src/observatory-queries.test.ts packages/application/src/observatory.test.ts",
      "expect": {
        "exit": 0
      },
      "covers": "Authorized shared Observatory query services tested failure boundaries"
    },
    {
      "id": "A2",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec prettier --check packages/contracts/src/observatory-queries.ts packages/contracts/src/observatory-queries.test.ts packages/application/src/observatory.ts packages/application/src/observatory.test.ts",
      "expect": {
        "exit": 0
      },
      "covers": "Formatting of owned files"
    }
  ],
  "depends_on": [],
  "size": "M",
  "model": "gpt-6.1-sol"
}
```

```json
{
  "task_id": "T05",
  "title": "Interactive complete operational landscape",
  "goal": "Interactive complete operational landscape.",
  "brief": {
    "change": "Interactive complete operational landscape",
    "check": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/ui/src/gravity/operational-layout.test.ts packages/ui/src/gravity/observatory-preferences.test.ts"
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
    "docs/plans/observatory-operational-landscape/T05.md",
    "packages/contracts/src/observatory.ts",
    "tests/fixtures/observatory.ts",
    "packages/domain/src/observatory.ts",
    "packages/ui/src/components/GravityInfrastructure.tsx",
    "packages/ui/src/gravity/infrastructure.ts",
    "packages/ui/src/gravity/infrastructure.css",
    "packages/ui/src/gravity/model.ts",
    "packages/ui/src/gravity/renderer.ts",
    "packages/ui/src/gravity/presentation.ts",
    "packages/ui/src/components/FloatingSurface.tsx",
    "packages/ui/src/components/floating-surface.css"
  ],
  "write_files": [],
  "create_files": [
    "packages/ui/src/components/OperationalObservatory.tsx",
    "packages/ui/src/components/operational-observatory.css",
    "packages/ui/src/gravity/operational-layout.ts",
    "packages/ui/src/gravity/operational-layout.test.ts",
    "packages/ui/src/gravity/observatory-preferences.ts",
    "packages/ui/src/gravity/observatory-preferences.test.ts"
  ],
  "forbidden": [
    "apps/worker",
    "packages/db",
    "apps/web"
  ],
  "acceptance": [
    {
      "id": "A1",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/ui/src/gravity/operational-layout.test.ts packages/ui/src/gravity/observatory-preferences.test.ts",
      "expect": {
        "exit": 0
      },
      "covers": "Interactive complete operational landscape tested failure boundaries"
    },
    {
      "id": "A2",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec prettier --check packages/ui/src/components/OperationalObservatory.tsx packages/ui/src/components/operational-observatory.css packages/ui/src/gravity/operational-layout.ts packages/ui/src/gravity/operational-layout.test.ts packages/ui/src/gravity/observatory-preferences.ts packages/ui/src/gravity/observatory-preferences.test.ts",
      "expect": {
        "exit": 0
      },
      "covers": "Formatting of owned files"
    }
  ],
  "depends_on": [],
  "size": "M",
  "model": "gpt-6.1-sol"
}
```

## Convergence order
T04, T05

## Risks
Actual PostgreSQL authorization and GPU/browser behavior are coordinator gates. These unit packets cannot establish them.

## Escalation answers
Use exact source manifests. Coordinator owns package exports, renderer focus integration and adapters. No paid fallback, installs or runtime duplication.
