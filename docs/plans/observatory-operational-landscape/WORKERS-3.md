# Observatory semantic correction wave

## Goal
Resolve six independent semantic review findings.

## Non-goals
No adapters, production writes or changes to other task ownership.

## Base
- branch: feat/observatory-operational-landscape
- check command: PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/contracts/src/observatory.test.ts packages/domain/src/observatory.test.ts
- probes: none (local-only correction)

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
  }
]
```

## Tasks
```json
{
  "task_id": "T07",
  "title": "Correct independently reproduced semantic defects",
  "goal": "Correct independently reproduced semantic defects.",
  "brief": {
    "change": "Correct independently reproduced semantic defects",
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
    "packages/contracts/src/infrastructure-overview.ts",
    "packages/domain/src/resource-topology.ts",
    "packages/domain/src/relationships.ts",
    "packages/ui/src/gravity/infrastructure.ts",
    "docs/plans/observatory-operational-landscape/T07.md",
    "docs/plans/observatory-operational-landscape/SEMANTIC-REVIEW.md",
    "packages/domain/src/observatory.ts",
    "packages/contracts/src/observatory.ts",
    "tests/fixtures/observatory.ts"
  ],
  "write_files": [
    "packages/domain/src/observatory.ts",
    "packages/domain/src/observatory.test.ts"
  ],
  "create_files": [],
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
T07

## Risks
Domain performance is measured separately from shipped browser behavior.

## Escalation answers
Use exact review reproductions and pinned contracts. No arbitrary cap or weakened schema.
