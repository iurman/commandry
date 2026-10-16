# What transfers from Mnemosyne

**Status: Exploratory research applied to the proposed plan.**

The inspected repository is `/home/urmani/mnemosyne`, observed at revision
`747aa4a`. Its generated artifacts are historical snapshots, largely from
September 2026. Their existence is not evidence of a continuously running
memory service. The repository was inspected read-only; its full pipeline was
not rerun. Paths below identify research sources, not instructions to execute
historical phase prompts.

## What Mnemosyne is

Mnemosyne is a local history archaeology and workflow-improvement system. It
normalizes agent transcripts from several sources, distills sessions, extracts
evidence-linked facts and tasks, builds compact context/instruction outputs, and
tests reusable skills. It is primarily Python batch tooling and versioned files,
not an existing production memory MCP service.

Its latest inspected distilled index contained 4,290 sessions. A separate brain
index listed 214 public, 1,337 private and 1,421 client facts. Those counts are
different snapshots and are not counts of owner-approved facts. They must not
be interpreted as an authorized import population.

## Reuse map

| Mnemosyne source                                           | Useful lesson                                                                      | Commandry adaptation                                                                  |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `tools/SCHEMA.md`, `tools/common.py`                       | Stable event identity, source locators, timestamp basis, redaction and attribution | Versioned evidence references with explicit scope and preserved originals             |
| `tools/extract.py`, `tools/dedupe.py`                      | Incremental fingerprints, checkpoints after durable work, careful deduplication    | Resumable idempotent imports; keep distinct cross-harness attempts                    |
| `tools/mapper/loader.py`, `packet.py`, `validate.py`       | Bounded source selection and source-quote checks                                   | Scoped context with continuation; distinguish quote matches from truth                |
| `tools/brain/extract.py`, `merge.py`, `shards.py`          | Fact provenance, contradiction and supersession                                    | Versioned assertions with complete evidence and review history                        |
| `tools/brain/render.py`, `tools/render_brain.py`           | Small context packs and wording-bound instruction approvals                        | Owner-reviewed profile and task context with digest-bound approvals                   |
| `tools/ledger/resolve.py`, `ledger/README.md`              | Separate claimed, verified, unresolved and superseded work                         | Proposed task reconciliation; independent acceptance and deployment evidence          |
| `skills/manifest.json`, `skills/bin/skillsctl`             | Versioned library, harness adapters and three-way drift                            | Registry plus installed-state evidence; Git remains executable authority              |
| `phase4/tasks/_AB_PROTOCOL.md`, `phase4/scripts/ab_run.py` | Controlled prompts, with/without conditions, repeats and mechanical checks         | Immutable model-specific trials with explicit completeness and independent assessment |
| `orchestration/loop/DESIGN.md`                             | Plan, exact manifest, bounded worker, review packet and convergence                | Use the existing loop for scoped implementation and later track its artifacts         |
| `HANDOFF.md`, `skills/DESIGN.md`                           | Durable state, known limits and failed approaches                                  | Morning handoff and honest operational readiness states                               |

Do not publish private source text merely to make this table more detailed.
Code reuse should be selective and covered by compatibility tests. Preserve
attribution and inspect licensing before moving reusable code across repositories.

## Skills to use in this campaign

The inspected manifest listed seven entries, of which these five were shipped:

1. `standing-rules`: preserve explicit durable owner constraints in the
   appropriate scope. Do not promote every one-time request into a global rule.
2. `session-brief`: state Change and a runnable Check before a scoped task.
3. `subagent-contract`: exact responsibility, file scope, scratch artifact and
   a short validated return.
4. `handoff`: keep Done, Next, Open and How to verify current at milestones.
5. `plan-worker-review`: generate exact task manifests, enforce bounded work,
   independently check acceptance evidence and converge reviewed changes.

The `session-boundary` entry was draft. `verify-before-done` was not shipped by
its A/B criteria. Neither status weakens Commandry's own verification rules.
Register actual library status rather than relabeling everything as production
ready. Existing locally installed versions may differ from source versions;
record and compare them instead of overwriting them.

Commands, rules and hooks accompanying a skill must be inventoried as separate
components. A Markdown skill that says to check something is different from a
hook that blocks an action. Hook installation, actual invocation and compatible
harness support need evidence.

## Owner preferences and recollection

The import/retrieval path should help an agent learn the owner's relevant
working style without sending all personal history to every project.

- Propose preferences with source citations and the context in which they were
  expressed. Distinguish explicit requests from inferred recurrence.
- Separate global preference, project convention, temporary constraint and
  obsolete environment fact.
- Keep accepted wording and disclosure scope explicit. Use the current request
  when it conflicts with an older preference.
- Show contradictory or stale evidence instead of silently selecting whichever
  statement appeared most often.
- Offer a compact context pack and links to exact authorized sources.
- Do not convert sensitive client history into a global owner profile.

No specific private preference is approved by this research document. Existing
AGENTS.md and current session instructions continue to govern this campaign.

## Mistakes to avoid repeating

1. **Privacy by path heuristic.** Mnemosyne corrected a client-tier leak after
   worktree aliases affected repository attribution. Source-tier inference is
   review input, not sufficient access control. Test aliases and worktrees.
2. **Semantic ID churn.** Its fact ID can change when wording changes. Keep a
   stable Commandry assertion ID with versions and preserve imported aliases.
3. **Truncated evidence.** A merged fact retains at most 12 provenance entries.
   Preserve all imported supporting evidence through explicit pagination.
4. **Misleading confirmation time.** Latest source mention can be labeled
   `last_confirmed`. Record mention, review and verification separately.
5. **Tier confidence mistaken for truth.** Disclosure classification confidence
   does not measure factual certainty or owner approval.
6. **Source matching mistaken for correctness.** A matching quote proves support
   exists in the transcript, not that the operational claim was true.
7. **Weak completion upgrades.** The ledger records 603 model-driven status
   upgrades reverted after weak file-existence evidence. Never close live work
   automatically from a historical claim or artifact's mere existence.
8. **Unqualified trial IDs and regrading.** The old driver can reuse run paths
   across model changes and rewrite current run metadata on recheck. Use unique
   trials and append-only assessments bound to exact artifacts/configurations.
9. **Incomplete comparisons.** Missing conditions cannot count as zero scores
   or a complete A/B result. Preserve unassessed and failed states.
10. **Automation inferred from scripts.** An unattended full weekly pipeline
    and two-machine operation were not proven by the inspected handoff. Keep
    unverified deployment/runtime claims explicit.

## What the existing evaluation actually supports

The inspected plan-worker-review experiment reported 0.86 with the intervention
versus 0.64 without, a 0.22 composite-score difference across 12 scored trials.
It used three prompts, two conditions and two repetitions on Sonnet 5 in Claude
Code, after a fixture contamination correction. The intervention bundled skill,
rules and hook configuration, so it does not isolate the effect of the Markdown
skill alone.

This supports investigating that workflow in its tested setting. It does not
establish an 86 percent real-task success rate, a benefit for every model, or
equivalent enforcement in Codex. Preserve the experiment's configuration and
limitations when registering it as historical evidence.

For Commandry, start with representative cases and explicit hard gates, include
cases where a skill should not trigger, separate system failures from model
behavior, and re-evaluate changed model/configuration combinations. This aligns
with the [SDLC playbook's evaluation guidance](https://claude.com/resources/articles/the-ai-native-sdlc-playbook)
and [Anthropic's evaluation design discussion](https://claude.dev/blog/automating-eval-design-and-hillclimbing/).

## Pilot boundary

Begin with a deliberately selected, reviewed Commandry-relevant export and the
non-secret skill manifest. Preserve source hashes, aliases, timestamps, import
version and per-record decisions. Dry-run before applying. Reruns must not
duplicate assertions or overwrite owner corrections. Missing original sources
remain explicitly unavailable. The full corpus and private/client imports stay
outside this first pilot unless the owner approves a specific scope.
