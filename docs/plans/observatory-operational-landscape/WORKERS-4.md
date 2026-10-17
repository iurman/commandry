# Observatory supported availability slice

## Goal
Read supported timestamped availability safely.

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
  "task_id": "T06",
  "title": "Supported availability evidence through a bounded reader",
  "goal": "Supported availability evidence through a bounded reader.",
  "brief": {
    "change": "Supported availability evidence through a bounded reader",
    "check": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/application/src/observatory-observations.test.ts packages/platform/src/infraagent-availability.test.ts"
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
    "docs/plans/observatory-operational-landscape/T06.md",
    "docs/plans/observatory-operational-landscape/INFRAAGENT-READ-CONTRACT.md",
    "packages/domain/src/observatory.ts",
    "packages/contracts/src/observatory.ts",
    "packages/application/src/provider-status.ts",
    "packages/platform/src/cloudflare-status.ts",
    "packages/platform/src/cloudflare-status.test.ts"
  ],
  "write_files": [],
  "create_files": [
    "packages/application/src/observatory-observations.ts",
    "packages/application/src/observatory-observations.test.ts",
    "packages/platform/src/infraagent-availability.ts",
    "packages/platform/src/infraagent-availability.test.ts"
  ],
  "forbidden": [
    "apps",
    "packages/db"
  ],
  "acceptance": [
    {
      "id": "A1",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/application/src/observatory-observations.test.ts packages/platform/src/infraagent-availability.test.ts",
      "expect": {
        "exit": 0
      },
      "covers": "Faithful disposable availability failure/recovery and protocol/poller rejection"
    },
    {
      "id": "A2",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec prettier --check packages/application/src/observatory-observations.ts packages/application/src/observatory-observations.test.ts packages/platform/src/infraagent-availability.ts packages/platform/src/infraagent-availability.test.ts",
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
T06

## Risks
Disposable proof cannot establish real monitor activation.

## Escalation answers
Exact source interface verified and captured; credentials pending owner.
