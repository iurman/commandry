# Independent Observatory semantic review

Result: changes required. The 47 existing targeted tests pass, but five independently reproduced correctness gaps and one synchronous scale-performance defect remain. This is a review of the pure T03 projection and DTO only, not acceptance of the complete Observatory workflow or verification of server authorization, browser behavior, GPU behavior, production data, or provider ingestion.

## Scope and runtime

- Checkout: `/home/urmani/.codex/worktrees/bbbf/commandry`.
- Reviewed revision: `ad5c590`, against immutable base `4062ad5`. The permitted source/config files in the working checkout matched `ad5c590` at review time.
- Actual current reviewer session `turn_context` was checked before command work: `approval_policy=never`, `sandbox_policy.type=danger-full-access`. Only those values were saved to `.agent/scratch/semantic-review/runtime-permissions.json`.
- Read only the source/config/document paths listed in `.agent/scratch/semantic-review/SPEC.md`, plus review-owned scratch artifacts and the runtime permission record needed by that specification. No product changes, installs, commits, or inspection of concurrent DB/API work.
- The projection contract explicitly takes already-authorized input. The findings below do not claim that an arbitrary input ID bypasses authorization.
- Read the path-scoped diff only after its stat. Saved diff: `.agent/scratch/semantic-review/semantic.diff`.

## Findings

### R1. P1: development-only provider impact contaminates a production-selected summary

Location: `packages/domain/src/observatory.ts:1326`, especially construction of provider exposures through line 1353; compare environment filtering in `signalsFor` at lines 424-437 and the provider local-evidence filter at lines 671-685.

Trigger: select `input.environment="production"`; give one service a required production check that is freshly passing and a fresh development failure. Give it an explicitly development-scoped provider dependency and development-scoped notice. All objects are permitted, authorized inputs.

Observed: production availability correctly reports `required.passing=1`, `failing=0`, and `confirmedImpact=false`, but the same scene reports provider `confirmed_local_impact=1`. Its exposure contains the development failure evidence and is classified `confirmed_local_impact`. The scene schema accepts it. No production provider dependency or failing production observation exists.

Cause: provider exposure construction iterates every dependency and notice and supplies the entire signal set, unlike the environment-scoped facet reducer. The resulting exposure DTO does not retain an environment field that would let a consumer separate this result. This can put a confirmed-impact indicator in a production-selected scene because development is failing, contrary to B04 and the independent environment semantics in T03.

Correction criterion: apply the selected environment consistently when deriving provider exposure, including dependency/notice applicability and local evidence. Preserve the full canonical resource population as required. Production must remain free of development-only impact; selecting development must still show the verified failure.

Evidence: `probe.log`, `environment`; reproducible input in `probe.mts`.

### R2. P2: lifecycle maintenance erases monitoring coverage despite an unchanged fresh check

Location: `packages/domain/src/observatory.ts:535`, particularly line 550.

Trigger: one required production service with a fresh passing availability observation. Add a fresh lifecycle `maintenance` observation without changing or expiring the availability observation.

Observed before: `eligible=1, monitored=1, unmonitored=0, state="complete"`. After: `eligible=1, monitored=0, unmonitored=1, state="not_monitored"`; availability correctly retains its separate maintenance label. Both scenes validate.

Cause: monitoring is counted from the final availability/lifecycle display state, excluding `maintenance`, rather than from qualifying current monitoring evidence. Identical monitoring is therefore reported absent when lifecycle changes. The same branch handles `retired` and `stopped`. ADR 0016 line 21 and T03 explicitly require independent monitoring coverage and lifecycle facets.

Correction criterion: derive coverage from qualifying availability observations independently of the lifecycle display override. Preserve maintenance/retired/stopped availability labels and failing-check precedence without converting an existing fresh monitor into an unmonitored service.

Evidence: `probe.log`, `coverage`.

### R3. P2: merging a provider exposure removes another member's unknown count

Location: `packages/domain/src/observatory.ts:1354`, specifically the unconditional aggregate `unknown--` at line 1364.

Trigger: a three-resource scene has a service with a current provider `exposure` signal and a matching fresh notice, plus a provider and host with no provider evidence. The service already has a known provider state before notice-derived exposure is merged.

Observed canonical per-resource provider summaries:

- Service: `exposure=1, potential_exposure=1`.
- Provider: `unknown=1`.
- Host: `unknown=1`.

The scene aggregate instead reports `exposure=1, potential_exposure=1, unknown=1`. Its two unknown members are reduced to one, and the schema accepts the disagreement.

Cause: `addExposureSummary` decrements any aggregate unknown count whenever any member has an exposure. It does not establish whether that particular member contributed an unknown count. This underreports missing evidence and produces inconsistent aggregate versus canonical summaries.

Correction criterion: combine signal-derived and notice-derived state per resource first, replacing only that resource's actual fallback unknown, then aggregate unique resource states. The unknown count for the two unrelated members must remain two. Include the analogous case where the exposed resource has stale or access-state evidence.

Evidence: `probe.log`, `providerCounts`.

### R4. P2: explicitly wildcarded provider dependency drops confirmed local failure

Location: `packages/domain/src/observatory.ts:677`; shared `applies` helper at lines 410-411, contrasted with wildcard relevance matching at lines 646-654.

Trigger: a current failing production service check, a production provider notice, and a matching dependency whose environment is the explicit wildcard `"*"`.

Observed: relevance is `matched`, but `localImpact="unknown"`, classification is `potential_exposure`, and the failing check's evidence is absent. Change only the dependency environment from `"*"` to `"production"`: the same inputs produce `localImpact="confirmed"` and `confirmed_local_impact` with failure evidence.

Cause: relevance explicitly supports wildcard applicability, but local-evidence matching calls `applies`, which compares environment strings literally. The source comment at line 630 declares wildcard explicit applicability; the dependency schema also permits it. This loses independently observed impact for a supported mapping.

Correction criterion: make explicit wildcard applicability consistent across relevance and local evidence, while also respecting notice/selected environment so broad dependencies cannot import a different environment's failures. Do not treat `null` as a proven global mapping.

Evidence: `probe.log`, `wildcard`, including the concrete-environment control case.

### R5. P2: complete-scene schema accepts absent visibility and dangling roots

Location: `packages/contracts/src/observatory.ts:430`, through line 435, with per-node root validation at lines 458-466.

Trigger: start from a valid projected two-resource complete scene and independently apply each mutation:

1. Replace `visibleRepresentationIds` with `[]`.
2. Add `"probe:missing-root"` to `rootRepresentationIds`.
3. Duplicate all visible IDs.

Observed: all three mutations pass `observatorySceneSchema.safeParse`. The first still declares `completeness="complete"`, canonical population two, but its visible member union is zero. The second declares a root that has no representation. The third violates identity uniqueness.

Cause: the schema checks duplicate root IDs and whether each visible ID exists, then validates actual nodes' parent/root status. It does not reject unknown extra roots, duplicate visible IDs, missing roots from visibility, or loss of complete canonical membership in visible representations. Validation therefore permits the exact incomplete or malformed scene conditions the versioned contract is intended to prevent.

Correction criterion: require valid and unique root/visible identities and complete visible membership conservation according to the projection's collapse/expand semantics. In particular all real roots must remain represented. Valid expanded scenes deliberately include both an aggregate and its expanded children, so do not impose a false disjointness requirement.

Evidence: `probe.log`, `schema`; original valid scene and isolated mutations are in `probe.mts`.

### R6. P2: repeated all-signal scans make a monitored 1,000-resource projection block for seconds

Location: `packages/domain/src/observatory.ts:1314`, through line 1320; `reduceObservatoryFacets` at lines 470-628 and full input signal scan at lines 424-437.

Trigger: use the existing F3 mixed/deep fixture generator at 250, 500, and 1,000 resources, with one fresh availability signal for each canonical resource and production selected. This adds at most 1,000 small observations, without multiplying sources, notices, or requirements. The generated depth and populations are already supported by the task fixture.

Measured sequential synchronous projection times in the pinned Node 24 runtime:

| Canonical resources | Representations | Elapsed milliseconds |
| --- | --- | --- |
| 250 | 252 | 161.1 |
| 500 | 502 | 855.3 |
| 1,000 | 1,002 | 4,896.5 |

Cause: every representation re-reduces all descendant members; every member/facet scans the complete input signal array again. Deep hierarchies approach cubic work as member, ancestor, and observation counts grow together. The existing F3 tests primarily exercise the no-signal case and do not reveal this cost. A single 1,000-resource projection occupies the executing thread for about 4.9 seconds before serialization or schema validation, material for the planned shared UI/API/MCP refresh path.

Correction criterion: pre-index evidence by resource/facet/environment and compute reusable per-resource summaries before aggregate reduction, preserving unique member semantics and conflicts. Validate realistic monitored F3 behavior and compare larger/deeper inputs. No arbitrary cap or dropped evidence is an acceptable performance fix.

Measurement limit: these are single runs on this review host, not a cross-machine performance guarantee or a measured production/browser latency. The repeated full scans and blocking duration are directly observed; no browser performance claim is made.

Evidence: final three records of `probe.log`; `probe.mts --scale`.

## Verification and non-findings

The existing targeted suite passed 2 files and all 47 tests. Log: `.agent/scratch/semantic-review/vitest.log`. It exercises F1 exact 91-resource conservation and zero observed availability, F2 mixed operational evidence, F3 1,000 resources across all grouping presets, compact repositories, explicit mappings, aliases, input ordering, containment/cycles, scope-bound continuation, stale observations, failures surviving passing sources, required/optional separation in the availability reducer, missing/disabled/inaccessible scanner distinctions, and provider relevance axes. These tested behaviors passed within the pure projection scope.

The independent probes use only permitted production modules and synthetic fixture builders. All five correctness examples were runtime-reproduced. They are not inferred from names, real inventory, unauthorized data injection, or production infrastructure. No claim is made that pure projection itself enforces server access. No new browser/GPU/real-adapter/real-authorization scenario is marked passed. Resolution of these findings, subsequent integration, and the complete A-F acceptance record remain separate requirements.

Runnable verification from the root checkout:

```bash
cd /home/urmani/.codex/worktrees/bbbf/commandry
PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm exec vitest run packages/contracts/src/observatory.test.ts packages/domain/src/observatory.test.ts
PATH=/home/urmani/.local/share/pnpm/.tools/pnpm/11.19.0/bin:/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node --import tsx .agent/scratch/semantic-review/probe.mts --scale
```

Review artifacts:

- Full report: `.agent/scratch/semantic-review/report.md`.
- Independent probe: `.agent/scratch/semantic-review/probe.mts`.
- Probe observations and timing: `.agent/scratch/semantic-review/probe.log`.
- Existing test output: `.agent/scratch/semantic-review/vitest.log`.
- Permitted source diff: `.agent/scratch/semantic-review/semantic.diff`.
- Actual runtime evidence: `.agent/scratch/semantic-review/runtime-permissions.json`.
