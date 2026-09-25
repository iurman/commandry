# ADR 0010: Build a Next.js web-first modular monolith

**Status:** Proposed

**Date:** 2026-09-21

## Context

Commandry needs a responsive web application first, a stable API for agents and
future native clients, installable PWA behavior, authentication, and a path to
Docker self-hosting or Vercel. The prior React/Vite SPA plus Hono API was chosen
to span Cloudflare Workers and Node, but multi-runtime HTTP portability is no
longer an initial requirement.

## Proposed decision

Use Next.js 16 App Router on Node.js 24 LTS for the initial web application and
HTTP API. Build a production standalone Docker image. Place versioned REST/JSON
Route Handlers under `/api/v1` and define their Zod/OpenAPI contracts in a
framework-independent package.

Keep domain and application services outside React components, Route Handlers,
Server Actions, and job consumers. Server Actions may support web-only form
interactions but may not replace APIs needed by native clients, agents, MCP, or
integrations.

Use pnpm workspaces without Turborepo initially. Use Tailwind CSS v4 with
semantic tokens and Radix Primitives selectively for accessible behavior. Keep
the Storybook experience lab as local-only executable documentation.

Do not use Vite as the application framework and do not add Hono. Storybook may
use its officially recommended Next.js Vite builder as an isolated development
implementation detail.

## Consequences

- Web UI, authentication mount, HTTP API, server rendering, and PWA server
  behavior share one maintained application framework.
- The same repository has first-class Docker and Vercel deployment paths.
- Framework portability comes from domain/application boundaries and API
  contracts, not from limiting the whole app to Web Standard handlers.
- Next.js upgrades and caching behavior require explicit tests and version
  discipline.
- Asynchronous Server Components require browser coverage because the Next.js
  Vitest guide does not currently support them directly.
- A later Capacitor or Tauri shell consumes the same versioned API and must not
  fork domain behavior.

## Alternatives considered

- **React/Vite plus Hono:** viable, but requires two application frameworks and
  was primarily justified by the rejected Workers-first topology.
- **React Router framework mode:** credible full-stack option, but Next.js has a
  more direct Vercel path and documented standalone Docker deployment for the
  two hosting directions under consideration.
- **Expo/React Native first:** adds native build and release complexity before a
  concrete native-only requirement exists.
- **Tauri first:** adds a native toolchain before Linux desktop integration is
  needed.

## Evidence

See [Technology stack](../architecture/technology-stack.md) and
[Hosting and stack evaluation](../research/hosting-and-stack-evaluation.md).

## Acceptance gates

1. Build and run the standalone image on Node.js 24.
2. Exercise one server-rendered route, one `/api/v1` route, authentication, and
   runtime environment configuration through the reverse proxy.
3. Prove the app builds on Vercel without introducing Vercel-only domain code.
4. Prove the Storybook lab is checked by CI and absent from production output.
