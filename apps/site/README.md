# Commandry public site

**Status: Operational.** The public landing page for `commandry.site`. Routing
and hosting are decided in
[ADR 0019](../../docs/decisions/0019-serve-the-public-site-from-vercel-behind-the-existing-ingress.md);
release history is in
[the execution record](../../docs/plans/public-site/EXECUTION.md).

This package is independent of the private application. It imports no
`@commandry/*` package, reads no data, has no API routes, no auth and no
analytics. There is intentionally no MCP tool for it: it performs no
application action, and its content changes through source review.

## Content

- Page copy: `app/page.tsx`.
- Illustrative example records, steps, lenses and checks: `content/world.ts`.
  Every number on the page is derived from these arrays. Records are fictional;
  never add owner inventory, private project names or live measurements.
- Capability claims must match shipped behavior in
  [project status](../../docs/project/status.md). Label anything else
  "In development".
- Styles and motion: `app/globals.css`. Animation helpers: `components/activity.ts`.
- Social image and touch icon: regenerate with `scripts/social-card.mjs`.

Keep every public asset under `/_site/` (see `next.config.ts`). The private
application owns `/_next/*`, `/icon.svg`, `/manifest.webmanifest` and `/sw.js`.

## Build and check

From the repository root:

```sh
pnpm --filter @commandry/site dev
pnpm --filter @commandry/site build
pnpm --filter @commandry/site typecheck
pnpm exec eslint apps/site
pnpm exec vitest run --config vitest.config.mts apps/site
```

Browser QA uses the guarded runner. Start the production server first
(`pnpm --filter @commandry/site start`, port 3100), then:

```sh
SAFE_BROWSER_ALLOWED_PORTS=3100 pnpm browser:isolated node apps/site/scripts/qa.mjs http://localhost:3100 <output-dir>
```

Review the screenshots it writes; passing checks are not a visual review.

## Publish

Merging to `main` deploys production on the Vercel project `commandry-site`
(team `iyulabs`, root directory `apps/site`). Branch pushes create protected,
noindex previews. Vercel skips builds when nothing under this package changed.

Rollback: promote the previous READY production deployment in Vercel
(`vercel rollback <deployment-url> --scope iyulabs`). The private application
is unaffected either way.
