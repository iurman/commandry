# Fixed Commandry readiness reader

## Goal
Observe the trusted Commandry readiness endpoint without any external monitoring account.

## Non-goals
No arbitrary monitor platform, account, credential, deployment or canonical binding changes.

## Base
- branch: feat/observatory-operational-landscape
- check command: PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/platform/src/commandry-readiness.test.ts
- probes: none (actual disposable HTTP tests in task)

## Interfaces
```json
[]
```

## Tasks
```json
{
  "task_id": "T18",
  "title": "Fixed Commandry readiness reader",
  "goal": "Observe the trusted Commandry readiness endpoint without any external monitoring account.",
  "brief": {
    "change": "Fixed Commandry readiness observation",
    "check": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/platform/src/commandry-readiness.test.ts"
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
    "package.json",
    "tsconfig.base.json",
    "vitest.config.mts",
    "vitest.setup.ts",
    "packages/contracts/src/observatory.ts",
    "packages/contracts/src/observatory-management.ts",
    "packages/contracts/src/observatory-queries.ts",
    "packages/contracts/src/observatory-operational.ts",
    "packages/contracts/src/observatory-catalogue.ts",
    "docs/plans/observatory-operational-landscape/T18.md",
    "packages/application/src/observatory-observations.ts",
    "packages/platform/src/infraagent-availability.ts",
    "packages/platform/src/infraagent-availability.test.ts",
    "docs/architecture/technology-stack.md",
    "docs/architecture/overview.md",
    "docs/architecture/events-and-integrations.md",
    "docs/architecture/security-and-permissions.md",
    "docs/domain/operations.md"
  ],
  "write_files": [],
  "create_files": [
    "packages/platform/src/commandry-readiness.ts",
    "packages/platform/src/commandry-readiness.test.ts"
  ],
  "forbidden": [
    "apps",
    "packages/db",
    "packages/domain",
    "packages/application",
    "packages/contracts",
    "packages/ui"
  ],
  "acceptance": [
    {
      "id": "A1",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/platform/src/commandry-readiness.test.ts",
      "expect": {
        "exit": 0
      },
      "covers": "Actual disposable HTTP ready, not-ready, recovery and bounded hostile boundaries"
    },
    {
      "id": "A2",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec prettier --check packages/platform/src/commandry-readiness.ts packages/platform/src/commandry-readiness.test.ts",
      "expect": {
        "exit": 0
      },
      "covers": "Formatting"
    },
    {
      "id": "A3",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec eslint packages/platform/src/commandry-readiness.ts packages/platform/src/commandry-readiness.test.ts",
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
T18

## Risks
Trusted APP_ORIGIN only. Enabling a reviewed binding remains an explicit owner operation.
