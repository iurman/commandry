# Operational MCP query derivation correction

## Goal

Restore compiled owner and MCP compatibility after shared Observatory changes.

## Non-goals

No source, storage, adapter, credential, grant, freshness or original evidence changes. No test assertion weakening, UX change or authority expansion.

## Base

- branch: loop/operational-mcp-query-derivation-correction/T31
- check command: PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/contracts/src/observatory-operational.test.ts
- probes: none (local shared contract and SDK boundary)

The full candidate suite retains3actual SDK failures and2886passing tests. Directly calling omit on the newly refined operational owner query throws. Use the already-passing contract suite as the base check; preserve and correct the actual failed SDK controls in task acceptance. The task branch starts at c32be1b and resolves its actual documentation-only cherry-pick as immutable base.

## Interfaces

```json
[{"file":"packages/contracts/src/observatory-operational.ts","symbol":"ObservatoryOperationalSourceRecord","kind":"type"}]
```

## Tasks

```json
{
  "task_id": "T31",
  "title": "Restore owner web compilation and strict operational MCP input",
  "goal": "Restore compiled owner and MCP compatibility after shared Observatory changes.",
  "brief": {
    "change": "Derive strict tool inputs before refinement and retain compatible reverse history lookup",
    "check": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/contracts/src/observatory-operational.test.ts packages/application/src/observatory.test.ts apps/web/app/infrastructure/observatory-work-client.test.ts packages/ui/src/components/ObservatoryOperationalEvidence.test.tsx apps/web/lib/observatory-mcp.test.ts packages/ui/src/gravity/operational-layout.test.ts packages/ui/src/gravity/renderer-pressure.test.ts"
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
    "packages/ui/package.json",
    "packages/ui/tsconfig.json",
    "packages/ui/src/components/OperationalObservatory.tsx",
    "apps/web/app/infrastructure/InfrastructureOverviewScreen.tsx",
    "packages/ui/src/components/ObservatoryOperationalEvidence.tsx",
    "packages/ui/src/components/ObservatoryOperationalEvidence.test.tsx",
    "apps/web/app/infrastructure/observatory-work-client.test.ts",
    "docs/plans/observatory-operational-landscape/T31.md",
    "packages/contracts/package.json",
    "packages/contracts/src/agent-foundation.ts",
    "packages/contracts/src/observatory-operational.test.ts",
    "packages/contracts/src/observatory-queries.ts",
    "packages/contracts/src/index.ts",
    "apps/web/lib/foundation-mcp.ts",
    "apps/web/lib/observatory-mcp.ts",
    "apps/web/lib/observatory-mcp.test.ts",
    "packages/application/src/observatory.test.ts",
    "packages/ui/src/gravity/operational-layout.test.ts",
    "packages/ui/src/gravity/renderer-pressure.test.ts"
  ],
  "write_files": [
    "packages/contracts/src/observatory-operational.ts",
    "packages/contracts/src/observatory-operational.test.ts",
    "apps/web/lib/foundation-mcp.ts",
    "apps/web/lib/observatory-mcp.test.ts",
    "packages/ui/src/components/OperationalObservatory.tsx"
  ],
  "create_files": [],
  "forbidden": [
    "packages/db",
    "packages/platform",
    "packages/domain",
    "packages/application"
  ],
  "acceptance": [
    {
      "id": "A1",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/contracts/src/observatory-operational.test.ts packages/application/src/observatory.test.ts apps/web/app/infrastructure/observatory-work-client.test.ts packages/ui/src/components/ObservatoryOperationalEvidence.test.tsx apps/web/lib/observatory-mcp.test.ts packages/ui/src/gravity/operational-layout.test.ts packages/ui/src/gravity/renderer-pressure.test.ts",
      "expect": {
        "exit": 0
      },
      "covers": "Actual SDK registration/discovery and strict no-project tool opt-in, unchanged old/default/current-age/authority/recovery controls; unchanged breadcrumb, tour, renderer and camera controls"
    },
    {
      "id": "A2",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm --filter @commandry/contracts --filter @commandry/ui --filter @commandry/web typecheck",
      "expect": {
        "exit": 0
      },
      "covers": "Shared owner/tool query and SDK types"
    },
    {
      "id": "A3",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec prettier --check packages/contracts/src/observatory-operational.ts packages/contracts/src/observatory-operational.test.ts apps/web/lib/foundation-mcp.ts apps/web/lib/observatory-mcp.test.ts packages/ui/src/components/OperationalObservatory.tsx",
      "expect": {
        "exit": 0
      },
      "covers": "Formatting"
    },
    {
      "id": "A4",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec eslint packages/contracts/src/observatory-operational.ts packages/contracts/src/observatory-operational.test.ts apps/web/lib/foundation-mcp.ts apps/web/lib/observatory-mcp.test.ts packages/ui/src/components/OperationalObservatory.tsx",
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

T31

## Risks

The SDK derives project-free tool input by omitting projectId from a refined owner Zod object, which is unsupported and prevents server initialization. Preserve one shared cross-field rule and strict shape, derive the tool input before object refinement, and keep actor project authority server supplied. Root owns generated OpenAPI validation, final full-suite/build and actual protocol. The root web compilation also caught the T27 reverse history lookup using findLastIndex, outside the accepted web TypeScript library. Replace only that lookup with equivalent supported reverse iteration, preserving all saved-pose/current-tour semantics and existing tests. Do not change the compiler target. No source writes outside the five paths.

## Escalation answers

Read T31.md and exact local context if supplied. You are not alone; all other source work is integrated/frozen. No search/install/commit/push. Root provisions normal frozen dependencies. Administrative reads of .agent/manifests/T31.json/CURRENT, scratch .agent/scratch/T31/ and python3 .agent/tools/review_packet.py build --manifest .agent/manifests/T31.json --repo . --base <actual immutable base> are authorized. Verify delivered never and Full Access. Retain exact original failing SDK assertions before correction, then add actual opt-in discovery and authorized/rejected owner/project fields/other-facet tests as appropriate. No registration bypass, duplicate divergent query validation or dropped constraint. The exact known web compilation failure is independent of MCP registration; preserve both causes and fixes in the report.
