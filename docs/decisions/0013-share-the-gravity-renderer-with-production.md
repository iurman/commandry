# ADR 0013: Share the Gravity renderer with production infrastructure views

**Status:** Accepted

**Date:** 2026-10-15

## Context

The owner accepted the Gravity Observatory rendering study and explicitly
requested its integration into the real infrastructure overview and wallboard.
The study's renderer and synthetic simulation were coupled. Importing that
application into production would violate the local experience lab boundary.
The existing versioned overview already supplies authorized, paginated resource
identities, containment, project links, source freshness, capacity and events.

## Decision

Move the reusable Three.js renderer, surface materials, camera, labels and
activity drawing into `packages/ui`, exposed through dedicated subpaths.
Keep Three.js at the already investigated study version, loaded dynamically on
the client. The UI barrel does not import it. Production and the local study
use the same renderer through an injected activity-source contract.

Keep fixture resources, simulated requests, build dispatch and scenario controls
in `apps/lab`. Production projects the existing overview contract into the
shared renderer. Parent-child links create nesting; project/custom groupings
are presentation choices and do not change canonical memberships or permissions.
A resource remains one identity even when linked to multiple projects.

Production activity may pulse a newly observed persisted event's actual subject.
It must not infer a request destination, service availability or network traffic
from containment, dependency links, host utilization or source freshness.
Initial loads, page changes, pause, reduced motion, delayed data and offscreen
intervals establish baselines rather than replaying activity. Ambient movement
and automatic cameras are independent presentation preferences.

Retain the existing complete server-paginated resource population, search,
project scopes, topology, list and evidence inspector. Gravity shows the same
visible page, including standalone records whose parent is outside it. Add an
optional total direct-child count to the overview response so visual sizing is
independent of whether children are on the current page. No database migration
or new monitoring adapter is required.

## Consequences

- The lab remains absent from production bundles. Its simulation cannot ship
  merely by mounting the shared renderer.
- The current six/twelve-resource pages bound the shader's 64 contributions;
  larger inventories remain reachable through server pagination and search.
  Rendering an entire fleet at once requires separate level-of-detail work.
- Topology and list remain available when WebGL, loading or the graphics context
  is unavailable. Keyboard resource selection and evidence do not require GPU
  picking.
- Preferences are versioned and device-local. Custom sector names and colors
  never alter inventory, project ownership, source configuration or audit policy.
- The normal deployment and authentication boundaries remain in force. Merging
  source is separate from validating and releasing the production artifact.

## Alternatives considered

- Import the study directly: violates the lab boundary and couples fixtures to
  live data.
- Copy a second renderer into the web app: duplicates the material, label and
  camera behavior that was just reviewed.
- Replace the overview API or build new monitoring: unnecessary for this read-only
  presentation slice and broader than the owner's selected next step.
