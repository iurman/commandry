# Observatory operational evidence queries

## Goal
Read independent operational evidence through shared authorization.

## Non-goals
No production activation, credentials or monitor writes.

## Base
- branch: feat/observatory-operational-landscape
- check command: PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/platform/src/cloudflare-status.test.ts
- probes: none (local disposable HTTP boundary only)

## Interfaces
```json
[{"file": "packages/domain/src/observatory.ts", "symbol": "ObservatorySignal", "kind": "type"}]
```

## Tasks
```json
{
  "task_id": "T11",
  "title": "Authorized operational evidence details",
  "goal": "Read independent operational evidence through shared authorization.",
  "brief": {
    "change": "Authorized operational evidence details",
    "check": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/application/src/observatory.test.ts packages/contracts/src/observatory-operational.test.ts"
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
    "packages/domain/src/observatory.ts",
    "packages/contracts/src/observatory.ts",
    "packages/application/src/observatory-observations.ts",
    "packages/platform/src/infraagent-availability.ts",
    "docs/plans/observatory-operational-landscape/T11.md",
    "packages/application/src/observatory.ts",
    "packages/application/src/observatory.test.ts",
    "packages/contracts/src/observatory-queries.ts",
    "packages/contracts/src/observatory-repository.ts",
    "packages/platform/src/github-observatory.ts"
  ],
  "write_files": [
    "packages/application/src/observatory.ts",
    "packages/application/src/observatory.test.ts"
  ],
  "create_files": [
    "packages/contracts/src/observatory-operational.ts",
    "packages/contracts/src/observatory-operational.test.ts"
  ],
  "forbidden": [
    "apps",
    "packages/db",
    "packages/ui"
  ],
  "acceptance": [
    {
      "id": "A1",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/application/src/observatory.test.ts packages/contracts/src/observatory-operational.test.ts",
      "expect": {
        "exit": 0
      },
      "covers": "Strict safe operational DTO and authorization across awaited current source evidence"
    },
    {
      "id": "A2",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec prettier --check packages/application/src/observatory.ts packages/application/src/observatory.test.ts packages/contracts/src/observatory-operational.ts packages/contracts/src/observatory-operational.test.ts",
      "expect": {
        "exit": 0
      },
      "covers": "Changed file formatting"
    }
  ],
  "depends_on": [],
  "size": "M",
  "model": "gpt-6.1-sol"
}
```

## Convergence order
T11

## Risks
Disposable proof cannot establish real monitor activation.

## Escalation answers
Official upstream contracts captured; real credentials and activation remain outside this task.
