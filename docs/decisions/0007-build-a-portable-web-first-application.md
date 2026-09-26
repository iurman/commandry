# ADR 0007: Build a portable web-first application

**Status:** Superseded

**Reopened:** 2026-09-21

**Superseded:** 2026-09-25 by [0010](0010-build-a-nextjs-web-first-modular-monolith.md).

The responsive web/PWA direction remains accepted. The React/Vite and Hono
implementation below was selected to fit Cloudflare Workers rather than the
product's application requirements and is no longer current.

**Date:** 2026-09-15

## Context

Commandry must become useful quickly on desktop and phone, may later ship
through TestFlight and Android distribution, and may eventually need a Linux
desktop application. Building separate clients first would slow product
learning. Selecting a hosting-specific full-stack framework would also make a
future container deployment more expensive.

## Decision

Build the first client as a responsive React/Vite single-page application and
installable PWA. Build the API with Hono and Web Standard interfaces, with thin
Cloudflare Worker and Node entrypoints. Use TypeScript contracts across the
client, API, events, and jobs.

When native capabilities are validated, wrap the web client with Capacitor for
iOS and Android. Evaluate Tauri for Linux/desktop only when native desktop
integration is required. The hosted API remains the behavioral boundary for all
clients.

## Consequences

- One UI reaches browsers, installed PWAs, and later native shells.
- The API can move between Workers and Node/Docker without rewriting domain
  behavior.
- The initial app does not receive SSR by default; this is acceptable for an
  authenticated personal application.
- Native stores, signing, plugins, and background restrictions still require
  platform-specific work when those clients are introduced.
- TestFlight is not a zero-cost substitute for the PWA because Apple program
  membership and signing infrastructure are required.

## Alternatives considered

- **Next.js:** strong framework and Vercel pairing, but SSR and server-component
  benefits do not outweigh initial coupling for this product.
- **React Native/Expo first:** good native experience, rejected because web and
  desktop are the first broad surface and native-only needs are not validated.
- **Tauri first:** broad target support, rejected because the Rust/native build
  chain adds complexity before native integration is needed.
- **Fully separate native clients:** rejected due to duplicated feature and
  contract work.

## Follow-up

Validate the PWA on phone-sized layouts early. Record a native-client ADR when a
specific capability—push, share target, secure storage, background work, tray,
or filesystem access—justifies its distribution pipeline.
