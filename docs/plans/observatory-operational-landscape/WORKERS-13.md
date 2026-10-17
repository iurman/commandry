# Observatory canonical Work browser integration

## Goal
Connect complete canonical Work to the operational landscape without inferring execution.

## Non-goals
No backend, dispatcher or source activation.

## Base
- branch: feat/observatory-operational-landscape
- check command: PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/ui/src/components/ObservatoryWorkDock.test.tsx
- probes: none (isolated browser component boundary only)

## Interfaces
```json
[]
```

## Tasks
```json
{
  "task_id": "T16",
  "title": "Canonical Work browser integration",
  "goal": "Connect complete canonical Work to the operational landscape without inferring execution.",
  "brief": {
    "change": "Canonical Work browser integration",
    "check": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/ui/src/gravity/operational-layout.test.ts packages/ui/src/components/ObservatoryWorkDock.test.tsx apps/web/app/infrastructure/observatory-work-client.test.ts"
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
    "packages/contracts/src/foundation-work.ts",
    "packages/contracts/src/work.ts",
    "packages/ui/src/components/ObservatoryCanonicalViews.tsx",
    "packages/ui/src/components/ObservatoryCanonicalViews.test.tsx",
    "packages/ui/src/components/operational-observatory.css",
    "docs/plans/observatory-operational-landscape/T16.md",
    "packages/ui/src/components/ObservatoryWorkDock.tsx",
    "packages/ui/src/components/ObservatoryWorkDock.test.tsx",
    "packages/ui/src/components/OperationalObservatory.tsx",
    "packages/ui/src/gravity/operational-layout.test.ts",
    "packages/ui/src/gravity/operational-layout.ts",
    "packages/ui/src/gravity/observatory-preferences.ts",
    "tests/fixtures/observatory.ts",
    "apps/web/app/infrastructure/InfrastructureOverviewScreen.tsx",
    "apps/web/app/infrastructure/observatory-views-client.ts",
    "apps/web/app/api/v1/infrastructure/observatory/work/page/route.ts",
    "apps/web/lib/observatory-http.test.ts"
  ],
  "write_files": [
    "packages/ui/src/components/OperationalObservatory.tsx",
    "packages/ui/src/components/operational-observatory.css",
    "packages/ui/src/gravity/operational-layout.test.ts",
    "apps/web/app/infrastructure/InfrastructureOverviewScreen.tsx"
  ],
  "create_files": [
    "apps/web/app/infrastructure/observatory-work-client.ts",
    "apps/web/app/infrastructure/observatory-work-client.test.ts"
  ],
  "forbidden": [
    "packages/db",
    "packages/domain",
    "packages/application",
    "apps/worker"
  ],
  "acceptance": [
    {
      "id": "A1",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/ui/src/gravity/operational-layout.test.ts packages/ui/src/components/ObservatoryWorkDock.test.tsx apps/web/app/infrastructure/observatory-work-client.test.ts",
      "expect": {
        "exit": 0
      },
      "covers": "Actual component Work integration, full project scope, pause, strict stable same-origin client"
    },
    {
      "id": "A2",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec prettier --check packages/ui/src/components/OperationalObservatory.tsx packages/ui/src/components/operational-observatory.css packages/ui/src/gravity/operational-layout.test.ts apps/web/app/infrastructure/InfrastructureOverviewScreen.tsx apps/web/app/infrastructure/observatory-work-client.ts apps/web/app/infrastructure/observatory-work-client.test.ts",
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
T16

## Risks
Work is distinct from execution and source observations.

## Escalation answers
Coordinator owns backend. Existing dock remains unchanged.
