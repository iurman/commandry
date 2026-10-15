import { describe, expect, it } from "vitest";
import type {
  InfrastructureResource,
  InfrastructureOverview,
} from "@commandry/contracts";
import {
  gravityDefaults,
  InfrastructureLayout,
  projectInfrastructure,
  readGravityPreferences,
  RecordedInfrastructureActivity,
} from "./infrastructure";
const resource = (
  id: string,
  parentResourceId: string | null = null,
): InfrastructureResource => ({
  id,
  name: id,
  kind: parentResourceId ? "service" : "host",
  parentResourceId,
  childCount: 0,
  projects: [
    { id: "project-a", name: "Project A" },
    { id: "project-b", name: "Project B" },
  ],
  sources: [],
  metrics: [],
  telemetry: "unknown",
  health: "unknown",
});
const resources = [
  { ...resource("host"), childCount: 9 },
  resource("web", "host"),
  resource("database", "host"),
  resource("other"),
];
describe("canonical infrastructure Gravity projection", () => {
  it("normalizes footprint area so kind-specific proportions do not change equal sizes", () => {
    const scene = projectInfrastructure(
      [resource("compute"), { ...resource("storage"), kind: "storage" }],
      { ...gravityDefaults, size: "uniform" },
    );
    const [a, b] = scene.wells;
    expect(a!.radius ** 2 * a!.aspect).toBeCloseTo(
      b!.radius ** 2 * b!.aspect,
      8,
    );
  });
  it("keeps existing landmarks when a new UUID arrives before them in sort order", () => {
    const layout = new InfrastructureLayout();
    const before = layout.project(resources, gravityDefaults);
    const after = layout.project(
      [resource("aaa-new"), ...resources],
      gravityDefaults,
    );
    for (const well of before.wells.filter((w) => w.kind === "host")) {
      const next = after.wells.find((item) => item.id === well.id)!;
      expect([next.x, next.z]).toEqual([well.x, well.z]);
    }
  });
  it("retains identities once, handles arbitrary project names, nests actual containment and does not change source records", () => {
    const before = JSON.stringify(resources);
    for (const grouping of ["hosts", "projects", "custom"] as const) {
      const scene = projectInfrastructure(resources, {
        ...gravityDefaults,
        grouping,
        assignments: { other: "Home lab" },
      });
      expect(
        scene.wells
          .filter((w) => w.kind !== "project")
          .map((w) => w.id)
          .sort(),
      ).toEqual(resources.map((r) => r.id).sort());
      expect(scene.wells.find((w) => w.id === "web")?.hostId).toBe("host");
      expect(new Set(scene.wells.map((w) => w.id)).size).toBe(
        scene.wells.length,
      );
    }
    expect(JSON.stringify(resources)).toBe(before);
  });
  it("sizes by complete child counts even when children are on another page and keeps layout stable across telemetry updates", () => {
    const page = projectInfrastructure(
      [resources[0]!, resources[3]!],
      gravityDefaults,
    );
    expect(page.wells.find((w) => w.id === "host")!.radius).toBeGreaterThan(
      page.wells.find((w) => w.id === "other")!.radius,
    );
    const refreshed = projectInfrastructure(
      resources.map((r) => ({ ...r, telemetry: "reporting" })),
      gravityDefaults,
    );
    const initial = projectInfrastructure(resources, gravityDefaults);
    expect(refreshed.wells).toEqual(initial.wells);
    expect(
      projectInfrastructure([resource("orphan", "off-page")], gravityDefaults)
        .wells[0]?.kind,
    ).toBe("host");
  });
  it("terminates malformed containment cycles without dropping resources and validates saved appearance", () => {
    const scene = projectInfrastructure(
      [resource("a", "b"), resource("b", "a"), resource("c", "a")],
      gravityDefaults,
    );
    expect(scene.wells).toHaveLength(3);
    expect(
      scene.wells.every((w) => Number.isFinite(w.x + w.z + w.radius)),
    ).toBe(true);
    expect(readGravityPreferences("bad")).toEqual(gravityDefaults);
    expect(
      readGravityPreferences(
        JSON.stringify({
          version: 1,
          grouping: "custom",
          colors: { attention: "javascript:bad", reporting: "#123456" },
        }),
      ).colors,
    ).toEqual({ reporting: "#123456" });
  });
});
describe("recorded infrastructure activity", () => {
  const now = Date.parse("2026-10-15T18:00:00Z");
  const event = (id: string, age = 1000) => ({
    id,
    resourceId: "host",
    summary: "Host sample recorded",
    occurredAt: new Date(now - age).toISOString(),
    sourceLabel: "Host source",
    evidenceHref: "/api/v1/source-envelopes/actual",
  });
  const snapshot = (events: ReturnType<typeof event>[]) =>
    ({ events }) as Pick<InfrastructureOverview, "events">;
  it("never invents transfers or replays initial, old, future, duplicate, paused or resumed-baseline events", () => {
    const activity = new RecordedInfrastructureActivity();
    activity.synchronize(snapshot([event("baseline")]), true, now);
    expect(activity.snapshot().events).toHaveLength(0);
    activity.synchronize(
      snapshot([
        event("new"),
        event("baseline"),
        event("old", 61000),
        event("future", -1000),
      ]),
      true,
      now,
    );
    expect(activity.snapshot().events.map((e) => e.id)).toEqual(["new"]);
    expect(activity.snapshot().transfers).toEqual([]);
    expect(activity.snapshot().events[0]).toMatchObject({
      from: "host",
      to: "host",
      kind: "observation",
      effect: "arrival",
    });
    activity.synchronize(snapshot([event("new")]), true, now);
    expect(activity.snapshot().events).toHaveLength(1);
    activity.advance(1.5);
    expect(activity.active()).toBe(false);
    activity.synchronize(snapshot([event("paused")]), false, now);
    activity.synchronize(snapshot([event("resume")]), true, now);
    expect(activity.snapshot().events).toEqual([]);
    activity.setVisible(false);
    activity.synchronize(snapshot([event("offscreen")]), true, now);
    expect(activity.active()).toBe(false);
    activity.setVisible(true);
    activity.synchronize(snapshot([event("visible-baseline")]), true, now);
    expect(activity.active()).toBe(false);
    activity.synchronize(snapshot([event("fresh-visible")]), true, now);
    expect(activity.snapshot().events.map((item) => item.id)).toEqual([
      "fresh-visible",
    ]);
  });
});
