# Release unit-test concurrency correction

## Goal

Bound shared-runner unit test concurrency without weakening any test.

## Non-goals

No product code, test content, population, deadline, tolerance, environment, retry, workflow gate or provider changes.

## Base

- branch: loop/release-unit-test-concurrency-correction/T33
- check command: PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec prettier --check vitest.config.mts
- probes: none (local test-runner configuration only; no remote write probe required by owner)

The task begins from merged main922cc6d and the subsequent tracked plan-only commit. The first main release39035678643 failed one original portrait pressure case at5026ms against the existing5000ms deadline. Preserve the entire actual failed run and all source-qualified feature evidence. Read T33.md for controlled measurements before editing.

## Interfaces

```json
[]
```

## Tasks

```json
{
  "task_id": "T33",
  "title": "Bound shared-runner unit test concurrency",
  "goal": "Bound shared-runner unit test concurrency without weakening any test.",
  "brief": {
    "change": "Reduce the existing Vitest worker ceiling from four to two after controlled contention measurements",
    "check": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH taskset -c 0,1 pnpm test"
  },
  "seed_files": [
    "AGENTS.md",
    "docs/architecture/technology-stack.md",
    "docs/architecture/agent-development-workflow.md",
    "package.json",
    "vitest.config.mts",
    "vitest.setup.ts",
    ".github/workflows/release-candidate.yml",
    "packages/ui/src/gravity/renderer-pressure.test.ts",
    "packages/ui/src/gravity/basin-geometry.test.ts",
    "docs/plans/observatory-operational-landscape/T33.md"
  ],
  "write_files": [
    "vitest.config.mts"
  ],
  "create_files": [],
  "forbidden": [
    "apps",
    "packages",
    ".github",
    "scripts",
    "package.json",
    "pnpm-lock.yaml"
  ],
  "acceptance": [
    {
      "id": "A1",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH taskset -c 0,1 pnpm test",
      "expect": {
        "exit": 0
      },
      "covers": "Every original unit, lab and local script test under the same two-CPU affinity, existing deadlines and fixtures"
    },
    {
      "id": "A2",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec prettier --check vitest.config.mts",
      "expect": {
        "exit": 0
      },
      "covers": "Configuration formatting"
    }
  ],
  "depends_on": [],
  "size": "S",
  "model": "gpt-6.1-sol"
}
```

## Convergence order

T33

## Risks

The full suite shares CPU with transforms, setup, garbage collection and other heavy files. A four-worker limit can leave too little margin on the release runner; the causal local comparison uses unchanged full tests on exactly two assigned CPUs. Local success cannot certify hosted runner success. Keep the original5000ms deadline,257-resource portrait fixture, all168files and2917unit tests, and every assertion byte unchanged. This changes scheduling only. Root retains actual built/browser evidence using a product-source hash comparison and requires a new actual main-only release run after normal review/PR/merge.

## Escalation answers

Own only vitest.config.mts and make the smallest evidence-supported numeric ceiling correction. You are not alone; do not revert others or edit any other source. Verify actual delivered never/full access before command work. No search/install/commit/push. Root provisions normal frozen offline dependencies, the exact manifest/CURRENT and context. Administrative scratch .agent/scratch/T33 and python3 .agent/tools/review_packet.py build --manifest .agent/manifests/T33.json --repo . --base <actual immutable base> allowed. Build the review packet to execute acceptance once serially, rather than redundantly repeating the full suite before packet construction. The declared200000-byte context budget at depth0 covers the exact source fixtures, configuration and required tooling guide; it does not authorize further reads. Missing files/commands/permissions or unsupported assumptions require escalation, not guessed access or deadline relaxation. Source tests and product bytes must remain unchanged.
