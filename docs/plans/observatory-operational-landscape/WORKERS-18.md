# Provider plane context correction

## Goal

Preserve structured provider-plane meaning through shared exposure contracts and the actual inspector without changing availability or causation.

## Non-goals

No provider classification, incident lifecycle, source adapter, availability, permission, canonical configuration or action changes. No new visible control.

## Base

- branch: feat/observatory-operational-landscape
- check command: PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/domain/src/observatory.test.ts packages/ui/src/gravity/operational-layout.test.ts
- probes: none (local shared projection and inspector only)

## Interfaces

```json
[
  {
    "file": "packages/domain/src/observatory.ts",
    "symbol": "ObservatoryProviderNotice",
    "kind": "type"
  },
  {
    "file": "packages/domain/src/observatory.ts",
    "symbol": "ObservatoryProviderDependency",
    "kind": "type"
  }
]
```

## Tasks

```json
{
  "task_id": "T21",
  "title": "Preserve provider plane context",
  "goal": "Preserve structured provider-plane meaning through shared exposure contracts and the actual inspector without changing availability or causation.",
  "brief": {
    "change": "Carry explicit provider-plane context to the inspector",
    "check": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/domain/src/observatory.test.ts packages/ui/src/gravity/operational-layout.test.ts"
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
    "docs/ux/information-architecture.md",
    "docs/ux/design-system-and-sensory-language.md",
    "docs/architecture/local-experience-lab.md",
    "docs/architecture/events-and-integrations.md",
    "docs/architecture/security-and-permissions.md",
    "docs/architecture/technology-stack.md",
    "docs/decisions/0015-show-the-complete-gravity-landscape.md",
    "docs/decisions/0016-project-the-operational-observatory.md",
    "docs/plans/observatory-operational-landscape/T21.md",
    "package.json",
    "tsconfig.base.json",
    "vitest.config.mts",
    "vitest.setup.ts",
    "packages/domain/package.json",
    "packages/contracts/package.json",
    "packages/ui/package.json",
    "packages/ui/tsconfig.json",
    "packages/test-support/src/observatory.ts",
    "packages/application/src/observatory.ts",
    "packages/contracts/src/generate-openapi.ts",
    "packages/contracts/src/validate-openapi.mjs",
    "packages/contracts/src/observatory.test.ts",
    "packages/domain/src/observatory.ts",
    "packages/contracts/src/observatory.ts",
    "packages/ui/src/components/OperationalObservatory.tsx",
    "packages/domain/src/observatory.test.ts",
    "packages/ui/src/gravity/operational-layout.test.ts"
  ],
  "write_files": [
    "packages/domain/src/observatory.ts",
    "packages/contracts/src/observatory.ts",
    "packages/ui/src/components/OperationalObservatory.tsx",
    "packages/domain/src/observatory.test.ts",
    "packages/ui/src/gravity/operational-layout.test.ts",
    "packages/contracts/openapi/openapi.json"
  ],
  "create_files": [],
  "forbidden": ["apps", "packages/db", "packages/platform"],
  "acceptance": [
    {
      "id": "A1",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/domain/src/observatory.test.ts packages/ui/src/gravity/operational-layout.test.ts packages/contracts/src/observatory.test.ts",
      "expect": {
        "exit": 0
      },
      "covers": "Meaningful domain and actual inspector plane regression with passing availability and all existing semantics"
    },
    {
      "id": "A2",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec tsx packages/contracts/src/generate-openapi.ts && PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm contracts:check",
      "expect": {
        "exit": 0
      },
      "covers": "Deterministic strict shared HTTP/MCP OpenAPI contract"
    },
    {
      "id": "A3",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm --filter @commandry/domain --filter @commandry/contracts --filter @commandry/ui --filter @commandry/application typecheck",
      "expect": {
        "exit": 0
      },
      "covers": "Shared consumers type compatibility"
    },
    {
      "id": "A4",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec prettier --check packages/domain/src/observatory.ts packages/contracts/src/observatory.ts packages/ui/src/components/OperationalObservatory.tsx packages/domain/src/observatory.test.ts packages/ui/src/gravity/operational-layout.test.ts packages/contracts/openapi/openapi.json",
      "expect": {
        "exit": 0
      },
      "covers": "Formatting"
    },
    {
      "id": "A5",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec eslint packages/domain/src/observatory.ts packages/contracts/src/observatory.ts packages/ui/src/components/OperationalObservatory.tsx packages/domain/src/observatory.test.ts packages/ui/src/gravity/operational-layout.test.ts",
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

T21

## Risks

Generated OpenAPI is large; inspect bounded structural differences. Preserve old operation/schema structure except the intentional exposure plane field. Do not infer local service impact from provider plane. Existing machine and owner consumers must share the same projection.

## Escalation answers

The owner authorized this operational upgrade and these truthful-status distinctions. Read T21.md for confirmed defect and required narrow correction. Existing dependencies are provided. You are not alone; root/T20/reviewers work elsewhere. Do not revert other edits, install or commit. Stop with a scoped escalation if another path is genuinely required.
