# Observatory owner reviewed configuration controls

## Goal
Review complete canonical mappings and source configuration with versions and provenance.

## Non-goals
No backend, parent integration, credential or external setting change.

## Base
- branch: feat/observatory-operational-landscape
- check command: PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/ui/src/components/ObservatoryCanonicalViews.test.tsx
- probes: none (isolated component only)

## Interfaces
```json
[]
```

## Tasks
```json
{
  "task_id": "T17",
  "title": "Owner reviewed configuration controls",
  "goal": "Review complete canonical mappings and source configuration with versions and provenance.",
  "brief": {
    "change": "Owner mapping and source review controls",
    "check": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/ui/src/components/ObservatoryReviewControls.test.tsx"
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
    "docs/plans/observatory-operational-landscape/T17.md",
    "packages/contracts/src/observatory-catalogue.ts",
    "packages/ui/src/components/ObservatoryCanonicalViews.tsx",
    "packages/ui/src/components/ObservatoryCanonicalViews.test.tsx",
    "packages/ui/src/components/ObservatoryOperationalEvidence.tsx",
    "packages/ui/src/components/ObservatoryOperationalEvidence.test.tsx",
    "packages/ui/src/components/operational-observatory.css"
  ],
  "write_files": [],
  "create_files": [
    "packages/ui/src/components/ObservatoryReviewControls.tsx",
    "packages/ui/src/components/ObservatoryReviewControls.test.tsx",
    "packages/ui/src/components/observatory-review-controls.css"
  ],
  "forbidden": [
    "apps",
    "packages/db",
    "packages/domain",
    "packages/application"
  ],
  "acceptance": [
    {
      "id": "A1",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/ui/src/components/ObservatoryReviewControls.test.tsx",
      "expect": {
        "exit": 0
      },
      "covers": "Complete versioned owner controls, strict shared payloads, no invented topology, late scope and conflict handling"
    },
    {
      "id": "A2",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec prettier --check packages/ui/src/components/ObservatoryReviewControls.tsx packages/ui/src/components/ObservatoryReviewControls.test.tsx packages/ui/src/components/observatory-review-controls.css",
      "expect": {
        "exit": 0
      },
      "covers": "Formatting"
    }
  ],
  "depends_on": [],
  "size": "M",
  "model": "gpt-6.1-sol"
}
```

## Convergence order
T17

## Risks
Source enable is sensitive and remains explicit owner submission.

## Escalation answers
Shared strict catalogue and change schemas are committed. Coordinator owns all integration.
