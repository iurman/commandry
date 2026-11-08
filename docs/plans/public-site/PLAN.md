# Commandry public website

**Status: Proposed implementation plan; owner-approved scope**

**Owner request:** November 7, 2026, America/Los_Angeles.

**Planning delivery:** This document and [the Opus implementation prompt](OPUS-5.5-PROMPT.md).
No site implementation, domain change, application deployment, or Vercel deployment
has been performed by this planning task.

## Outcome and authorization

Make `https://commandry.site/` a distinctive public introduction to Commandry.
Explain the personal operations system through polished, responsive visuals and
purposeful animation. Keep a discreet route to the existing owner sign-in.
Commandry is being developed for its owner and may become a broader product in
the future. The site must not solicit registration, early access, a waitlist,
email subscriptions, trials, purchases, or launch notifications.

The owner authorizes the implementing agent, when given the companion prompt, to
make routine design and repository decisions, build the site, use its connected
Vercel account, commit and push, integrate into `main`, and publish the result.
Direct integration is preferred; use and merge a PR when the repository requires
one. Do not add an optional wait for the application's entire CI campaign. Keep
real branch protections, normal hooks, and existing deployment holds intact.
Vercel build success and focused local/public verification are still necessary.
This authorization is for the public site and its necessary routing boundary,
not a migration of Commandry's database, worker, application hosting, or accounts.

## Research and verified starting point

Planning inspected Commandry `c9fdc4c8cf083b6795f236f2dd2f6bba5ad3db0d`,
the fetched `origin/main` on November 7. Recheck live state before implementation.

| Source | Finding and implication |
| --- | --- |
| [Vision](../../product/vision.md), [principles](../../product/principles.md), [core model](../../domain/core-model.md) | Personal operations across projects, knowledge, infrastructure and agents. External services retain their records. Relationships and evidence explain why a signal matters. |
| [Project status](../../project/status.md) and implementation source | The owner app exists; the full roadmap is not a public availability claim. Production, local demonstrations, and future direction must be distinguished. |
| [Web proxy](../../../apps/web/proxy.ts) | `/sign-in` already exists. Most other routes require owner authentication in password mode. Simply adding a public page to the protected app is insufficient. |
| [App home](../../../apps/web/app/page.tsx), [sign-in form](../../../apps/web/app/sign-in/SignInForm.tsx) | `/` currently contains the private dashboard, and successful sign-in routes to `/`. A new public root needs a deliberate private-home destination and a verified login return path. |
| [Web config](../../../apps/web/next.config.ts), [service worker](../../../apps/web/public/sw.js) | App assets use Next.js paths; a root-scoped service worker exists. Two apps on one host need explicit asset, route, and service-worker ownership. |
| [Stack](../../architecture/technology-stack.md), ADRs [0009](../../decisions/0009-deploy-the-initial-control-plane-to-the-vps.md), [0010](../../decisions/0010-build-a-nextjs-web-first-modular-monolith.md), [0018](../../decisions/0018-promote-verified-main-releases-with-two-web-slots.md) | Next.js 16, React, TypeScript, Node 24 and pnpm already fit. Vercel for a public frontend is a scoped extension, not authorization to replace the accepted application platform or its release gates. |

The requested IU Labs reference is **IYU Labs**, locally at
`/home/urmani/Documents/Personal/iyulabs`, with public source reference
[iyulabs.com](https://www.iyulabs.com). Planning read its manifests, current design
document, hero, motion settings and Commandry case study. It uses Next.js 16 App
Router, React, TypeScript, Tailwind 4, pnpm and Vercel. Its current source describes
graphite/cobalt surfaces, considered typography, subtle depth, product-focused
visuals and restrained motion with reduced-motion support. Its Commandry case
study correctly separates the owner app from wider integrations in development.

Borrow that standard of craft, component discipline and deployment simplicity.
Do not copy its studio offer, audience statistics, brand mark, folders, or business
calls to action. Keep Commandry's own identity. Historical IYU build-plan sections
are explicitly superseded by its current design document. Its package versions
are reference evidence, not a reason to overwrite Commandry's lockfile.

The web fetcher could not access either live Commandry or IYU Labs during planning.
This is source research, not a rendered-site audit or proof of current DNS state.
The implementing agent must inspect the rendered reference and actual target.

## Proposed repository and deployment shape

Use a small, independent `apps/site` package in the existing pnpm workspace,
provisionally named `@commandry/site`. Give it a Vercel project connected to this
repository, production branch `main`, and project root `apps/site`. Build the
public package alone; do not run the root build that also compiles the worker
and owner application. Use existing compatible locked versions. Avoid a new
framework, build orchestrator, database, auth provider, mail service or analytics.

Render copy and core visuals into static HTML. Use small client components for
the interactive demonstration and motion. Keep authored, clearly fictional
demonstration records with the site; never import private inventory, lab fixtures,
production credentials, or authenticated application services into the public
bundle. Share approved brand assets and pure tokens only where that keeps the
boundary simple. Do not load the full operational WebGL scene just for marketing.

Vercel supports independently configured projects within a monorepo. The exact
project commands and workspace dependency access must be verified in the actual
account, then recorded in the release log. See [Vercel monorepos](https://vercel.com/docs/monorepos).

### Decide routing from existing access, before cutover

The preferred boundary keeps the current application origin and its authentication
intact. Investigate an exact route split at the existing ingress: public `/`,
public metadata, and a dedicated public asset namespace served from the Vercel
deployment; private routes continue to the existing app. This can use Vercel as
the public content origin without moving the entire apex to a new application.
It is a candidate topology, not a claim that the current ingress already supports it.

If the connected setup makes Vercel the appropriate apex frontend, use explicit
external routing to an independently reachable existing app origin. Never rewrite
to `https://commandry.site` after pointing that same hostname at Vercel. Confirm
the origin does not resolve back to the frontend. Vercel documents external
rewrites, but that alone does not prove Commandry auth, streaming, or assets work
through them. See [Vercel rewrites](https://vercel.com/docs/routing/rewrites).

If neither same-origin split is practical, a private-app subdomain is an allowed
fallback only after checking its origin, cookie, sign-in, API and MCP consequences.
Record the selected topology and why it is the smallest viable change. Do not
silently replace all existing endpoints with a new hostname or build a general
application gateway. The owner does not need to select routine implementation
details; use the available Vercel connection and authorized setup records.

Required route contract, with the actual private home resolved during discovery:

| Route | Intended result |
| --- | --- |
| `/` | Public landing page, HTTP 200 for visitors and signed-in owners. No login redirect. |
| `/login` | A working entry to the existing owner sign-in; reusing `/sign-in` via a redirect is preferred to duplicating the form. |
| `/sign-in` | Preserve existing bookmarks or provide a tested compatibility redirect. No public account creation. |
| Private home | Preserve the dashboard at a deliberate destination, such as `/app`, and route successful login there. Do not hide it behind the new marketing root. |
| Existing private pages | Keep working, authenticated and directly navigable. |
| Existing API, auth, MCP, receiver and callback paths | Preserve methods, bodies, credentials, statuses and intended access. A machine POST must not become an HTML landing response or a cross-host login redirect. |
| Public metadata/assets | Explicit ownership, correct MIME types and cache policy; no collision with private app assets. |
| Unknown path | Intended 404 or existing authenticated behavior, never a blanket successful landing-page fallback. |

Document ownership of both apps' `/_next` assets, fonts, icons, `sw.js`, manifest,
offline navigation, image paths, RSC requests and public metadata. Use a dedicated
public asset namespace or otherwise verified separation. Check both a fresh
browser and an existing app service-worker session. Do not register a new public
service worker by default. Private responses and auth traffic must not enter a
shared public cache. Retain SSE behavior if the selected routing touches it.

Before any necessary ingress/DNS edit, capture only the relevant current records,
active routing and rollback settings using existing authorized access. Prepare
and verify the Vercel candidate first. Change only what the public entry requires;
preserve DNS provider, mail records, Tunnel and unrelated services. Use actual
account-provided DNS targets, not values remembered from another project. See
[Vercel custom domains](https://vercel.com/docs/domains/working-with-domains/add-a-domain).
Do not turn this into host maintenance or a full application rollout. If an app
source change is unavoidable, its existing release controls still apply. Complete
all independent site work while an external routing prerequisite is unavailable.

## Creative brief: a working model of a connected world

The first screen should explain the product in one glance and earn attention
through a visual only Commandry would have. Favor a composed operations instrument
over a generic SaaS sales page. Preserve the real Commandry mark and use its
visual language as the foundation. A graphite, cool-neutral and restrained
electric-accent direction is a starting point; typography, spacing and composition
must be chosen deliberately against the actual mark. Do not clone IYU's layout.

Use one signature interactive scene, not six unrelated dashboard cards. A
fictional project sits among its repository, service, host, notes and work.
Selecting an item reveals why it belongs and what changed. A finite animated
sequence can carry one source event into project context, related work and a
scoped agent brief. Resource, project, work and knowledge identities remain
consistent as the explanation progresses. The scene should teach the product,
not merely decorate the hero.

Suggested page sequence, adjustable for a stronger composition:

1. **Introduction.** Wordmark, concise definition, the signature scene, a primary
   in-page "Explore Commandry" action and a quiet "Sign in" utility link.
2. **Connected context.** Show projects, work, source-preserving captures and
   knowledge as related views of one world. A small interactive selection changes
   the narrative and relevant records, not just a decorative highlight.
3. **An operational signal.** Show one synthetic host/service change, its project
   relationship and a linked next action. Observatory-inspired checks use quiet
   moving dots with short trails; omit permanent check arrows and flashy pulses.
4. **Context for agents.** Show a scoped brief, source evidence, capability boundary
   and review point. Describe live memory/MCP capabilities separately from future
   execution orchestration. Demonstration buttons never dispatch real work.
5. **Where it stands.** Plain development status and future possibility, followed
   by a restrained footer with a working owner sign-in link. No acquisition funnel.

Treat these as a coherent short story, not a requirement for five viewport-tall
sections. Keep mobile reading and normal scrolling natural.

### Copy, numbers and capability claims

Suggested opening definition: "A personal operations system for projects,
knowledge, infrastructure and AI agents." Refine it into clear, specific copy.
Suggested status meaning: "Built for personal use. Still evolving. Commandry may
become a wider product in the future." Do not promise a release or availability.

Use a content/evidence table in the implementation log:

| Topic | Public framing |
| --- | --- |
| Projects, work, captures, knowledge and source evidence | Explain verified implemented behavior; use an authored example instead of exposing owner records. |
| Infrastructure and Observatory | Explain resource relationships and observed signals. Do not imply universal integrations or that unknown health is healthy. |
| Scoped agent knowledge and MCP | Show existing scoped context and evidence concepts supported by source and deployment records. |
| Autonomous agents, routines and wider adapters | Label as direction or in development unless fresh evidence establishes an actual released capability. |

Numbers may make the model legible: for example, counts of resources, sources,
notes or linked work in the fictional scene. Compute them from that example and
label the scene "Illustrative example" near the visual. Do not present them as
live production telemetry, customer counts, uptime, time saved, productivity
gains, or integration totals. Never publish historic private inventory counts
as current public stats. Static real claims need an identified, dated source.

Avoid empty superlatives, AI buzzwords, fake chat/terminal sequences, testimonials,
pricing, customer logos, fake traffic, fake loading and generic integration walls.
Specifically avoid purple gradients, gradient headline text, blurred floating
orbs, a glass-panel dashboard theme, huge pill buttons, italic accent words,
decorative numbered chapters, and identical icon-card grids repeated down the page.
Use numeric content where it explains the example, not ornamental numbering.

### Motion, accessibility and performance

Use SVG, CSS and modest React state first. Add a motion dependency only for a
specific interaction that simpler code cannot serve cleanly. Avoid autoplay video
or a heavy canvas scene. Transitions should explain flow, selection and spatial
relationships; do not hide every paragraph behind scroll-triggered entrances.

Provide a complete still version under `prefers-reduced-motion`, an accessible
stop control for meaningful continuing animation, and no loss of copy or data.
Pause expensive work offscreen and in hidden tabs. All meaningful selections
must support keyboard and touch, with a readable text/list equivalent. Preserve
browser scrolling and Back/Forward. No cursor replacement or scroll hijacking.

Use semantic headings, landmarks, skip navigation, readable contrast, visible
focus, stable layouts and touch targets. Test at 320px, representative mobile,
tablet and desktop widths, enlarged text and reduced motion. If a theme selector
ships, verify both themes and persistence; one polished theme is acceptable.
Use responsive assets and self-hosted, licensed fonts where practical.

Measure a production build under recorded mobile conditions. Aim for LCP <=2.5s
and CLS <=0.1 in that lab run; label measurement conditions and do not call lab
results field performance. Keep core content readable before hydration and with
JavaScript disabled. Inspect animation frames and actual visible movement.

## Execution sequence and records

The implementing agent owns this sequence after the companion prompt is invoked:

1. **Orient and discover.** Read the minimum required Commandry docs and current
   source; inspect IYU's actual reference and assets; identify Vercel account,
   project, current domain routing and available non-secret access references.
   Keep a checklist in `EXECUTION.md` beside this file, with commands, revisions,
   evidence, limitations and the next action. Do not launch implementation from
   this planning task.
2. **Record the boundary.** Select routing and private-home behavior. Record the
   owner-approved public-site/Vercel extension in a scoped ADR using the next
   available number. Link it from the deployment architecture and ADR index;
   preserve the existing private-platform decisions. Inventory relevant shared
   consumers before editing scripts or asset ownership.
3. **Build an early complete page.** Add `apps/site`, truthful copy, the signature
   scene and footer. Render it early, inspect actual desktop/mobile results, and
   refine typography, geometry, rhythm and motion. Use existing approved assets;
   do not wait on unnecessary image generation or a large design-reference suite.
4. **Finish routing and metadata.** Implement `/login` compatibility, the selected
   app-home path, isolated assets, error behavior, title/description, canonical
   `https://commandry.site/`, favicon, a real social image, robots and sitemap.
   Index only public production content; keep previews and private pages noindex.
   Add concise agent-facing build/content/deploy documentation. No new privileged
   MCP tool is required for a public page without application actions; record that
   intentional boundary rather than inventing an endpoint.
5. **Verify and fix.** Run scoped format/lint/types/build commands and meaningful
   browser checks using the [guarded browser runner](../../../tools/browser-safety/README.md).
   Record exact commands after the package exists. Check links, example controls,
   mobile menu, focus, reflow, motion, no-JS content, console/network and route/auth
   behavior. Check both themes if offered. Review screenshots and changing frames,
   not only passing assertions. Preserve evidence outside private runtime exports.
6. **Integrate and deploy.** Commit meaningful verified changes with hooks. Fetch
   current `main`, integrate normally and push, or merge a required PR. Do not
   force-push, disable checks or re-enable a held private deployment. Use the
   connected Vercel tools to configure the public project and deploy the exact
   merged source. Verify READY status, commit, root directory and production branch.
7. **Cut over and prove.** Apply the minimal prepared route/domain change only
   after candidate checks. Verify the actual custom-domain root, all public
   assets, social image, redirects and owner entry. Recheck protected reads,
   machine endpoint routing, caching and existing app assets. Roll back the
   route/alias immediately if critical existing access fails. Fix and retest the
   candidate before retrying. Keep an exact rollback command or procedure.
8. **Close out.** Update `EXECUTION.md` with the final source SHA, Vercel deployment
   identity, public HTTP evidence, screenshots, routing map, rollback, measured
   limits and any remaining external blocker. Distinguish implementation, source
   integration, Vercel readiness and apex activation. A preview alone is not done.

## Acceptance checklist for implementation

- [ ] `commandry.site/` serves the new public page without sign-in, including when
      visited by the signed-in owner.
- [ ] The product and its in-development/private availability are clear immediately;
      no enrollment, marketing form, trial or purchase path is present.
- [ ] The signature visualization is specific to Commandry, visibly animated,
      interactive by keyboard/touch, readable when still and labeled illustrative.
- [ ] Every capability claim is supported or explicitly future-facing. Example
      numbers reconcile with authored records and expose no owner data.
- [ ] `/login` works, existing `/sign-in` links work, successful authentication
      reaches the private workspace, and private pages remain protected.
- [ ] Existing API/MCP/callback methods and statuses remain intact; app and public
      assets, cache boundaries and existing service-worker sessions are verified.
- [ ] Production build, scoped lint/types and meaningful navigation/routing checks
      pass. Desktop, mobile, focus, reflow, reduced motion and animation frames
      have actually been inspected, with evidence and honest environment gaps.
- [ ] Metadata, social image, canonical, sitemap, indexing and real 404 behavior
      are correct on the custom domain; previews remain noindex.
- [ ] Source is on `main` through normal Git operations with hooks preserved.
      Optional broad application CI did not become an unnecessary release wait.
- [ ] The connected Vercel deployment is READY from the integrated source and the
      actual public homepage is verified. Required rollback and route records exist.

## Prompt design source

The companion prompt follows the supplied [Claude Opus 5.5 prompting guide](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5-5),
read November 7, 2026. It states completion conditions, requests brief continuing
progress updates, directs relevant connected-source discovery, and names specific
unwanted frontend patterns. It asks for outcomes and evidence, not private
reasoning. Prompt text cannot configure model effort or repair a stopped harness;
use the controls provided by the actual client.
