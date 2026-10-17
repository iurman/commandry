# Routine refresh activity correction

## Goal

Deliver new observation pulses during ordinary same-scope refresh without replaying suppressed activity.

## Non-goals

No UI renderer/component/activity-source edits, new controls, canonical data, source adapters, external polling or permissions.

## Base

- branch: feat/observatory-operational-landscape
- check command: PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts apps/web/app/infrastructure/observatory-work-client.test.ts packages/ui/src/gravity/infrastructure.test.ts
- probes: none (local coordinator)

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
  "task_id": "T26",
  "title": "Preserve event pulses during routine refresh",
  "goal": "Deliver new observation pulses during ordinary same-scope refresh without replaying suppressed activity.",
  "brief": {
    "change": "Distinguish routine in-flight refresh from delayed evidence",
    "check": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts apps/web/app/infrastructure/observatory-work-client.test.ts packages/ui/src/gravity/infrastructure.test.ts"
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
    "packages/ui/src/gravity/labels.test.ts",
    "docs/plans/observatory-operational-landscape/T26.md",
    "apps/web/package.json",
    "apps/web/tsconfig.json",
    "apps/web/app/projects/api.ts",
    "apps/web/lib/load-infrastructure-scene.ts",
    "apps/web/app/infrastructure/observatory-work-client.ts",
    "packages/ui/src/components/OperationalObservatory.tsx",
    "apps/web/app/infrastructure/observatory-work-client.test.ts"
  ],
  "write_files": [
    "apps/web/app/infrastructure/InfrastructureOverviewScreen.tsx",
    "apps/web/app/infrastructure/observatory-work-client.test.ts"
  ],
  "create_files": [],
  "forbidden": [
    "packages/db",
    "packages/platform",
    "packages/domain",
    "packages/contracts",
    "packages/ui"
  ],
  "acceptance": [
    {
      "id": "A1",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts apps/web/app/infrastructure/observatory-work-client.test.ts packages/ui/src/gravity/infrastructure.test.ts",
      "expect": {
        "exit": 0
      },
      "covers": "Actual coordinator routine-refresh causal pulse regression and source baseline/no-replay controls"
    },
    {
      "id": "A2",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm --filter @commandry/web typecheck",
      "expect": {
        "exit": 0
      },
      "covers": "Actual web types"
    },
    {
      "id": "A3",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec prettier --check apps/web/app/infrastructure/InfrastructureOverviewScreen.tsx apps/web/app/infrastructure/observatory-work-client.test.ts",
      "expect": {
        "exit": 0
      },
      "covers": "Formatting"
    },
    {
      "id": "A4",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec eslint apps/web/app/infrastructure/InfrastructureOverviewScreen.tsx apps/web/app/infrastructure/observatory-work-client.test.ts",
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

T26

## Risks

Ordinary valid in-flight reads must not consume new events as disabled baselines. Preserve real failure/pause/query/scope boundaries and no-backlog policy. Tests must execute actual production coordinator/activity.

## Escalation answers

Owner authorized complete upgrade and truthful pulses. Read T26.md. You are not alone: T24 renderer/component and T25 label workers own distinct files; root owns T23 adapter. Do not revert their changes or edit UI files. Root provisions frozen dependencies; no install/search/commit. The exact manifest .agent/manifests/T26.json and CURRENT metadata are authorized reads, and python3 .agent/tools/review_packet.py build --manifest .agent/manifests/T26.json --repo . --base <immutablebasefrommanifest> is authorized administrative verification. Write fullreport/logs only .agent/scratch/T26/ and packet artifacts .agent/review/. Verify delivered never/FullAccess before work. Escalate precise missingcontext.
