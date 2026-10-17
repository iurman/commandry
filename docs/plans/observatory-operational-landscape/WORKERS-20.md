# Guided-tour activation correction

## Goal

Preserve automatic guided-tour progression while retaining direct input interruption.

## Non-goals

No new controls, settings, canonical data, mappings, availability, runtime, CI, source adapters or terrain planning changes. Keep the reviewed local terrain correction intact.

## Base

- branch: feat/observatory-operational-landscape
- check command: PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/ui/src/gravity/renderer-pressure.test.ts packages/ui/src/gravity/operational-layout.test.ts packages/ui/src/gravity/presentation.test.ts packages/ui/src/gravity/infrastructure.test.ts
- probes: none (local shared renderer/component only)

## Interfaces

```json
[
  {
    "file": "packages/ui/src/gravity/model.ts",
    "symbol": "Well",
    "kind": "type"
  }
]
```

## Tasks

```json
{
  "task_id": "T24",
  "title": "Preserve automatic guided tour progression",
  "goal": "Preserve automatic guided-tour progression while retaining direct input interruption.",
  "brief": {
    "change": "Separate automatic tour feature from direct activation",
    "check": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/ui/src/gravity/renderer-pressure.test.ts packages/ui/src/gravity/operational-layout.test.ts packages/ui/src/gravity/presentation.test.ts packages/ui/src/gravity/infrastructure.test.ts"
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
    "docs/plans/observatory-operational-landscape/T24.md",
    "package.json",
    "tsconfig.base.json",
    "vitest.config.mts",
    "vitest.setup.ts",
    "packages/ui/package.json",
    "packages/ui/tsconfig.json",
    "packages/ui/src/gravity/model.ts",
    "packages/ui/src/gravity/presentation.ts",
    "packages/ui/src/gravity/presentation.test.ts",
    "packages/ui/src/gravity/infrastructure.ts",
    "packages/ui/src/gravity/infrastructure.test.ts",
    "packages/ui/src/gravity/operational-layout.ts",
    "packages/ui/src/gravity/labels.ts",
    "packages/ui/src/gravity/field.ts",
    "packages/ui/src/gravity/basin-geometry.ts",
    "packages/ui/src/gravity/activity-types.ts",
    "packages/ui/src/gravity/materials.ts",
    "packages/ui/src/gravity/observatory-preferences.ts",
    "packages/test-support/src/observatory.ts",
    "packages/contracts/src/observatory.ts",
    "apps/web/app/infrastructure/InfrastructureOverviewScreen.tsx",
    "packages/ui/src/gravity/renderer.ts",
    "packages/ui/src/components/OperationalObservatory.tsx",
    "packages/ui/src/gravity/renderer-pressure.test.ts",
    "packages/ui/src/gravity/operational-layout.test.ts"
  ],
  "write_files": [
    "packages/ui/src/gravity/renderer.ts",
    "packages/ui/src/components/OperationalObservatory.tsx",
    "packages/ui/src/gravity/renderer-pressure.test.ts",
    "packages/ui/src/gravity/operational-layout.test.ts"
  ],
  "create_files": [],
  "forbidden": [
    "apps",
    "packages/db",
    "packages/platform",
    "packages/domain",
    "packages/contracts"
  ],
  "acceptance": [
    {
      "id": "A1",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/ui/src/gravity/renderer-pressure.test.ts packages/ui/src/gravity/operational-layout.test.ts packages/ui/src/gravity/presentation.test.ts packages/ui/src/gravity/infrastructure.test.ts",
      "expect": {
        "exit": 0
      },
      "covers": "Causal natural tour progression and actual component direct/automatic activation regressions plus existing terrain and presentation tests"
    },
    {
      "id": "A2",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm --filter @commandry/ui typecheck",
      "expect": {
        "exit": 0
      },
      "covers": "Shared renderer-hook consumer compatibility"
    },
    {
      "id": "A3",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec prettier --check packages/ui/src/gravity/renderer.ts packages/ui/src/components/OperationalObservatory.tsx packages/ui/src/gravity/renderer-pressure.test.ts packages/ui/src/gravity/operational-layout.test.ts",
      "expect": {
        "exit": 0
      },
      "covers": "Formatting"
    },
    {
      "id": "A4",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec eslint packages/ui/src/gravity/renderer.ts packages/ui/src/components/OperationalObservatory.tsx packages/ui/src/gravity/renderer-pressure.test.ts packages/ui/src/gravity/operational-layout.test.ts",
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

T24

## Risks

Automatic selection currently reaches both manual camera state and focusSubject interruption. Correct both feedback paths while preserving direct clicks/search/drag, scope resets and all canonical IDs. RendererHooks is deliberately mutable within its write set; pin only the unchanged Well boundary. Existing consumers must remain compatible.

## Escalation answers

Owner authorized the complete upgrade and deliberate guided tour. Read T24.md for the exact built reproduction and result. Existing frozen dependencies will be provisioned by root. You are not alone: T23 owns separate evidence/adapter files and reviewers use immutable20a6967 built assets. Do not revert their work, install or commit. Read only the generated manifest; stop with a precise escalation for missing context. Capture causal failures and preserve the original thresholds/deadlines. Root owns independent actual-built closure.
