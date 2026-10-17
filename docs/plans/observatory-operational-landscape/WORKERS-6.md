# Observatory repository evidence slice

## Goal
Read supported repository PR and security evidence safely.

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
  "task_id": "T09",
  "title": "Supported repository evidence through a bounded reader",
  "goal": "Supported repository evidence through a bounded reader.",
  "brief": {
    "change": "Supported repository evidence through a bounded reader",
    "check": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/contracts/src/observatory-repository.test.ts packages/platform/src/github-observatory.test.ts"
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
    "docs/plans/observatory-operational-landscape/T09.md",
    "packages/domain/src/observatory.ts",
    "packages/contracts/src/observatory.ts",
    "docs/plans/observatory-operational-landscape/GITHUB-READ-CONTRACT.md",
    "packages/application/src/observatory-observations.ts",
    "packages/platform/src/infraagent-availability.ts",
    "packages/platform/src/infraagent-availability.test.ts"
  ],
  "write_files": [],
  "create_files": [
    "packages/contracts/src/observatory-repository.ts",
    "packages/contracts/src/observatory-repository.test.ts",
    "packages/platform/src/github-observatory.ts",
    "packages/platform/src/github-observatory.test.ts"
  ],
  "forbidden": [
    "apps",
    "packages/db"
  ],
  "acceptance": [
    {
      "id": "A1",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/contracts/src/observatory-repository.test.ts packages/platform/src/github-observatory.test.ts",
      "expect": {
        "exit": 0
      },
      "covers": "Complete independent repository facets through faithful disposable HTTP boundaries"
    },
    {
      "id": "A2",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec prettier --check packages/contracts/src/observatory-repository.ts packages/contracts/src/observatory-repository.test.ts packages/platform/src/github-observatory.ts packages/platform/src/github-observatory.test.ts",
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
T09

## Risks
Disposable proof cannot establish real monitor activation.

## Escalation answers
Official upstream contracts captured; real credentials and activation remain outside this task.
