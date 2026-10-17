# Observatory reviewed configuration reads

## Goal
Read reviewed mappings and source configuration through shared authority.

## Non-goals
No source activation, new grants or production writes.

## Base
- branch: feat/observatory-operational-landscape
- check command: PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/contracts/src/observatory-operational.test.ts
- probes: none (shared service unit/contract boundary only)

## Interfaces
```json
[{"file": "packages/application/src/observatory.ts", "symbol": "ObservatoryReadAccess", "kind": "interface"}]
```

## Tasks
```json
{
  "task_id": "T15",
  "title": "Authorized reviewed configuration catalogue",
  "goal": "Read reviewed mappings and source configuration through shared authority.",
  "brief": {
    "change": "Authorized Observatory configuration catalogue",
    "check": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/application/src/observatory.test.ts packages/contracts/src/observatory-catalogue.test.ts"
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
    "docs/plans/observatory-operational-landscape/T15.md",
    "package.json",
    "tsconfig.base.json",
    "vitest.config.mts",
    "vitest.setup.ts",
    "packages/application/src/observatory.ts",
    "packages/application/src/observatory.test.ts",
    "packages/contracts/src/observatory.ts",
    "packages/contracts/src/observatory-management.ts",
    "packages/contracts/src/observatory-queries.ts",
    "packages/contracts/src/observatory-operational.ts"
  ],
  "write_files": [
    "packages/application/src/observatory.ts",
    "packages/application/src/observatory.test.ts"
  ],
  "create_files": [
    "packages/contracts/src/observatory-catalogue.ts",
    "packages/contracts/src/observatory-catalogue.test.ts"
  ],
  "forbidden": [
    "apps",
    "packages/db",
    "packages/ui",
    "packages/domain"
  ],
  "acceptance": [
    {
      "id": "A1",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/application/src/observatory.test.ts packages/contracts/src/observatory-catalogue.test.ts",
      "expect": {
        "exit": 0
      },
      "covers": "Canonical versioned configuration, complete scoped reads, owner-only source configuration, await integrity and existing reads"
    },
    {
      "id": "A2",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec prettier --check packages/application/src/observatory.ts packages/application/src/observatory.test.ts packages/contracts/src/observatory-catalogue.ts packages/contracts/src/observatory-catalogue.test.ts",
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
T15

## Risks
Shared endpoints do not grant cross-project source access.

## Escalation answers
Exact canonical shapes and auxiliary-read pattern are captured.
