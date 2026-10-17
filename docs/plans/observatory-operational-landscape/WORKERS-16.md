# Observable HTTP contract catalogue

## Goal
Publish the existing Observatory owner HTTP operations in the generated OpenAPI contract without changing runtime authority.

## Non-goals
No route, domain, owner-session, credential or MCP authority changes. Do not describe owner routes as machine-authenticated operations.

## Base
- branch: feat/observatory-operational-landscape
- check command: PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm contracts:check
- probes: none (local generated contract only; no remote writes required)

## Interfaces
```json
[]
```

## Tasks
```json
{
  "task_id": "T19",
  "title": "Observable HTTP contract catalogue",
  "goal": "Publish the existing Observatory owner HTTP operations in the generated OpenAPI contract without changing runtime authority.",
  "brief": {
    "change": "Document shared Observatory HTTP contracts",
    "check": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm contracts:check"
  },
  "seed_files": [
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
    "docs/architecture/technology-stack.md",
    "docs/architecture/overview.md",
    "docs/architecture/events-and-integrations.md",
    "docs/architecture/security-and-permissions.md",
    "docs/domain/operations.md",
    "AGENTS.md",
    "package.json",
    "tsconfig.base.json",
    "vitest.config.mts",
    "vitest.setup.ts",
    "packages/contracts/package.json",
    "packages/contracts/src/generate-openapi.ts",
    "packages/contracts/src/validate-openapi.mjs",
    "packages/contracts/src/observatory.ts",
    "packages/contracts/src/observatory-management.ts",
    "packages/contracts/src/observatory-queries.ts",
    "packages/contracts/src/observatory-operational.ts",
    "packages/contracts/src/observatory-catalogue.ts",
    "packages/contracts/src/observatory-provider-feed.ts",
    "packages/contracts/src/observatory-views.ts",
    "packages/contracts/src/observatory-repository.ts",
    "packages/contracts/src/agent-foundation.ts",
    "packages/application/src/observatory-work.ts",
    "apps/web/app/api/v1/infrastructure/observatory/[operation]/route.ts",
    "apps/web/app/api/v1/infrastructure/observatory/reviews/[operation]/route.ts",
    "apps/web/app/api/v1/infrastructure/observatory/views/[operation]/route.ts",
    "apps/web/app/api/v1/infrastructure/observatory/work/page/route.ts",
    "docs/features/gravity-observatory.md",
    "docs/architecture/observatory-agent-workflow.md",
    "docs/plans/observatory-operational-landscape/T19.md"
  ],
  "write_files": [
    "packages/contracts/src/generate-openapi.ts",
    "packages/contracts/openapi/openapi.json"
  ],
  "create_files": [
    "packages/contracts/src/observatory-openapi.test.ts"
  ],
  "forbidden": [
    "apps",
    "packages/db",
    "packages/domain",
    "packages/application",
    "packages/platform",
    "packages/ui"
  ],
  "acceptance": [
    {
      "id": "A1",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm contracts:check",
      "expect": {
        "exit": 0
      },
      "covers": "Deterministic generated OpenAPI and real validator"
    },
    {
      "id": "A2",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/contracts/src/observatory-openapi.test.ts",
      "expect": {
        "exit": 0
      },
      "covers": "Exact documented routes, canonical shared schema structure, authority and continuation descriptions"
    },
    {
      "id": "A3",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec prettier --check packages/contracts/src/generate-openapi.ts packages/contracts/src/observatory-openapi.test.ts packages/contracts/openapi/openapi.json",
      "expect": {
        "exit": 0
      },
      "covers": "Formatting"
    },
    {
      "id": "A4",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec eslint packages/contracts/src/generate-openapi.ts packages/contracts/src/observatory-openapi.test.ts",
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
T19

## Risks
Preserve every prior OpenAPI operation and schema. Use canonical shared Zod schemas and explicit owner-session/trusted-Origin descriptions. Generated JSON is large; inspect it with bounded JSON selections, never dump it.
