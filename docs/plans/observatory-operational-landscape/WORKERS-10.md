# Observatory owner Work read

## Goal
Reuse canonical Work for the owner Observatory dock.

## Non-goals
No dispatcher, machine grant expansion or production changes.

## Base
- branch: feat/observatory-operational-landscape
- check command: PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/application/src/foundation-work.test.ts
- probes: none (real disposable PostgreSQL only)

## Interfaces
```json
[]
```

## Tasks
```json
{
  "task_id": "T13",
  "title": "Authorized owner canonical Work reads",
  "goal": "Reuse canonical Work for the owner Observatory dock.",
  "brief": {
    "change": "Owner canonical Work read service",
    "check": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/application/src/foundation-work.test.ts packages/application/src/observatory-work.test.ts"
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
    "docs/plans/observatory-operational-landscape/T13.md",
    "package.json",
    "tsconfig.base.json",
    "vitest.config.mts",
    "vitest.setup.ts",
    "scripts/test-integration.mjs",
    "packages/contracts/src/foundation-work.ts",
    "packages/application/src/foundation-work.ts",
    "packages/application/src/foundation-work.test.ts",
    "packages/application/src/observatory-management.ts",
    "packages/db/src/client.ts",
    "packages/db/src/schema.ts",
    "packages/db/src/project-work-query.ts",
    "packages/db/src/foundation-work-repository.ts",
    "packages/db/src/foundation-work.integration.test.ts",
    "packages/db/src/observatory-read-repository.ts",
    "packages/db/src/foundation-workflow-access-repository.ts",
    "packages/db/src/observatory-access.integration.test.ts"
  ],
  "write_files": [
    "packages/application/src/foundation-work.ts"
  ],
  "create_files": [
    "packages/application/src/observatory-work.ts",
    "packages/application/src/observatory-work.test.ts",
    "packages/db/src/observatory-work-repository.ts",
    "packages/db/src/observatory-work.integration.test.ts"
  ],
  "forbidden": [
    "apps",
    "packages/ui",
    "packages/domain"
  ],
  "acceptance": [
    {
      "id": "A1",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/application/src/foundation-work.test.ts packages/application/src/observatory-work.test.ts",
      "expect": {
        "exit": 0
      },
      "covers": "Canonical shared Work DTO, owner expiry, result integrity and no machine behavior regression"
    },
    {
      "id": "A2",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node scripts/test-integration.mjs --db-test=observatory-work.integration.test.ts",
      "expect": {
        "exit": 0
      },
      "covers": "Real owner session, complete population and continuation, linkage, audit and expiry races"
    },
    {
      "id": "A3",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec prettier --check packages/application/src/foundation-work.ts packages/application/src/observatory-work.ts packages/application/src/observatory-work.test.ts packages/db/src/observatory-work-repository.ts packages/db/src/observatory-work.integration.test.ts",
      "expect": {
        "exit": 0
      },
      "covers": "Formatting"
    }
  ],
  "depends_on": [],
  "size": "M",
  "model": "gpt-6.1-sol"
}
```

## Convergence order
T13

## Risks
Owner authentication and current source membership must survive awaited audit.

## Escalation answers
Existing canonical Work/source contracts are captured in the seeds.
