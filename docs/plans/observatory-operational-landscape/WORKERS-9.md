# Observatory canonical Work dock

## Goal
Show actual canonical Work independently of unavailable execution state.

## Non-goals
No dispatcher, active-run inference or backend implementation.

## Base
- branch: feat/observatory-operational-landscape
- check command: PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/contracts/src/observatory-queries.test.ts
- probes: none (local UI tests only)

## Interfaces
```json
[]
```

## Tasks
```json
{
  "task_id": "T12",
  "title": "Complete canonical Work dock",
  "goal": "Show actual canonical Work independently of unavailable execution state.",
  "brief": {
    "change": "Canonical Work dock",
    "check": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/ui/src/components/ObservatoryWorkDock.test.tsx"
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
    "docs/plans/observatory-operational-landscape/T12.md",
    "package.json",
    "tsconfig.base.json",
    "vitest.config.mts",
    "vitest.setup.ts",
    "packages/contracts/src/foundation-work.ts",
    "packages/contracts/src/work.ts",
    "packages/application/src/foundation-work.ts",
    "packages/ui/src/components/ObservatoryCanonicalViews.tsx",
    "packages/ui/src/components/ObservatoryCanonicalViews.test.tsx",
    "packages/ui/src/components/operational-observatory.css"
  ],
  "write_files": [],
  "create_files": [
    "packages/ui/src/components/ObservatoryWorkDock.tsx",
    "packages/ui/src/components/ObservatoryWorkDock.test.tsx",
    "packages/ui/src/components/observatory-work-dock.css"
  ],
  "forbidden": [
    "apps",
    "packages/db",
    "packages/domain"
  ],
  "acceptance": [
    {
      "id": "A1",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/ui/src/components/ObservatoryWorkDock.test.tsx",
      "expect": {
        "exit": 0
      },
      "covers": "Complete canonical Work, shared identity, absence of actual runtime, scope and partial-read guards"
    },
    {
      "id": "A2",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec prettier --check packages/ui/src/components/ObservatoryWorkDock.tsx packages/ui/src/components/ObservatoryWorkDock.test.tsx packages/ui/src/components/observatory-work-dock.css",
      "expect": {
        "exit": 0
      },
      "covers": "Changed files formatting"
    }
  ],
  "depends_on": [],
  "size": "M",
  "model": "gpt-6.1-sol"
}
```

## Convergence order
T12

## Risks
Canonical Work does not establish active execution.

## Escalation answers
Use only the released captured contract; coordinator owns service/API integration.
