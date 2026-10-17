# Isolate hosted browser execution capacity

## Goal

Run the complete release browser suite with one worker, retaining every original acceptance case and guard. Full main release39061877665 at f30c4aa fails199PASS/5originalSKIP/3FAIL after all preceding gates and exact-image startup pass. Actual traces show a complete227-ID global scene before a locator observation fails to return, and phone103field contributions before a late polling read fails. The desktop master also exhausts its calibrated300000ms aggregate budget. These facts do not prove a product, GPU, tracing or parallelism cause.

[Playwright's official CI guidance](https://playwright.dev/docs/ci#workers), read2026-10-17, recommends one CI worker for reproducibility and resource isolation. Apply a CLI override only to the complete hosted release browser command. This is a bounded resource-policy experiment, not an interactive-speed fix or proof that concurrency caused the failures. Independent plan/source review and a successful actual full main release are required.

## Non-goals

No product, test body, locator, observer, assertion, population, fixture, per-operation guard, aggregate timeout, retry, skip, trace, reporter, project, viewport, default local-worker configuration, other workflow step, credential, approval, source activation or deployment change. Do not reinterpret prior failures or accepted local trials. This task does not satisfy physical-device or owner-interpretation checks. T42's unchanged test/config boundaries remain byte-identical; only this separately scoped release CLI override changes scheduling.

## Base

- branch: loop/observatory-ci-base-t43
- check command: PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm boundaries:check
- probes: none; local task, no prerequisite remote write probes

## Interfaces

```json
[]
```

## Tasks

```json
{
  "task_id": "T43",
  "title": "Isolate the full hosted browser suite in one worker",
  "goal": "Apply one release-workflow browser worker override, preserving all test and product bytes.",
  "brief": {
    "change": "Add --workers=1 only to the existing complete release browser command",
    "check": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH PLAYWRIGHT_BASE_URL=http://127.0.0.1:1 python3 .agent/context/T43-control/verify-ci-isolation.py --discovery"
  },
  "seed_files": [
    "docs/plans/observatory-operational-landscape/WORKERS-39.md",
    "AGENTS.md",
    "docs/project/status.md",
    "docs/product/principles.md",
    ".github/workflows/release-candidate.yml",
    "playwright.config.ts",
    "package.json",
    ".agent/context/T43-control/verify-ci-isolation.py"
  ],
  "write_files": [
    ".github/workflows/release-candidate.yml"
  ],
  "create_files": [],
  "forbidden": [
    "apps",
    "packages",
    "scripts",
    "tests",
    "playwright.config.ts",
    "package.json",
    "pnpm-lock.yaml",
    ".agent/context"
  ],
  "acceptance": [
    {
      "id": "A1",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec prettier --check .github/workflows/release-candidate.yml",
      "expect": {
        "exit": 0
      },
      "covers": "Workflow formatting"
    },
    {
      "id": "A2",
      "kind": "command",
      "run": "python3 .agent/context/T43-control/verify-ci-isolation.py",
      "expect": {
        "exit": 0
      },
      "covers": "Exactly one command flag; all test/config/product source conserved"
    },
    {
      "id": "A3",
      "kind": "command",
      "run": "PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH PLAYWRIGHT_BASE_URL=http://127.0.0.1:1 python3 .agent/context/T43-control/verify-ci-isolation.py --discovery",
      "expect": {
        "exit": 0
      },
      "covers": "Installed CLI applies workers1 and2 to exactly the same207 unique title/project pairs,69 per viewport, zero retries"
    }
  ],
  "depends_on": [],
  "size": "S",
  "model": "gpt-6.1-sol",
  "notes": "Verify actual never/Full Access. You are not alone; preserve others edits. Exclusive ownership of one --workers=1 flag in the release browser command only. Keep config defaultworkers2, all207cases, all assertions, populations, guards, aggregate timeouts, trace/report retention, viewports, hooks and every other workflow byte. No product performance or causal fix claim. Build official review_packet.py packet; do not commit. Report .agent/scratch/T43/report.md. Root owns independent source/packet review, normal PR/merge and the actual full main release. Any failure remains failed; no unchanged retry or timeout extension."
}
```

## Convergence order

T43

## Risks

A one-worker pass would establish acceptance under that execution policy, not a universal performance improvement or a complete causal explanation of the stalled observations. It removes cross-test browser overlap from this CI run. Explicit multi-context and application concurrency tests retain their actual bodies and assertions, but no equivalent inter-test load claim is made. Preserve the independently accepted two-worker local T42 result with its actual source/CPU conditions. A future deliberately concurrent stress workload remains separate from this release acceptance run.

All207original title/project pairs must remain discoverable exactly once,69 each desktop/phone390/phone320; expected five original skips must not be reclassified as passes. CLI discovery must prove workers1 is honored while the config's defaultworkers2 and zero retries remain unchanged. The source seed must reject any other workflow byte, any other tracked deviation and every normal untracked addition. Both current discovery populations must match the actual original full-main identity digest f90a13654a4a123ae9382a5b6fe25046e9c95d23d325481fb7a7fc8b375c671b. Any reported global retry value and every project retry value must independently remain zero. There is no further timeout allowance.

Root must retain the actual full main workflow result/report/artifact, exact tested revision and immutable publication evidence. A failure is a new diagnostic boundary, not permission for unchanged retries. Later provenance/scans/owner workflows, genuine protected operator approval, constrained deployment, signed-in behavior and actual source activation remain required. No root/source/grant gate is relaxed.

## Escalation answers

Only the release line `pnpm test:e2e --reporter=line,json` changes to `pnpm test:e2e --workers=1 --reporter=line,json`. Every other workflow byte remains frozen. No new flag is added to local helpers or playwright.config.ts. The read-only seed and any launcher must use official generator schemas and P1-P10 checks. Root supplies the exact inspected seed into the fresh isolated task checkout before dispatch; worker reads only the generated manifest.
