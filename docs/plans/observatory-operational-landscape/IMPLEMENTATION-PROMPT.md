# Owner prompt: operational Gravity Observatory implementation

**Status: Proposed prompt template. Reading this file does not authorize implementation.**

The owner can send the text below as their direct request to the receiving chat. Its authorization applies only when they do so. The current documentation-persistence request does not release the product implementation hold. All referenced plan files are tracked beside this file.

```text
Fully implement Commandry's operational Gravity Observatory from the existing planning packet, from investigation through tested delivery. This message releases the Observatory planning-only hold and approves the recommended design defaults in the plan. Continue through all implementation phases; do not stop after planning, a rendering study, an intermediate commit or the readable-inventory phase.

Read AGENTS.md and your checkout's .agent/STATE.md if present, then these tracked paths in your checkout:

1. docs/plans/observatory-operational-landscape/PLAN.md
2. docs/plans/observatory-operational-landscape/RESEARCH.md
3. docs/plans/observatory-operational-landscape/ACCEPTANCE.md
4. docs/plans/observatory-operational-landscape/HANDOFF.md

Follow applicable AGENTS.md instructions, repository orientation, accepted architecture and relevant skills. The documents describe a planning hold that this direct owner message now releases. They do not establish that proposed integrations, mappings or tests already work. Record this approval and update the relevant ADRs before changing their decisions. Do not ask me to approve the same design defaults or routine implementation steps again.

Ownership and setup:

- Inspect current main, Git status, attached worktrees and active work before editing. Work on a dedicated feature branch in an isolated checkout based on latest main. Preserve unrelated owner edits. The planning packet is tracked in Git on feat/observatory-local-tuning. If latest main does not yet contain it, bring the committed packet and its planning-persistence rule from that branch into your implementation branch. Preserve the packet as tracked documentation; do not depend on ignored files in another checkout.
- Preserve the owner's f541 visual checkout and local preview at http://127.0.0.1:3217/infrastructure/wallboard. Use your own available local port and isolated development database. If available, read /home/urmani/.codex/worktrees/f541/commandry/.agent/local-observatory/README.md to understand the recorded inventory copy. Those private local files are optional evidence, not required to obtain the plan or reproduce its documented synthetic population. Do not migrate or reset the owner's database or overwrite their visual edits.
- Leave the dirty primary checkout /var/home/urmani/Documents/Personal/commandry and the original 13e5 dependency checkout/recovery lock untouched.
- The separate agent-runtime workstream uses chat 01a146b8-fb8b-78f0-b4a0-6591b9e0b4c7 and checkout /home/urmani/.codex/worktrees/agent-runtime-workflow/commandry. You may read/message that chat solely to coordinate shared interfaces and exclusive ownership. Do not edit its checkout, duplicate its dispatcher or assume unreleased run contracts exist in main.
- Verify actual delivered Full Access and approval policy never before unattended command work, and verify each implementation worker separately. Do not infer permissions from prompts/configuration, change global approval settings or bypass hooks. A mismatched runtime is a concrete blocker to unattended command work, not permission to evade the gate.

Implement the complete intended experience:

- One master landscape with meaningful host/provider/application groups and progressive expansion. Every authorized resource remains represented, counted, searchable and inspectable without visible resource pages or arbitrary caps.
- Distinct compact repository collections, explicit shared-resource references and verified repo/deployment/service relationships. Do not make every inventory root a host crater or call unmapped repositories undeployed.
- Smooth well geometry at overview and focus scale, stable organic placement, restrained labels and ambient motion, composed default camera, opt-in orbit/tour and complete reduced-motion/fallback behavior. Investigate the duplicate previous/next identity terrain-budget issue and preserve real transitions.
- Click-to-focus/expand with a useful inspector, breadcrumbs and an optional smaller lens. Preserve canonical identity, selection and reading context through updates.
- Reusable floating-surface behavior for Appearance and other audited Commandry consumers: collision handling, clipping protection, fullscreen, scrolling, zoom, keyboard/focus and mobile behavior. Verify actual controls are reachable; raising z-index alone is insufficient.
- Separate availability, telemetry freshness, coverage, capacity, security, lifecycle, provider relevance and work state. Never invent green health, compromise-free repositories, traffic or AgentRuns.
- Real provider-status ingestion and relevance classification, starting with Cloudflare's supported structured API. Distinguish confirmed local impact, potential exposure and unrelated advisories; handle dependencies, environments, geography, control/data-plane effects, maintenance, stale feeds, deduplication and reconciliation.
- Reviewed canonical deployment/provider mappings and at least one real supported availability-source vertical slice. Prefer integrating an existing monitor over building an entire monitoring platform. Develop safe failure/recovery evidence against a disposable endpoint, not by disrupting production.
- Repository PR/security and real agent-work overlays, named views, per-sector grouping, palettes and TV behavior as specified. Consume accepted runtime interfaces from the parallel workstream. Ship complete supported integration paths and tests; unavailable external access must be explicitly identified rather than replaced by production fixtures.
- Shared domain/application services, reviewed persistence/migrations, versioned API contracts, discoverable scoped MCP access and agent-facing workflow documentation. Existing clients/grants must retain compatibility and authority. Authorize before calculating group counts or exposing aliases/evidence.

Execution and verification:

Use scoped parallel workers where interfaces and file ownership permit, and independent review. Prefer GPT-6.1 Sol ultra for implementation and GPT-6 Astra ultra for review when available through existing authorized subscription access. Do not introduce API-credit, paid-overage or other metered inference fallback. Read and follow the planning/review/subagent-contract skills before dispatch. Workers are not alone in the repository and must preserve others' edits.

Work through phases A-F and maintain a completion ledger against every plan requirement and all 58 acceptance scenarios. Run appropriate unit/contract tests, real disposable PostgreSQL migration/scope/idempotency/concurrency tests, actual shipped GPU/rendering checks and built browser/MCP workflows. Exercise the real mixed 91-resource shape plus the documented adversarial populations, desktop/phone/TV sizes, themes, focus, motion, provider/coverage failures and authorization. Measure geometry/label quality and actual performance; counting API records or visible labels is not visual acceptance. Preserve meaningful failing baseline controls, failures and remaining device limitations. Never claim a proposed or mocked check passed against a real integration.

Complete all work possible with existing authorized access. If a credential, exact deployment mapping, hardware test or unreleased external contract genuinely requires me, record the precise missing input and continue independent work. Implement and test the connector using a faithful disposable external-service boundary while that access is pending, but keep production activation unclaimed. Do not defer work just because it is difficult or a later phase. Do not claim the whole scope finished while required operational behavior remains blocked.

Delivery:

I authorize normal scoped commits, pushing the feature branch, creating and attaching PRs, resolving review findings and CI, and completing normal merges and the existing constrained deployment workflow once its required checks and action gates are satisfied. Preserve applicable owner holds and release controls; obtain any genuinely required human-only approval rather than bypassing it. Do not add paid services, import private Mnemosyne data, rename devices, provision unrelated infrastructure or expand credentials without separate authorization.

Verify the exact released revision, preserved inventory/relationships, real operational evidence and signed-in production behavior after any deployment. Keep a working local preview and show actual screenshots. Finish with a concise delivery report: PRs/commits, live/local URLs, implemented coverage, actual test/review/performance results and exact remaining owner-only needs. Retain the owner's previews/shared resources; clean up only resources you own. Keep durable state current so context compaction cannot lose the plan or stop execution.
```
