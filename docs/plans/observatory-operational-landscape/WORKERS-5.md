# Observatory canonical named views

## Goal
Persist private presentation views across owner devices.

## Non-goals
No production changes or expanded machine grants.

## Base
- branch: feat/observatory-operational-landscape
- check command: PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/contracts/src/observatory-queries.test.ts
- probes: none (disposable local harness only)

## Interfaces
```json
[{"file": "packages/contracts/src/observatory-queries.ts", "symbol": "observatoryViewConfigurationSchema", "kind": "schema"}]
```

## Tasks
```json
{
  "task_id": "T08",
  "title": "Owner-private canonical named views",
  "goal": "Owner-private canonical named views.",
  "brief": {
    "change": "Owner-private canonical named views",
    "check": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/contracts/src/observatory-views.test.ts packages/application/src/observatory-views.test.ts"
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
    "docs/plans/observatory-operational-landscape/T08.md",
    "packages/contracts/src/observatory-queries.ts",
    "packages/db/src/observatory-schema.ts",
    "packages/db/src/observatory-management-repository.ts",
    "packages/db/src/observatory-canonical.integration.test.ts",
    "packages/application/src/observatory-management.ts"
  ],
  "write_files": [],
  "create_files": [
    "packages/contracts/src/observatory-views.ts",
    "packages/contracts/src/observatory-views.test.ts",
    "packages/application/src/observatory-views.ts",
    "packages/application/src/observatory-views.test.ts",
    "packages/db/src/observatory-views-repository.ts",
    "packages/db/src/observatory-views.integration.test.ts"
  ],
  "forbidden": [
    "apps"
  ],
  "acceptance": [
    {
      "id": "A1",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/contracts/src/observatory-views.test.ts packages/application/src/observatory-views.test.ts",
      "expect": {
        "exit": 0
      },
      "covers": "Strict view contracts, application version/idempotency boundaries"
    },
    {
      "id": "A2",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node scripts/test-integration.mjs --db-test=observatory-views.integration.test.ts",
      "expect": {
        "exit": 0
      },
      "covers": "Real disposable session/version/concurrency/isolation/audit/pagination checks"
    },
    {
      "id": "A3",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec prettier --check packages/contracts/src/observatory-views.ts packages/contracts/src/observatory-views.test.ts packages/application/src/observatory-views.ts packages/application/src/observatory-views.test.ts packages/db/src/observatory-views-repository.ts packages/db/src/observatory-views.integration.test.ts",
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
T08

## Risks
Canonical source IDs may disappear after save; report stale refs rather than widening scope.

## Escalation answers
Use actual session helper, exact schema/table, existing disposable harness.
