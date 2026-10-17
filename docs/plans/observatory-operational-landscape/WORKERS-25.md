# Compatible opt-in PR check evidence

## Goal

Preserve default legacy PR reads and age explicit current-head evidence from original timestamps.

## Non-goals

No storage/adapter/DB/credential/grant changes, CI truncation, new runtime/action or required-check-policy inference.

## Base

- branch: feat/observatory-operational-landscape
- check command: PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/contracts/src/observatory-operational.test.ts packages/application/src/observatory.test.ts apps/web/app/infrastructure/observatory-work-client.test.ts packages/ui/src/components/ObservatoryOperationalEvidence.test.tsx
- probes: none (local versioned read contract)

## Interfaces

```json
[{"file":"packages/application/src/observatory.ts","symbol":"ObservatoryReadAccess","kind":"interface"}]
```

## Tasks

```json
{
  "task_id": "T29",
  "title": "Preserve strict existing PR evidence clients",
  "goal": "Preserve default legacy PR reads and age explicit current-head evidence from original timestamps.",
  "brief": {
    "change": "Make expanded PR check evidence an explicit compatible read option",
    "check": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/contracts/src/observatory-operational.test.ts packages/application/src/observatory.test.ts apps/web/app/infrastructure/observatory-work-client.test.ts packages/ui/src/components/ObservatoryOperationalEvidence.test.tsx"
  },
  "seed_files": [
    "AGENTS.md",
    "docs/project/status.md",
    "docs/product/principles.md",
    "docs/project/open-questions.md",
    "docs/domain/core-model.md",
    "docs/domain/operations.md",
    "docs/features/infrastructure.md",
    "docs/features/gravity-observatory.md",
    "docs/architecture/technology-stack.md",
    "docs/architecture/overview.md",
    "docs/architecture/events-and-integrations.md",
    "docs/architecture/security-and-permissions.md",
    "docs/decisions/0015-show-the-complete-gravity-landscape.md",
    "docs/decisions/0016-project-the-operational-observatory.md",
    "docs/plans/observatory-operational-landscape/T29.md",
    "docs/architecture/observatory-agent-workflow.md",
    "package.json",
    "tsconfig.base.json",
    "vitest.config.mts",
    "vitest.setup.ts",
    "packages/contracts/package.json",
    "packages/contracts/src/observatory-queries.ts",
    "packages/contracts/src/observatory-repository.ts",
    "packages/application/package.json",
    "packages/application/tsconfig.json",
    "packages/application/src/observatory-provider-feed.test.ts",
    "packages/ui/src/components/ObservatoryOperationalEvidence.tsx",
    "packages/ui/src/components/ObservatoryOperationalEvidence.test.tsx",
    "apps/web/package.json",
    "apps/web/tsconfig.json",
    "apps/web/app/projects/api.ts",
    "apps/web/lib/load-infrastructure-scene.ts",
    "apps/web/app/infrastructure/observatory-work-client.ts",
    "packages/test-support/src/observatory.ts",
    "packages/contracts/src/observatory-operational.ts",
    "packages/contracts/src/observatory-operational.test.ts",
    "packages/application/src/observatory.ts",
    "packages/application/src/observatory.test.ts",
    "apps/web/app/infrastructure/InfrastructureOverviewScreen.tsx",
    "apps/web/app/infrastructure/observatory-work-client.test.ts"
  ],
  "write_files": [
    "packages/contracts/src/observatory-operational.ts",
    "packages/contracts/src/observatory-operational.test.ts",
    "packages/application/src/observatory.ts",
    "packages/application/src/observatory.test.ts",
    "apps/web/app/infrastructure/InfrastructureOverviewScreen.tsx",
    "apps/web/app/infrastructure/observatory-work-client.test.ts"
  ],
  "create_files": [],
  "forbidden": [
    "packages/db",
    "packages/platform"
  ],
  "acceptance": [
    {
      "id": "A1",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/contracts/src/observatory-operational.test.ts packages/application/src/observatory.test.ts apps/web/app/infrastructure/observatory-work-client.test.ts packages/ui/src/components/ObservatoryOperationalEvidence.test.tsx",
      "expect": {
        "exit": 0
      },
      "covers": "Causal strict old-client default compatibility, explicit complete CI evidence, owner caller opt-in and existing authority/refresh controls"
    },
    {
      "id": "A2",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm --filter @commandry/contracts --filter @commandry/application --filter @commandry/web typecheck",
      "expect": {
        "exit": 0
      },
      "covers": "Contract/service/actual caller types"
    },
    {
      "id": "A3",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec prettier --check packages/contracts/src/observatory-operational.ts packages/contracts/src/observatory-operational.test.ts packages/application/src/observatory.ts packages/application/src/observatory.test.ts apps/web/app/infrastructure/InfrastructureOverviewScreen.tsx apps/web/app/infrastructure/observatory-work-client.test.ts",
      "expect": {
        "exit": 0
      },
      "covers": "Formatting"
    },
    {
      "id": "A4",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec eslint packages/contracts/src/observatory-operational.ts packages/contracts/src/observatory-operational.test.ts packages/application/src/observatory.ts packages/application/src/observatory.test.ts apps/web/app/infrastructure/InfrastructureOverviewScreen.tsx apps/web/app/infrastructure/observatory-work-client.test.ts",
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

T29

## Risks

Default legacy response compatibility must not erase canonical CI or omit rows, bypass current auth, mutate source, or change non-PR callers. The new flag is optional explicit read negotiation; generated OpenAPI and agent docs must expose it.

## Escalation answers

The owner explicitly requires existing clients/grants preserved. Original independent T23 review proves old strict schema rejects new fields. Read T29.md for exact compatible behavior. You are not alone: T26 must converge before this task begins; T27 owns component/history, and T28 creates isolated QA tooling only. Do not revert others or edit outside6files. Root provisions frozen dependencies. No search/install/commit. Exact .agent/manifests/T29.json/CURRENT reads and python3 .agent/tools/review_packet.py build --manifest .agent/manifests/T29.json --repo . --base <immutablebasefrommanifest> administrative verification authorized; scratch .agent/scratch/T29/, packet .agent/review/. Verify never/FullAccess. Root independently reviews actual oldschema, OpenAPI and newbuilt API/MCP/UI after source acceptance.
