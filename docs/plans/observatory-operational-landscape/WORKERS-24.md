# Actual owner review fixture tooling

## Goal

Provide a safe interactive rich fixture using the actual built Observatory and shared application services.

## Non-goals

No product renderer/components, production records, monitors, accounts, external calls, new framework, runtime or canonical mutation.

## Base

- branch: feat/observatory-operational-landscape
- check command: PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/application/src/observatory.test.ts
- probes: none (owned loopback tests)

## Interfaces

```json
[{"file":"packages/application/src/observatory.ts","symbol":"ObservatoryReadAccess","kind":"interface"}]
```

## Tasks

```json
{
  "task_id": "T28",
  "title": "Read-only actual UI owner review fixture",
  "goal": "Provide a safe interactive rich fixture using the actual built Observatory and shared application services.",
  "brief": {
    "change": "Serve bounded synthetic read transport with actual built assets",
    "check": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec tsx --test scripts/observatory-usability-preview.test.mjs"
  },
  "seed_files": [
    "AGENTS.md",
    "docs/project/status.md",
    "docs/product/principles.md",
    "docs/project/open-questions.md",
    "docs/domain/core-model.md",
    "docs/domain/operations.md",
    "docs/features/gravity-observatory.md",
    "docs/features/infrastructure.md",
    "docs/architecture/security-and-permissions.md",
    "docs/architecture/events-and-integrations.md",
    "docs/architecture/technology-stack.md",
    "docs/decisions/0015-show-the-complete-gravity-landscape.md",
    "docs/decisions/0016-project-the-operational-observatory.md",
    "docs/plans/observatory-operational-landscape/T28.md",
    "package.json",
    "tsconfig.base.json",
    "scripts/observatory-preview.mjs",
    "packages/application/src/observatory.ts",
    "packages/contracts/src/observatory.ts",
    "packages/contracts/src/observatory-queries.ts",
    "packages/contracts/src/observatory-operational.ts",
    "packages/contracts/src/observatory-provider-feed.ts",
    "packages/test-support/src/observatory.ts",
    "packages/contracts/src/infrastructure-overview.ts",
    "packages/contracts/src/index.ts"
  ],
  "write_files": [],
  "create_files": [
    "scripts/observatory-usability-preview.mjs",
    "scripts/observatory-usability-preview.test.mjs",
    "docs/plans/observatory-operational-landscape/OWNER-REVIEW.md"
  ],
  "forbidden": [
    "apps",
    "packages"
  ],
  "acceptance": [
    {
      "id": "A1",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec tsx --test scripts/observatory-usability-preview.test.mjs",
      "expect": {
        "exit": 0
      },
      "covers": "Real loopback policy/source validation and actual application service strict complete fixture reads"
    },
    {
      "id": "A2",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec prettier --check scripts/observatory-usability-preview.mjs scripts/observatory-usability-preview.test.mjs docs/plans/observatory-operational-landscape/OWNER-REVIEW.md",
      "expect": {
        "exit": 0
      },
      "covers": "Formatting"
    },
    {
      "id": "A3",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec eslint scripts/observatory-usability-preview.mjs scripts/observatory-usability-preview.test.mjs",
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

T28

## Risks

The owner review must be a real interactive built surface without granting an auth proxy for arbitrary private backend routes or mutations. Keep exact allowlists, loopback checks and no secret forwarding; use actual service/contracts and declare fixture-only evidence.

## Escalation answers

Owner explicitly requires an actual owner usability pass. Root is making the result concrete before asking. You are not alone: other workers own renderer/components/coordinator/labels; never edit those files. Root provisions frozen dependencies. No searches, installs, commits or runtime access. Exact own .agent/manifests/T28.json and CURRENT administrative reads and python3 .agent/tools/review_packet.py build --manifest .agent/manifests/T28.json --repo . --base <immutablebasefrommanifest> are authorized. Scratch/report/logs .agent/scratch/T28/, packet .agent/review/. Verify actual delivered never/FullAccess before command work. Escalate exact missing context. Root independently reviews and exercises actual built UI before owner question.
