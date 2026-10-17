# Owner review of the actual Observatory fixture

Status: Task-owned local review tooling. No owner result has been recorded.

The bridge serves the private built Infrastructure page and assets identified by an explicit disposable preview receipt. Its reads use the existing 18-resource operational fixture through the actual Observatory application service and strict shared contracts. It adds a persistent SYNTHETIC LOCAL REVIEW banner with the built source SHA and fixture clock. The same banner moves inside the active native fullscreen element, with its measured height reserved in the fullscreen content area so the header and controls have their own space. That space follows banner resizing; the banner and container return to their original location and styling on exit. It does not replace the product renderer or controls.

After the command center has opened the candidate, verified its banner/source, checked the controls and pixels, and confirmed the intended owner review surface, ask:

"Using this synthetic Observatory, find the group you would investigate first and explain why. Open its members, identify a failing member and any missing coverage, then explain what the provider advisory does and does not tell you. Please describe anything that was unclear as you go."

Do not coach the owner with a group name, expected color, failing-member name or hidden hover target. Record their observations separately. This document does not claim F06 passed.

Start from the repository root with the exact task-owned preview directory supplied by the command center:

```bash
pnpm exec tsx scripts/observatory-usability-preview.mjs --preview-dir "$COMMANDRY_REVIEW_PREVIEW_DIR"
```

The directory must contain its own matching receipt.json and credentials.json, using the existing preview contract. No global current-preview receipt is read. The receipt must identify a disposable PostgreSQL18, disabled external polling and private built assets. The bridge verifies /version SHA and test environment before using the existing fixed local password sign-in. Credentials and the backend session remain in memory, and the browser receives no auth cookie. The default listener chooses a free port on 127.0.0.1. The command center owns launch, browser checks, the owner question, and stopping the bridge and its separate preview when finished. Use Ctrl-C to stop this bridge.

The fixture clock is 2026-10-16T12:00:00.000Z, with deterministic recorded freshness evaluated at the fixture read clock. The 18 canonical IDs remain reachable through complete continuation, search, grouping and inspection. Availability, security, capacity, provider exposure, development versus production scope and missing coverage are synthetic evidence, not live observations or production release evidence. Provider mappings do not prove a local outage. Operational source details, Work records, private views and the public provider feed are explicitly unavailable; mutations and unrelated routes are denied. The bridge performs no ingestion, background polling, external requests, account/device changes or deployment.

Project reads accept page sizes from 1 through 100 with complete continuation. Infrastructure and wallboard links retain only validated projectId and q scope fields; unknown or duplicate fields and asset queries are rejected.

The server accepts only exact local Host/same-origin requests, fixed built pages/assets, fixture projects/overview and the exact POST read endpoints. It denies redirects, encoded traversal, arbitrary backend paths and browser credentials/headers. Resource and connect CSP origins remain local. The command center must complete actual built browser verification before presenting this task to the owner.
