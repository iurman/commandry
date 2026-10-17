# Current-head pull request evidence correction

## Goal

Read and display exact current-head CI evidence independently from service availability and agent runtime.

## Non-goals

No GitHub writes, merge/rerun controls, credentials, production activation, new grants, database schema, availability, canonical mappings, runtime dispatcher or geometry changes. Root owns generated OpenAPI and final persistence/browser/protocol integration after convergence.

## Base

- branch: feat/observatory-operational-landscape
- check command: PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/contracts/src/observatory-repository.test.ts packages/platform/src/github-observatory.test.ts packages/ui/src/components/ObservatoryOperationalEvidence.test.tsx packages/application/src/observatory-observations.test.ts
- probes: none (disposable loopback adapter tests only)

## Interfaces

```json
[
  {
    "file": "packages/application/src/observatory-observations.ts",
    "symbol": "OperationalObservation",
    "kind": "type"
  },
  {
    "file": "packages/contracts/src/observatory-repository.ts",
    "symbol": "observatoryRepositoryEvidenceSchema",
    "kind": "schema"
  }
]
```

## Tasks

```json
{
  "task_id": "T23",
  "title": "Read current-head pull request checks",
  "goal": "Read and display exact current-head CI evidence independently from service availability and agent runtime.",
  "brief": {
    "change": "Add supported current-head PR check evidence",
    "check": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/contracts/src/observatory-repository.test.ts packages/platform/src/github-observatory.test.ts packages/ui/src/components/ObservatoryOperationalEvidence.test.tsx packages/application/src/observatory-observations.test.ts"
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
    "docs/plans/observatory-operational-landscape/T23.md",
    "package.json",
    "pnpm-workspace.yaml",
    "tsconfig.base.json",
    "vitest.config.mts",
    "vitest.setup.ts",
    "packages/domain/src/observatory.ts",
    "packages/application/src/observatory-observations.ts",
    "packages/application/src/observatory-observations.test.ts",
    "packages/contracts/src/observatory-operational.ts",
    "packages/contracts/package.json",
    "packages/platform/package.json",
    "packages/platform/tsconfig.json",
    "packages/ui/package.json",
    "packages/ui/tsconfig.json",
    "packages/contracts/src/observatory.ts",
    "packages/contracts/src/observatory-repository.ts",
    "packages/contracts/src/observatory-repository.test.ts",
    "packages/platform/src/github-observatory.ts",
    "packages/platform/src/github-observatory.test.ts",
    "packages/ui/src/components/ObservatoryOperationalEvidence.tsx",
    "packages/ui/src/components/ObservatoryOperationalEvidence.test.tsx"
  ],
  "write_files": [
    "packages/contracts/src/observatory-repository.ts",
    "packages/contracts/src/observatory-repository.test.ts",
    "packages/platform/src/github-observatory.ts",
    "packages/platform/src/github-observatory.test.ts",
    "packages/ui/src/components/ObservatoryOperationalEvidence.tsx",
    "packages/ui/src/components/ObservatoryOperationalEvidence.test.tsx"
  ],
  "create_files": [],
  "forbidden": [
    "apps",
    "packages/db",
    "packages/domain"
  ],
  "acceptance": [
    {
      "id": "A1",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/contracts/src/observatory-repository.test.ts packages/platform/src/github-observatory.test.ts packages/ui/src/components/ObservatoryOperationalEvidence.test.tsx packages/application/src/observatory-observations.test.ts",
      "expect": {
        "exit": 0
      },
      "covers": "Causal current-head check/status, transport, compatibility and actual UI regressions with all existing cases"
    },
    {
      "id": "A2",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm --filter @commandry/contracts --filter @commandry/platform --filter @commandry/ui --filter @commandry/application typecheck",
      "expect": {
        "exit": 0
      },
      "covers": "Shared contract and actual consumers remain type-safe"
    },
    {
      "id": "A3",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec prettier --check packages/contracts/src/observatory-repository.ts packages/contracts/src/observatory-repository.test.ts packages/platform/src/github-observatory.ts packages/platform/src/github-observatory.test.ts packages/ui/src/components/ObservatoryOperationalEvidence.tsx packages/ui/src/components/ObservatoryOperationalEvidence.test.tsx",
      "expect": {
        "exit": 0
      },
      "covers": "Formatting"
    },
    {
      "id": "A4",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec eslint packages/contracts/src/observatory-repository.ts packages/contracts/src/observatory-repository.test.ts packages/platform/src/github-observatory.ts packages/platform/src/github-observatory.test.ts packages/ui/src/components/ObservatoryOperationalEvidence.tsx packages/ui/src/components/ObservatoryOperationalEvidence.test.tsx",
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

T23

## Risks

Current-head identity, partial permissions, pagination and old persisted payload compatibility require explicit tests. Keep independent security evidence and old PR reads intact. Raw nesting must remain compatible with the shared poller. Six writable files keep ownership exclusive; the explicit read budget covers existing large adapter/test context with depth0, not repository exploration.

## Escalation answers

The full operational upgrade and failed PR-check distinction are already authorized. Read T23.md for the supported official read boundary and acceptance gap. Use existing dependencies; root supplies frozen local dependencies with normal lifecycle. You are not alone: root/T20/reviewers work elsewhere. Do not revert their edits, install dependencies or commit. Never search beyond the manifest; stop with a precise escalation when a required path is missing. Root owns OpenAPI generation/doc changes and final built/persistence verification.
