# Observatory operational source persistence

## Goal
Persist reviewed operational source evidence safely.

## Non-goals
No production activation, credentials or monitor writes.

## Base
- branch: feat/observatory-operational-landscape
- check command: PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/platform/src/cloudflare-status.test.ts
- probes: none (local disposable HTTP boundary only)

## Interfaces
```json
[{"file": "packages/application/src/observatory-observations.ts", "symbol": "OperationalSourcePort", "kind": "interface"}]
```

## Tasks
```json
{
  "task_id": "T10",
  "title": "Fenced operational observation persistence",
  "goal": "Persist reviewed operational source evidence safely.",
  "brief": {
    "change": "Fenced operational observation persistence",
    "check": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node scripts/test-integration.mjs --db-test=observatory-source.integration.test.ts"
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
    "docs/plans/observatory-operational-landscape/PLAN.md",
    "docs/plans/observatory-operational-landscape/ACCEPTANCE.md",
    "package.json",
    "tsconfig.base.json",
    "vitest.config.mts",
    "vitest.setup.ts",
    "packages/application/src/observatory-observations.ts",
    "packages/platform/src/infraagent-availability.ts",
    "docs/plans/observatory-operational-landscape/T10.md",
    "packages/db/src/observatory-schema.ts",
    "packages/db/src/observatory-canonical.integration.test.ts",
    "packages/db/src/observatory-provider-repository.ts",
    "packages/db/src/observatory-provider.integration.test.ts"
  ],
  "write_files": [],
  "create_files": [
    "packages/db/src/observatory-source-repository.ts",
    "packages/db/src/observatory-source.integration.test.ts",
    "packages/platform/src/operational-payload-cipher.ts",
    "packages/platform/src/operational-payload-cipher.test.ts"
  ],
  "forbidden": [
    "apps"
  ],
  "acceptance": [
    {
      "id": "A1",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node scripts/test-integration.mjs --db-test=observatory-source.integration.test.ts",
      "expect": {
        "exit": 0
      },
      "covers": "Real PostgreSQL leases, originals, auth bindings, idempotency, audit and HTTP failure/recovery"
    },
    {
      "id": "A2",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/platform/src/operational-payload-cipher.test.ts",
      "expect": {
        "exit": 0
      },
      "covers": "Authenticated encrypted original recovery and tamper rejection"
    },
    {
      "id": "A3",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec prettier --check packages/db/src/observatory-source-repository.ts packages/db/src/observatory-source.integration.test.ts packages/platform/src/operational-payload-cipher.ts packages/platform/src/operational-payload-cipher.test.ts",
      "expect": {
        "exit": 0
      },
      "covers": "Changed file formatting"
    }
  ],
  "depends_on": [],
  "size": "M",
  "model": "gpt-6.1-sol"
}
```

## Convergence order
T10

## Risks
Disposable proof cannot establish real monitor activation.

## Escalation answers
Official upstream contracts captured; real credentials and activation remain outside this task.
