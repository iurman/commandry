# ADR 0019: Serve the public site from Vercel behind the existing ingress

**Status:** Accepted; apex routing activated and verified 2026-11-07

**Date:** 2026-11-07

**Authority:** The owner approved a Vercel-deployed informational landing page
at `commandry.site` with working owner sign-in, no signup funnel and the
private application preserved
([plan](../plans/public-site/PLAN.md), [brief](../plans/public-site/OPUS-5.5-PROMPT.md)).
This decision extends ADR 0009 and ADR 0018 for one public page. It does not
move the private application, database, worker or accounts.

## Context

`commandry.site` resolves to Cloudflare, which reaches Caddy on the VPS through
the named Tunnel. Before this change, Caddy sent every request to the active web
slot. The private application owned `/` (its dashboard), `/sign-in`, `/_next/*`, a root-scoped
service worker, `/api/*`, `/mcp*`, receivers and callbacks. Unauthenticated
requests to private pages redirect to `/sign-in`.

The owner wants `/` to become a public introduction while sign-in, the private
workspace and every machine route keep working. The Caddy routing is generated
by `deploy/commandry-rolling.py`, which is an enrolled control file: changing it
holds automatic promotion until the owner reviews and re-enrolls the controls.

## Decision

1. The public site is `apps/site` (`@commandry/site`), a static Next.js 16 App
   Router package in the existing workspace. It imports no `@commandry/*`
   package, reads no application data and registers no service worker.
2. The Vercel project `commandry-site` (team `iyulabs`) builds only that package
   from `main` with root directory `apps/site` and a filtered pnpm install.
   Preview deployments are protected and sent with `X-Robots-Tag: noindex`.
3. Every asset the site emits lives under `/_site/`: Next.js output through
   `assetPrefix: "/_site"`, plus the icon, touch icon and social image in
   `public/_site/`. Nothing the site serves collides with the application's
   `/_next/*`, `/icon.svg`, `/manifest.webmanifest` or `/sw.js`.
4. Routing keeps the current origin. Caddy sends exactly these GET/HEAD
   requests to the Vercel production alias, with `Cookie` and `Authorization`
   stripped and `Set-Cookie` dropped:

   | Request | Destination |
   | --- | --- |
   | `GET/HEAD /` | Vercel public site |
   | `GET/HEAD /_site/*` | Vercel public site |
   | `GET/HEAD /robots.txt`, `/sitemap.xml` | Vercel public site |
   | Everything else, including any POST to `/` | Active private web slot, unchanged |

5. The private dashboard moves to `/app`. Successful sign-in, the shell's Home
   link and the PWA start URL point there. `/login` redirects to `/sign-in`;
   `/sign-in` is unchanged. The PWA `id` stays `/` so installed apps keep
   their identity.
6. The owner-authorized operator installs the reviewed rollout controller and
   enrolls its controls fingerprint before automatic promotion can accept the
   new application image. The controller preserves the existing public/private
   root while preparing the candidate. Only after fresh recovery, readiness,
   authenticated owner reads and a real worker check pass does the traffic
   switch activate the public route alongside the new private `/app` route.
   A failed first cutover restores the private root; later failed releases
   preserve the already-active public site.

## Consequences

- The public page can be published and rolled back on Vercel without touching
  the VPS, and a Vercel outage affects only the four public paths.
- Owner cookies and tokens never reach Vercel. The private application keeps
  its own authentication, streaming, receivers and MCP paths.
- The existing service worker is network-first for navigations and only falls
  back to `/offline.html`, so existing sessions load the public `/` normally.
- Client navigations in the app no longer target `/`. A stale client that
  requests `/` as an RSC payload receives the public site's payload and falls
  back to a full navigation.
- The reviewed control installation and exact-source qualified rollout activated
  the apex on November 7, 2026. The Vercel production URL remains independently
  reachable; activation and rollback evidence is in the execution record.

## Alternatives considered

- **Vercel as the apex frontend with external rewrites to the application.**
  Rejected for now: every API, MCP, receiver and streaming request would pass
  through Vercel, it needs a second origin hostname in the Tunnel and DNS, and
  it widens the change from four paths to all of them.
- **A private-application subdomain.** Rejected: it changes cookie scope,
  sign-in origin, PWA identity, MCP and receiver URLs already given to clients.
- **Adding the page to the private application.** Rejected: it would ship the
  public page through the private release gates and leave `/` behind auth.

## Follow-up

- Completed by the owner-authorized operator: reviewed controller installation,
  unchanged-migration controls enrollment, qualified promotion and apex/owner QA.
- Record activation evidence in
  [the execution record](../plans/public-site/EXECUTION.md).
