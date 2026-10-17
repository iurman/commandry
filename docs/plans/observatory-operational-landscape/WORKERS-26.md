# Retained evidence refresh recovery

## Goal

Show successful same-revision evidence refresh after an error without changing request identity or clocks.

## Non-goals

No contract, source, application, credential, grant, renderer, request or clock changes. No redesign.

## Base

- branch: loop/retained-evidence-refresh-recovery/T30
- check command: PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/contracts/src/observatory-operational.test.ts packages/application/src/observatory.test.ts apps/web/app/infrastructure/observatory-work-client.test.ts packages/ui/src/components/ObservatoryOperationalEvidence.test.tsx
- probes: none (local evidence state)

The isolated task starts from committed T29 candidate d916ff1bc916083e9db85a81ec9362f8b3651959. Its own task branch resolves the actual immutable plan-only task HEAD after the normal documentation cherry-pick.

## Interfaces

```json
[{"file":"packages/ui/src/components/ObservatoryOperationalEvidence.tsx","symbol":"ObservatoryEvidenceClient","kind":"type"}]
```

## Tasks

```json
{
  "task_id": "T30",
  "title": "Recover retained evidence after successful manual refresh",
  "goal": "Show successful same-revision evidence refresh after an error without changing request identity or clocks.",
  "brief": {
    "change": "Clear the accepted current-generation evidence failure",
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
    "packages/contracts/src/observatory-repository.ts",
    "apps/web/package.json",
    "apps/web/tsconfig.json",
    "apps/web/app/projects/api.ts",
    "apps/web/lib/load-infrastructure-scene.ts",
    "apps/web/app/infrastructure/observatory-work-client.ts",
    "packages/test-support/src/observatory.ts",
    "packages/contracts/src/observatory-operational.ts",
    "packages/application/src/observatory.ts",
    "docs/plans/observatory-operational-landscape/T30.md",
    "packages/ui/package.json",
    "packages/ui/tsconfig.json",
    "packages/ui/src/components/OperationalObservatory.tsx",
    "apps/web/app/infrastructure/InfrastructureOverviewScreen.tsx",
    "packages/ui/src/components/ObservatoryOperationalEvidence.tsx",
    "packages/ui/src/components/ObservatoryOperationalEvidence.test.tsx",
    "apps/web/app/infrastructure/observatory-work-client.test.ts"
  ],
  "write_files": [
    "packages/ui/src/components/ObservatoryOperationalEvidence.tsx",
    "packages/ui/src/components/ObservatoryOperationalEvidence.test.tsx",
    "apps/web/app/infrastructure/observatory-work-client.test.ts"
  ],
  "create_files": [],
  "forbidden": [
    "packages/db",
    "packages/platform",
    "packages/domain",
    "packages/application",
    "packages/contracts"
  ],
  "acceptance": [
    {
      "id": "A1",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/contracts/src/observatory-operational.test.ts packages/application/src/observatory.test.ts apps/web/app/infrastructure/observatory-work-client.test.ts packages/ui/src/components/ObservatoryOperationalEvidence.test.tsx",
      "expect": {
        "exit": 0
      },
      "covers": "Unchanged actual-parent failed refresh control, leaf recovery and stale-generation controls, retained compatible read/activity tests"
    },
    {
      "id": "A2",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm --filter @commandry/ui --filter @commandry/web typecheck",
      "expect": {
        "exit": 0
      },
      "covers": "Leaf/caller types"
    },
    {
      "id": "A3",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec prettier --check packages/ui/src/components/ObservatoryOperationalEvidence.tsx packages/ui/src/components/ObservatoryOperationalEvidence.test.tsx apps/web/app/infrastructure/observatory-work-client.test.ts",
      "expect": {
        "exit": 0
      },
      "covers": "Formatting"
    },
    {
      "id": "A4",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec eslint packages/ui/src/components/ObservatoryOperationalEvidence.tsx packages/ui/src/components/ObservatoryOperationalEvidence.test.tsx apps/web/app/infrastructure/observatory-work-client.test.ts",
      "expect": {
        "exit": 0
      },
      "covers": "Lint"
    }
  ],
  "depends_on": [],
  "size": "S",
  "model": "gpt-6.1-sol"
}
```

## Convergence order

T30

## Risks

T29 is a committed blocked candidate, with original packet and independent compatibility evidence preserved. T30 starts only after T29 releases its source ownership. Preserve stale response and scope guards and all original T29/T26 assertions. Root converges both only after independent combined review; this standalone task stays within the six-file worker limit.

## Escalation answers

Read T30.md and exact supplied independent causal control. You are not alone: T29 source is committed/frozen, T27 camera and T28 tooling are separately converged. No source edits outside three paths, no search/install/commit/push. Root provisions normal frozen dependencies. Exact .agent/manifests/T30.json/CURRENT administrative reads, scratch .agent/scratch/T30/ and python3 .agent/tools/review_packet.py build --manifest .agent/manifests/T30.json --repo . --base <actual immutable base> authorized. Verify actual never/FullAccess. Root owns exact independent re-review and final actual browser/API/MCP.
