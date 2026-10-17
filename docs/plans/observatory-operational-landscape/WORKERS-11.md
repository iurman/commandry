# Observatory source reader configuration

## Goal
Load only explicitly configured private read credentials.

## Non-goals
No live credentials, production activation or broad credential reuse.

## Base
- branch: feat/observatory-operational-landscape
- check command: PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/platform/src/operational-payload-cipher.test.ts
- probes: none (private disposable files only)

## Interfaces
```json
[]
```

## Tasks
```json
{
  "task_id": "T14",
  "title": "Explicit operational reader configuration",
  "goal": "Load only explicitly configured private read credentials.",
  "brief": {
    "change": "Private operational source reader configuration",
    "check": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/platform/src/operational-source-readers.test.ts"
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
    "docs/plans/observatory-operational-landscape/T14.md",
    "package.json",
    "tsconfig.base.json",
    "vitest.config.mts",
    "vitest.setup.ts",
    "packages/application/src/observatory-observations.ts",
    "packages/platform/src/infraagent-availability.ts",
    "packages/platform/src/github-observatory.ts",
    "packages/platform/src/operational-payload-cipher.ts",
    "packages/platform/src/operational-payload-cipher.test.ts"
  ],
  "write_files": [],
  "create_files": [
    "packages/platform/src/operational-source-readers.ts",
    "packages/platform/src/operational-source-readers.test.ts"
  ],
  "forbidden": [
    "apps",
    "packages/db",
    "packages/ui",
    "packages/config"
  ],
  "acceptance": [
    {
      "id": "A1",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run --config vitest.config.mts packages/platform/src/operational-source-readers.test.ts",
      "expect": {
        "exit": 0
      },
      "covers": "Real private file loading, safe errors, independent reader initialization and no implicit credential reuse"
    },
    {
      "id": "A2",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec prettier --check packages/platform/src/operational-source-readers.ts packages/platform/src/operational-source-readers.test.ts",
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
T14

## Risks
Private keys must never enter shared errors or anonymous fallback.

## Escalation answers
Canonical reader modules and application port contracts are provided.
