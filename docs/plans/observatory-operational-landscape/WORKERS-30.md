# Release fixture manifest context

## Goal

Restore container packaging while keeping fixture bodies excluded.

## Non-goals

No product/test/fixture bodies, dependencies, lockfile, Dockerfile, runtime source, prod/frozen/optional/lifecycle/scanner/provenance gate or authority changes.

## Base

- branch: loop/release-fixture-manifest-context/T34
- check command: PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm boundaries:check
- probes: none (local Docker-context correction; owner forbids remote write probes)

Start from merged main e26d4a0 and its tracked plan-only commit. Actual main release39037231379 passed source/audit/unit/local/applicationbuild/integration/Compose, then failed worker-deps legacy pnpm deploy because the whole test-support workspace manifest was excluded. An unchanged exact-main local worker-deps baseline reproduces the exact error. Read T34.md before editing.

## Interfaces

```json
[]
```

## Tasks

```json
{
  "task_id": "T34",
  "title": "Retain only fixture workspace metadata in image context",
  "goal": "Restore container packaging while keeping fixture bodies excluded.",
  "brief": {
    "change": "Admit only the test-support package manifest in Docker context",
    "check": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node .agent/context/T34/verify-image.mjs"
  },
  "seed_files": [
    "AGENTS.md",
    "docs/architecture/technology-stack.md",
    "docs/architecture/deployment-strategy.md",
    "docs/architecture/agent-development-workflow.md",
    ".dockerignore",
    "Dockerfile",
    "pnpm-workspace.yaml",
    "package.json",
    "packages/domain/package.json",
    "packages/test-support/package.json",
    "apps/worker/package.json",
    "apps/worker/build.mjs",
    "scripts/container-runtime.mjs",
    "scripts/check-boundaries.mjs",
    "docs/plans/observatory-operational-landscape/T34.md",
    "docs/plans/observatory-operational-landscape/WORKERS-30.md",
    ".agent/context/T34/verify-image.mjs"
  ],
  "write_files": [
    ".dockerignore"
  ],
  "create_files": [],
  "forbidden": [
    "apps",
    "packages",
    "scripts",
    ".github",
    "Dockerfile",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml"
  ],
  "acceptance": [
    {
      "id": "A1",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node .agent/context/T34/verify-image.mjs",
      "expect": {
        "exit": 0
      },
      "covers": "Actual full image and worker-deps build, real context manifest-only boundary and fixture-free runtime checks"
    },
    {
      "id": "A2",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm boundaries:check",
      "expect": {
        "exit": 0
      },
      "covers": "Production source cannot import test-support or lab fixture logic"
    }
  ],
  "depends_on": [],
  "size": "S",
  "model": "gpt-6.1-sol"
}
```

## Convergence order

T34

## Risks

Workspace resolution still needs a dev-only package manifest during production deployment. Include only that manifest, not fixture bodies. Preserve all existing Dockerignore exclusions and all production install/build/security gates. Root-provisioned exact helper builds the actual full image and worker-deps stage, then runs networkless/read-only ephemeral filesystem checks. It starts no service, binds no port, mounts no volume and never pushes/prunes. Local validation images are labeled task-owned and explicitly uncommitted candidates, never production-clean artifacts. Actual hosted release still required after normal independent review/PR/merge.

## Escalation answers

Own only .dockerignore. You are not alone; do not revert others. Apply only packages/test-support/** then !packages/test-support/package.json in place of the entire-directory exclusion. Verify actual delivered never/full access. Root provisions independent frozen offline dependencies and the exact helper/manifest. No search/install/commit/push or other source edits. The helper and original baseline logs are immutable coordinator evidence; do not edit them to obtain PASS. Administrative .agent/STATE.md gives exact manifest path, escalation codes and authorized python3 review_packet build command/base. Build packet to execute acceptance once, rather than redundantly running full image builds first. Write complete report under .agent/scratch/T34. Escalate missing needs or any actual build failure before expanding scope. No retries that weaken assertions. No prod SQL/SSH/browser/runtime changes. Root independently checks packet and retains actual source/CI/evidence limits.
