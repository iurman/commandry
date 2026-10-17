# Stationary label layout fixed point

## Goal

Reach an unchanged stationary label fixed point without sacrificing priority or collision guarantees.

## Non-goals

No renderer/component/camera/scene/source/authority changes, relaxed thresholds, identity cap or fake quiescence.

## Base

- branch: loop/stationary-label-layout-fixed-point/T32
- check command: PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/ui/src/gravity/labels.test.ts packages/ui/src/gravity/renderer-pressure.test.ts
- probes: none (pure label layout)

Task starts at final built b305bf8 then its actual documentation-only task HEAD. The actual built retained original D02 test fails: identical31anchors/sizes/camera after natural refresh, but layout still changing and drawing after715then1429frames. The original E03 manual breadcrumb and all5actualtour/composed controls pass on that same build. Do not weaken the original D02 assertion.

## Interfaces

```json
[{"file":"packages/ui/src/gravity/model.ts","symbol":"Well","kind":"type"}]
```

## Tasks

```json
{
  "task_id": "T32",
  "title": "Reach a stable stationary label fixed point",
  "goal": "Reach an unchanged stationary label fixed point without sacrificing priority or collision guarantees.",
  "brief": {
    "change": "Stop cyclic label displacement for identical inputs",
    "check": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/ui/src/gravity/labels.test.ts packages/ui/src/gravity/renderer-pressure.test.ts packages/ui/src/gravity/operational-layout.test.ts"
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
    "docs/plans/observatory-operational-landscape/T32.md",
    "packages/ui/src/gravity/renderer.ts"
  ],
  "write_files": [
    "packages/ui/src/gravity/labels.ts",
    "packages/ui/src/gravity/labels.test.ts"
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
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/ui/src/gravity/labels.test.ts packages/ui/src/gravity/renderer-pressure.test.ts packages/ui/src/gravity/operational-layout.test.ts",
      "expect": {
        "exit": 0
      },
      "covers": "Exact new captured31-anchor causal non-convergence, original dense/priority/overlap/invalidation/renderer/operational controls"
    },
    {
      "id": "A2",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm --filter @commandry/ui --filter @commandry/web typecheck",
      "expect": {
        "exit": 0
      },
      "covers": "UI and web compilation"
    },
    {
      "id": "A3",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec prettier --check packages/ui/src/gravity/labels.ts packages/ui/src/gravity/labels.test.ts",
      "expect": {
        "exit": 0
      },
      "covers": "Formatting"
    },
    {
      "id": "A4",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec eslint packages/ui/src/gravity/labels.ts packages/ui/src/gravity/labels.test.ts",
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

T32

## Risks

Eight iterative collision passes seeded from previous offsets can cycle under viewport clamps even with identical inputs. T25 correctly reports movement now, but that alone cannot make the solution converge. Derive or retain a deterministic stationary target when actual inputs are unchanged, preserving meaningful invalidation for anchors, measurements, viewport/top, visibility, selection, attention, membership and motion transitions. Keep generic metadata fresh, per-layout memory bounded, existing0.05movement/0.002opacity/0.5pxcollision semantics and8passes. Never freeze or suppress changing while outputs move, hide required/selected labels, drop identities, or use a last-N population cap. Use existing600-call unit settle budget; prove exact current capture fails before correction and repeated same-input reads preserve positions/admission and changing=false after actual settling in both motion modes. Root owns actual browser/pixel closure.

## Escalation answers

Read T32.md and exact supplied current-diagnostic.json. You are not alone; all other source work is integrated/frozen. Own only labels.ts and existing labels.test.ts. No search/install/commit/push. Normal frozen dependencies are provisioned by root. Administrative .agent/manifests/T32.json/CURRENT, scratch .agent/scratch/T32 and python3 .agent/tools/review_packet.py build --manifest .agent/manifests/T32.json --repo . --base <actual immutable base> allowed. Verify delivered never and Full Access. Any missing need escalates before access. Preserve all original tests/assertions and raw new actual failure. Root independently checks packet and source review.
