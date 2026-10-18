# ADR 0017: Confirm Observatory presentation defaults

**Status:** Accepted

**Date:** 2026-10-18

## Context

The merged Observatory presentation change in PR 39 implements the owner's
requested primary-group tour, watch orbit, briefing, compact labels and
hub-and-ring arrangement. OQ-039 retained pacing, attention preemption, family
order and callout thresholds for owner confirmation.

On October 18, 2026, the owner explicitly selected "Keep the current defaults"
when asked to confirm those settings before deployment.

## Decision

Retain the current implementation settings:

- Travel for 4.5 seconds, dwell for 24 seconds, or 36 seconds with attention,
  and orbit at 0.03 radians per second.
- Preempt once when a primary group's impact or exposure is newly raised.
  Existing attention prioritizes the initial stops; persistent unchanged
  attention does not repeatedly interrupt the presentation.
- Keep the primary groups' hub-and-ring visiting order and the current family
  order: hosts, providers, other operational kinds, repositories, collections
  and projects, then references. Individual repositories are not tour stops.
- Enter dense-member callouts below 0.9 of a compact label width, leave above
  1.2, and frame the group in the centre 62 percent of the stage width.
- Preserve the existing pause, reduced-motion, direct-interaction and
  reading interruption rules. Selecting a primary group deliberately starts
  its watch; selecting a sub-resource keeps the camera still.

The [presentation specification](../features/gravity-observatory.md#presentation-watch-and-briefing)
and [implementation plan](../plans/observatory-presentation/PLAN.md) retain the
complete behavior and rationale.

## Consequences

OQ-039 is resolved. These settings are an explicit owner decision rather than
unconfirmed implementation defaults. No product code, schema, capability or
audit contract changes are required by this confirmation.

This decision does not certify a release, physical-device usability, animation
performance or the owner's subjective motion preference after using it. Those
claims require their own verification evidence.

## Alternatives considered

Changing the timing, recurring attention interruption, ring order or callout
thresholds before deployment was offered. The owner chose to retain the
existing settings.

## Follow-up

Qualify and deploy the exact main image through the existing release controls,
re-establish affected acceptance evidence, and record live verification and
any remaining device limitations. Zero downtime deployment changes remain a
separate planning discussion.
