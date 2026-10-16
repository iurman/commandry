# Implementation handoff: operational Gravity Observatory

**Status: Proposed handoff. Owner planning-only hold is active.**

**Prepared:** 2026-10-16. This file is ready for a future chat, but it does not authorize launching that chat or changing the product. The owner explicitly asked for a solid plan before fixes. Begin implementation only after a direct owner message releases that hold. A request merely to read/review this file is not release.

## Read first

1. The receiving checkout's `.agent/STATE.md` and `AGENTS.md`.
2. [PLAN.md](PLAN.md), [RESEARCH.md](RESEARCH.md) and [ACCEPTANCE.md](ACCEPTANCE.md), in that order.
3. The [copyable owner implementation prompt](IMPLEMENTATION-PROMPT.md), for the owner to send when ready. Reading the template is not authorization.
4. Repository orientation for UI, infrastructure, backend and MCP work. Read relevant accepted ADRs, especially [0015](../../decisions/0015-show-the-complete-gravity-landscape.md), and current open questions.

The planning packet records what is verified, what is proposed and what needs real external access. Do not treat examples as discovered topology, test scenarios as passing checks, source freshness as service health, or this Markdown as a new grant.

## Owner intent

The owner likes the gravity landscape concept, but the real fleet has become visually meaningless: Appearance is clipped, label density and motion hide subjects, well shapes lose their curvature, repositories have the same visual weight as deployed services, and the lens consumes space without explaining the chosen object. They want useful operational grouping inspired by InfraAgent's application/service summaries, plus providers, repository/deployment links, real work/PR activity and carefully scoped provider incidents.

Preserve the creative visual language. Do not deliver only another topology graph, a grid of identical cards or a color/spacing tweak. Equally, do not use more motion and effects to hide the semantic problem.

The proposed direction is one complete master landscape with hierarchical aggregate representations. The default foreground is operated infrastructure and mapped deployments/providers. A compact repository collection accounts for the repository population. A real-work dock appears when supported actual work exists. Selecting a group expands/focuses its meaningful members and inspector; the lens is optional. Host/project/provider/custom-sector presets remain alternative projections of the same records. Every resource is reachable without visible resource pages.

## Baseline and source ownership

The planning checkout is `/home/urmani/.codex/worktrees/f541/commandry`, branch `feat/observatory-local-tuning`, source baseline `507303ca1e82b8b15cc8d94864b61db1de86ed7e`. The source was clean when planning began. This packet and the copyable implementation prompt are tracked repository documentation on `feat/observatory-local-tuning`; inspect current Git status and preserve owner edits. Obtain them from that branch if they are not yet in main. No private `.agent` folder is required to obtain the plan.

The next agent-runtime implementation is separate: fresh chat `01a146b8-fb8b-78f0-b4a0-6591b9e0b4c7`, checkout `/home/urmani/.codex/worktrees/agent-runtime-workflow/commandry`, branch `feat/governed-agent-runtime`. Do not edit that checkout, duplicate its dispatcher, replace its run contracts or infer its work is already released. Coordinate shared contract/source ownership through the owner before concurrent edits. Do not message it without direct owner authorization.

The dirty primary `/var/home/urmani/Documents/Personal/commandry` must remain untouched. Preserve the original `/home/urmani/.codex/worktrees/13e5/commandry` dependency checkout and recovery lock. Prefer a suitable active attached worktree after inspecting artifacts; create another only when isolation is needed. Never edit the same feature branch concurrently in two checkouts. When using a checkout based on main before this packet is merged, bring its committed documentation from `feat/observatory-local-tuning` into the implementation branch. Do not leave the only copy of reusable planning work in an ignored agent folder. Private evidence can supplement the tracked research, but must not become a prerequisite for understanding or implementing the plan.

The local actual product UI is at `http://127.0.0.1:3217/infrastructure/wallboard`. It runs in development mode, with a persistent isolated infrastructure snapshot outside the repo at `/home/urmani/.local/share/commandry/local/observatory-20261016`. It includes 91 resources, 15 projects, parent/project/dependency links and 16 latest recorded host measurements. It is not a production database clone, and no background worker or remote polling runs. Read `.agent/local-observatory/README.md` for its exact owned runtime/restart receipt. Keep that owner-requested runtime and browser tabs available.

Production is a separate target at `https://commandry.site`. Do not deploy or edit its inventory/provider configuration while doing local design work. Final release revision must be checked afresh; this packet's baseline is historical after another merge.

## Critical research to preserve

- The recorded population is 60 repositories, 18 hosts and 13 services, with 70 roots. All 48 unlinked records are repositories; unknown deployment mapping is not evidence of undeployed state.
- Current projection maps every root to renderer kind host, and default project choice is first sorted UUID. This explains much of the clutter/ambiguous grouping.
- All availability values in the current infrastructure contract are unknown. Four hosts have capacity data; only the Commandry repository has the real GitHub activity source. Do not make green service health or a scanned repository fleet out of those facts.
- Geometry budget decreases with field population/extent; current update passes previous plus next arrays and can count unchanged IDs twice. Actual inspected browser had 91 contributions and 16,422 terrain vertices. Isolate and test before changing this behavior; do not discard genuine transitions.
- Appearance's overflow-clipped/right-aligned absolute form lacks collision handling. The supplied screenshot fails; the inspected 870px geometry happened to fit. Reproduce the actual failing wrap case before claiming a regression test.
- The saved inventory confirms Electra's Commandry service records and an Ephemera database. It does not confirm Merope hosts Ephemera or identify ResuPals' Cloudflare deployment.

## Execute after release of the hold

First establish what the owner approved. If they approve the proposed defaults, record that product decision and prepare the narrowly scoped ADR change described in PLAN.md. Do not ask them to approve routine reversible commands again. Unresolved credential/disclosure/production-action gates still apply.

Follow stages A-F in the plan. Start with shared overlay reliability, actual terrain-quality evidence and the complete grouped projection/focus path. Do not block those on every future provider/security credential. Add canonical mappings and at least one real availability-source vertical slice before claiming a complete operational view. Broader PR/security/run overlays are independent facets and must say unsupported/unavailable when not wired.

Implementation must produce real shared components/services and tests, not a lab-only mockup. Preserve flat API/client compatibility, canonical IDs, current grants, complete continuation and accepted source/evidence boundaries. No new framework/renderer/provider billing, graph database, general shell access or replacement telemetry/runtime platform is justified.

Keep Three.js initially. Allocate detail locally to active semantic basins rather than to every inventory record. Preserve complete membership independently of active GPU representation count. Do not weaken old completeness tests without replacing their exact guarantee with member conservation and active-representation GPU coverage. Actual silhouette and usability evidence are required in addition to label/GPU counts.

For MCP, reuse shared services and enforce each facet's scope before grouping/counts. New scene evidence/read tools and canonical mapping writes require declared capabilities, risk, approval and audit. Device-local presentation controls can be explicitly owner UI-only. Existing clients receive no broader grants automatically.

## Permissions and delegation

If running unattended under the owner's later authorization, verify actual delivered Full Access and approval policy never before command work and verify each worker separately. Do not infer them from config or this file, alter global approval settings, disable hooks or request an unsafe bypass. The old native foundation chat `01a142c8-fc91-7a01-a80c-d34434a22d2b` is reference-only; do not revive it as a permission workaround.

No delegation is dispatched by this planning task. If later directly authorized, use exclusive ownership and pinned manifests/interfaces, preserving other work. Read the planning/review/subagent skills as applicable. The integrator owns semantic consistency and visual direction; a renderer worker cannot redefine health or relationships. Independent review does not replace real browser/database evidence.

## Verification and finish line

The acceptance file defines real-population, mixed hierarchy, permission, provider, motion, overlay, focus, GPU and scale cases. Use meaningful old-source negative controls for confirmed defects. Preserve failures and bounded limitations. Build/preview sequentially when sharing mutable Next.js output. Use actual disposable PostgreSQL, shared shipped WebGL, built browser workflows and supported MCP clients. Do not query production SQL.

Record the distinction between a readable-inventory delivery and verified operational monitoring. Report exact provider/deployment/availability/security/run coverage. No placeholder green fleet, fake source flows, hidden resources, unsupported scanner claims or invented AgentRuns. Local generation of screenshots/fixtures is not production activation evidence.

Prepare a reviewable PR once the authorized scope is implemented and required checks pass. Normal hooks, required CI, ancestry checks, source provenance and constrained backup/restore/deployment gates remain. This planning request grants no merge/deployment authority. Follow applicable current owner authorization when that stage arrives.

Current pinned Node is `/home/urmani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`; prepend its directory for pnpm. Do not install into system Python or use rpm-ostree layering. Scope/cap searches and reads; use `git diff --stat` before a path diff, `git log --oneline -n 20`, `gh pr list --limit 20`. Do not use `--no-verify`, `--no-gpg-sign`, new paid inference fallback, private Mnemosyne imports or speculative device renames.

At the planning handoff, no proposed behavior has been tested or released. The source of truth for what this task actually did is RESEARCH.md plus the private baseline artifacts. Keep the planning chat open for owner review and the retained local visual workspace.
