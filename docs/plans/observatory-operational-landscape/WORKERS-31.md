# Restore Observatory grouping after navigation

## Goal

Restore saved active grouping with authorized sectors on remount.

## Non-goals

No redesign, automatic orbit restoration, API/schema/canonical topology/source/grant change, renderer change, fixture replacement, timeout/assertion weakening or legacy browser-test migration. T36 will separately preserve and migrate the current release browser contracts.

## Base

- branch: loop/restore-observatory-grouping-after-navigation/T35
- check command: PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm boundaries:check
- probes: none (local scoped UI correction; owner forbids remote write probes)

Actual main6d3b91a release39038533370 passed source/audit/unit/local/applicationbuild/integration/Compose and full container startup. Browser stage196pass/5skip/6fail exposed two legacy test contracts at3viewports. The source diagnosis also confirms saved grouping/sectors are stored but never restored into the active scene query. This task fixes that real behavior rather than hiding it by reselecting grouping in a test. Base is the tracked plan-only commit following main6d.

## Interfaces

```json
[
  {
    "file": "packages/ui/src/gravity/observatory-preferences.ts",
    "symbol": "ObservatoryQuery",
    "kind": "type"
  },
  {
    "file": "packages/ui/src/gravity/observatory-preferences.ts",
    "symbol": "ObservatorySector",
    "kind": "type"
  }
]
```

## Tasks

```json
{
  "task_id": "T35",
  "title": "Restore the saved authorized Observatory grouping",
  "goal": "Restore saved active grouping with authorized sectors on remount.",
  "brief": {
    "change": "Restore persisted presentation grouping without changing canonical scope or automatic camera behavior",
    "check": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run packages/ui/src/gravity/operational-layout.test.ts packages/ui/src/gravity/observatory-preferences.test.ts"
  },
  "seed_files": [
    "AGENTS.md",
    "docs/project/status.md",
    "docs/product/principles.md",
    "docs/ux/information-architecture.md",
    "docs/ux/design-system-and-sensory-language.md",
    "docs/features/gravity-observatory.md",
    "docs/domain/core-model.md",
    "docs/project/open-questions.md",
    "docs/decisions/0016-project-the-operational-observatory.md",
    "docs/architecture/local-experience-lab.md",
    "packages/ui/src/components/OperationalObservatory.tsx",
    "packages/ui/src/gravity/operational-layout.test.ts",
    "packages/ui/src/gravity/observatory-preferences.ts",
    "packages/ui/src/gravity/observatory-preferences.test.ts",
    "packages/ui/src/gravity/operational-layout.ts",
    "packages/ui/src/gravity/model.ts",
    "packages/contracts/src/observatory.ts",
    "packages/test-support/src/observatory.ts",
    "apps/web/app/infrastructure/InfrastructureOverviewScreen.tsx",
    "vitest.config.mts",
    "vitest.setup.ts",
    "package.json",
    "packages/ui/package.json",
    "docs/plans/observatory-operational-landscape/T35.md",
    "docs/plans/observatory-operational-landscape/WORKERS-31.md"
  ],
  "write_files": [
    "packages/ui/src/components/OperationalObservatory.tsx",
    "packages/ui/src/gravity/operational-layout.test.ts"
  ],
  "create_files": [],
  "forbidden": [
    "apps",
    "scripts",
    ".github",
    "packages/contracts",
    "packages/db",
    "packages/test-support",
    "packages/ui/src/gravity/renderer.ts",
    "packages/ui/src/gravity/observatory-preferences.ts",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml"
  ],
  "acceptance": [
    {
      "id": "A1",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run packages/ui/src/gravity/operational-layout.test.ts packages/ui/src/gravity/observatory-preferences.test.ts",
      "expect": {
        "exit": 0
      },
      "covers": "Actual component saved grouping and authorized sector restoration, original layout/preference controls and newly failing baseline regression"
    },
    {
      "id": "A2",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm --filter @commandry/ui typecheck",
      "expect": {
        "exit": 0
      },
      "covers": "Unchanged UI public contract and strict types"
    },
    {
      "id": "A3",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec prettier --check packages/ui/src/components/OperationalObservatory.tsx packages/ui/src/gravity/operational-layout.test.ts",
      "expect": {
        "exit": 0
      },
      "covers": "Changed product and regression source formatting"
    }
  ],
  "depends_on": [],
  "size": "S",
  "model": "gpt-6.1-sol"
}
```

## Convergence order

T35

## Risks

The exact generated depth0 context includes existing callers and their authorization/query tests. Its declared read budget is800000bytes; write ownership stays at two files. Renderer and floating-surface bodies are not needed for this correction.

Restoration must preserve authorized population, environment/search/scope and explicit later user or named-view choices, avoid repeated read loops and avoid starting an automatic camera from stored preferences. Normalize sectors against the authorized resource IDs before applying them. Merely restoring a combobox or local storage without emitting the actual current query does not fix the bug. Fresh/invalid/unavailable storage must remain useful. Source or count leakage and a scope-change restoration loop are failures. Run new meaningful component regressions against the unchanged product first and retain the actual failure, then correct the product and pass all original tests. Actual built persistence verification remains required in T36.

## Escalation answers

You own only the two write files. You are not alone; do not revert others. Verify actual delivered never/full access. Follow the official exact manifest, no repository search or dependency installation. Root provisions independent frozen/offline dependencies. Add focused regressions for saved custom grouping with filtered sectors, projects grouping and useful no/invalid storage; retain existing source scope and explicit user-choice controls. Keep all old test deadlines/fixtures/assertions. Run the new regression before the product edit and retain its failing output in scratch; this is authorized acceptance work. Change the existing preference-load path narrowly, keep composed camera as default and no new remote or canonical capability. Never merely select custom/projects after reload in a test to hide persistence failure. Escalate missing context/scope before expanding. Administrative .agent/STATE.md supplies exact manifest/base, escalation codes and authorized packet build command. No source commits/push/SSH/database/browser/runtime changes by this worker. Root independently rechecks packet and source review before convergence.
