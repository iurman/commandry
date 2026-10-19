// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { createElement } from "react";
import { PerspectiveCamera, Vector3 } from "three";
import type {
  InfrastructureOverview,
  FoundationProjectWorkCursor,
  FoundationProjectWorkPage,
} from "@commandry/contracts";
import type { Well } from "./model";
import { defaultResourceIconId } from "./resource-icons";
import type {
  ObservatoryRenderer,
  RendererHooks,
  RendererSettings,
} from "./renderer";
import {
  OperationalObservatory,
  type OperationalObservatoryProps,
} from "../components/OperationalObservatory";
import { projectObservatory } from "@commandry/test-support";
import {
  mixedObservatoryFixture,
  operationalObservatoryFixture,
  scaleObservatoryFixture,
  observatoryFixtureResource,
  observatoryFixtureInput,
} from "@commandry/test-support";
import {
  arrangeRoots,
  isPrimaryGroupKind,
  mapOperationalEvents,
  mapOperationalCheckObservations,
  memberRings,
  observedTotalRam,
  operationalAttention,
  OperationalLayout,
  OperationalRecordedActivity,
  ringGap,
  ROOT_GAP,
} from "./operational-layout";
import {
  defaultObservatoryPreferences,
  legacyObservatoryStorageKey,
  observatoryGroupings,
  observatoryStorageKey,
  type ObservatoryQuery,
} from "./observatory-preferences";

const options = defaultObservatoryPreferences();
const engine = vi.hoisted(() => ({
  fail: false,
  hooks: null as RendererHooks | null,
  created: vi.fn(),
  update: vi.fn(),
  dispose: vi.fn(),
  preset: vi.fn(),
  refresh: vi.fn(),
  adopt: vi.fn<(id: string) => boolean>(),
}));
vi.mock("./renderer", () => ({
  ObservatoryRenderer: class {
    constructor(
      _element: HTMLElement,
      _settings: RendererSettings,
      private hooks: RendererHooks,
    ) {
      if (engine.fail) throw Error("GPU unavailable");
      engine.hooks = hooks;
      engine.created();
    }
    update(wells: Well[], settings: RendererSettings) {
      engine.update(wells, settings);
      this.hooks.anchors(
        wells.map((well, index) => ({
          id: well.id,
          label: well.label,
          kind: well.kind,
          x: 100 + index * 10,
          y: 140,
          visible: true,
          opacity: 1,
          attention: well.attention,
          sector: well.sector,
        })),
      );
    }
    dispose = engine.dispose;
    preset = engine.preset;
    refreshActivity = engine.refresh;
    adoptSubject = engine.adopt;
    measureAnchor() {}
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  engine.fail = false;
  engine.hooks = null;
  engine.adopt.mockReset();
  localStorage.clear();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("member rings", () => {
  const order = (a: string, b: string) => a.localeCompare(b);
  const polar = (offset: { x: number; z: number }) => ({
    distance: Math.hypot(offset.x, offset.z),
    angle: Math.atan2(offset.z, offset.x),
  });
  it("keeps one ring and equal edge gaps when one member is much larger", () => {
    const members = [
      { id: "a-host", extent: 2 },
      ...["b", "c", "d", "e", "f"].map((id) => ({ id, extent: 0.5 })),
    ];
    const hub = 1.5,
      gap = ringGap(hub, 2);
    const { offsets, extent } = memberRings(hub, members, order);
    const placed = members.map((member) => ({
      ...member,
      ...polar(offsets.get(member.id)!),
    }));
    const distance = placed[0]!.distance;
    for (const member of placed)
      expect(member.distance).toBeCloseTo(distance, 9);
    expect(distance).toBeGreaterThanOrEqual(hub * 1.16 + gap + 2 - 1e-9);
    expect(extent).toBeCloseTo(distance + 2, 9);
    // Sized slots: far tighter than six slots each wide enough for the host.
    expect(distance).toBeLessThan((2 + gap / 2) / Math.sin(Math.PI / 6));
    const half = (member: { extent: number }) =>
      Math.asin((member.extent + gap / 2) / distance);
    const sorted = [...placed].sort((a, b) => a.angle - b.angle);
    const gaps = sorted.map((member, index) => {
      const next = sorted[(index + 1) % sorted.length]!;
      const turn =
        next.angle -
        member.angle +
        (index === sorted.length - 1 ? Math.PI * 2 : 0);
      return { from: member, size: turn - half(member) - half(next) };
    });
    for (const item of gaps) {
      expect(item.size).toBeGreaterThanOrEqual(0);
      expect(item.size).toBeCloseTo(gaps[0]!.size, 9);
    }
    // The inward direction (offsets face +x outward) sits in the middle of a gap.
    const inward = gaps.find((item) => {
      const start = item.from.angle + half(item.from);
      const end = start + item.size;
      const target = Math.PI;
      const shifted = target < start ? target + Math.PI * 2 : target;
      return shifted >= start && shifted <= end;
    })!;
    const middle = inward.from.angle + half(inward.from) + inward.size / 2;
    expect(Math.cos(middle - Math.PI)).toBeCloseTo(1, 9);
  });
  it("spaces equal members at equal angles, opens a pool centre and starts outward for one", () => {
    const equal = Array.from({ length: 7 }, (_, index) => ({
      id: `m${index}`,
      extent: 0.6,
    }));
    const pool = memberRings(0, equal, order);
    const angles = equal
      .map((member) => polar(pool.offsets.get(member.id)!))
      .sort((a, b) => a.angle - b.angle);
    for (const item of angles)
      expect(item.distance).toBeCloseTo(angles[0]!.distance, 9);
    angles.forEach((item, index) => {
      if (!index) return;
      expect(item.angle - angles[index - 1]!.angle).toBeCloseTo(
        (Math.PI * 2) / 7,
        9,
      );
    });
    // More than eight members around an open centre start with a hexagon.
    const many = Array.from({ length: 20 }, (_, index) => ({
      id: `n${index}`,
      extent: 0.6,
    }));
    const crowded = memberRings(0, many, order);
    const innermost = Math.min(
      ...many.map((member) => polar(crowded.offsets.get(member.id)!).distance),
    );
    expect(
      many.filter(
        (member) =>
          Math.abs(
            polar(crowded.offsets.get(member.id)!).distance - innermost,
          ) < 1e-9,
      ),
    ).toHaveLength(6);
    const solo = memberRings(0, [{ id: "solo", extent: 1 }], order).offsets.get(
      "solo",
    )!;
    expect(Math.hypot(solo.x, solo.z)).toBe(0);
    const single = memberRings(2, [{ id: "only", extent: 0.5 }], order);
    const only = polar(single.offsets.get("only")!);
    expect(Math.cos(only.angle)).toBeCloseTo(1, 9);
  });
});

describe("primary-group arrangement", () => {
  const order = (a: string, b: string) => a.localeCompare(b);
  const sweep = (offset: { x: number; z: number }) =>
    (Math.atan2(offset.z, offset.x) - Math.PI + Math.PI * 4) % (Math.PI * 2);
  it("anchors a dominant group at the centre and circles the rest in family order", () => {
    const roots = [
      { id: "z-references", kind: "reference" as const, extent: 2 },
      { id: "repositories", kind: "collection" as const, extent: 11 },
      { id: "b-host", kind: "host" as const, extent: 4 },
      { id: "a-host", kind: "host" as const, extent: 2.5 },
      { id: "provider", kind: "provider" as const, extent: 3 },
      { id: "other", kind: "collection" as const, extent: 6 },
    ];
    const placed = arrangeRoots(roots, order);
    expect(placed.get("repositories")).toEqual({ x: 0, z: 0 });
    const ring = ["a-host", "b-host", "provider", "other", "z-references"];
    const angles = ring.map((id) => sweep(placed.get(id)!));
    expect([...angles].sort((a, b) => a - b)).toEqual(angles);
    const byId = new Map(roots.map((root) => [root.id, root]));
    for (const a of roots)
      for (const b of roots) {
        if (a.id >= b.id) continue;
        const p = placed.get(a.id)!,
          q = placed.get(b.id)!;
        expect(Math.hypot(p.x - q.x, p.z - q.z)).toBeGreaterThanOrEqual(
          byId.get(a.id)!.extent + byId.get(b.id)!.extent + ROOT_GAP - 1e-9,
        );
      }
    expect(arrangeRoots([...roots].reverse(), order)).toEqual(placed);
  });
  it("keeps an open centre when no group dominates and exposes the visiting order", () => {
    const even = ["c", "a", "b"].map((id) => ({
      id,
      kind: "host" as const,
      extent: 3,
    }));
    const placed = arrangeRoots(even, order);
    for (const offset of placed.values())
      expect(Math.hypot(offset.x, offset.z)).toBeGreaterThan(3);
    const solo = arrangeRoots([even[0]!], order).get("c")!;
    expect(Math.hypot(solo.x, solo.z)).toBe(0);
    const scene = projectObservatory(mixedObservatoryFixture()),
      result = new OperationalLayout().project(scene, options);
    const groups = result.primaryGroupIds.map((id) => result.byId.get(id)!);
    expect(groups[0]!.label).toBe("Repositories");
    expect(result.positions.get(groups[0]!.id)).toMatchObject({ x: 0, z: 0 });
    expect(groups.map((node) => node.kind)).toEqual([
      "collection",
      "host",
      "host",
      "host",
      "host",
      "collection",
      "collection",
    ]);
    expect(groups.every((node) => !node.parentRepresentationId)).toBe(true);
    expect(isPrimaryGroupKind("repository")).toBe(false);
    expect(isPrimaryGroupKind("reference")).toBe(false);
  });
});

describe("operational landscape adapter", () => {
  it.each(observatoryGroupings)(
    "conserves all 91 canonical identities in %s without repository tour hosts",
    (grouping) => {
      const input = mixedObservatoryFixture(),
        scene = projectObservatory({ ...input, grouping });
      const result = new OperationalLayout().project(scene, options);
      expect(result.representedResourceIds).toEqual(
        input.resources.map((item) => item.id).sort(),
      );
      expect(result.wells.map((well) => well.id).sort()).toEqual(
        [...scene.visibleRepresentationIds].sort(),
      );
      expect(result.visibleSubjectForResource.size).toBe(91);
      for (const [resourceId, node] of result.canonical) {
        const subject = result.visibleSubjectForResource.get(resourceId)!;
        expect(result.members.get(subject)?.has(resourceId)).toBe(true);
        if (node.kind === "repository")
          expect(result.positions.get(node.id)?.kind).toBe("project");
      }
      expect(
        result.wells
          .filter((well) => well.kind === "host")
          .every((well) => result.byId.get(well.id)?.kind === "host"),
      ).toBe(true);
      expect(scene.summary.coverage.monitored).toBe(0);
      expect(result.wells.every((well) => !well.attention)).toBe(true);
    },
  );
  it("preserves unique totals under expansion and retains every active GPU representation", () => {
    const input = mixedObservatoryFixture(),
      collapsed = projectObservatory(input),
      layout = new OperationalLayout();
    const before = layout.project(collapsed, options);
    const expanded = projectObservatory({
      ...input,
      expandedRepresentationIds: collapsed.representations.map(
        (node) => node.id,
      ),
    });
    const after = layout.project(expanded, options);
    expect(after.representedResourceIds).toEqual(before.representedResourceIds);
    expect(after.wells).toHaveLength(expanded.visibleRepresentationIds.length);
    for (const well of before.wells)
      expect(after.positions.get(well.id)).toEqual(well);
    const repositories = [...after.canonical.values()].filter(
      (node) => node.kind === "repository",
    );
    expect(repositories).toHaveLength(60);
    expect(
      repositories.every(
        (node) =>
          after.visibleSubjectForResource.get(node.resourceId!) === node.id,
      ),
    ).toBe(true);
  });
  it("is deterministic under permutation and does not move landmarks on an ordinary observation refresh", () => {
    const input = mixedObservatoryFixture(),
      scene = projectObservatory(input),
      layout = new OperationalLayout();
    const first = layout.project(scene, options);
    const reversed = new OperationalLayout().project(
      {
        ...scene,
        representations: [...scene.representations].reverse(),
        visibleRepresentationIds: [...scene.visibleRepresentationIds].reverse(),
      },
      options,
    );
    expect(reversed.wells).toEqual(first.wells);
    const next = layout.project(
      projectObservatory({
        ...input,
        now: "2026-10-16T12:00:18.000Z",
        resources: input.resources.map((item) => ({
          ...item,
          telemetry: "stale" as const,
        })),
      }),
      options,
    );
    expect(next.wells).toEqual(first.wells);
    expect(
      layout.project(scene, { ...options, palette: "earth" }).wells,
    ).toEqual(first.wells);
  });
  it("inserts a root without repacking unrelated groups and preserves nested host meaning", () => {
    const input = mixedObservatoryFixture(),
      layout = new OperationalLayout(),
      before = layout.project(projectObservatory(input), options);
    const resources = [
      ...input.resources,
      observatoryFixtureResource(9980, "provider"),
    ];
    const after = layout.project(
      projectObservatory({
        ...input,
        resources,
        collection: { complete: true, resourceCount: 92 },
      }),
      options,
    );
    for (const [id, well] of before.positions)
      expect([after.positions.get(id)?.x, after.positions.get(id)?.z]).toEqual([
        well.x,
        well.z,
      ]);
    const nested = [...after.canonical.values()].find(
      (node) =>
        node.kind === "host" &&
        node.parentRepresentationId?.startsWith("resource:"),
    )!;
    expect(after.positions.get(nested.id)?.kind).toBe("host");
    expect(after.positions.get(nested.id)?.hostId).toBe(
      nested.parentRepresentationId,
    );
    expect(after.representedResourceIds).toHaveLength(92);
  });
  it("uses total byte RAM only, keeps unknown hosts useful and ignores utilization", () => {
    const input = mixedObservatoryFixture(),
      scene = projectObservatory(input);
    const host = input.resources.find((item) => item.kind === "host")!;
    expect(observedTotalRam(scene, host.id)).toBe(17179869184);
    const hostNode = scene.representations.find(
      (node) => node.resourceId === host.id && !node.referenceTo,
    )!;
    const layout = new OperationalLayout(),
      measured = layout.project(scene, { ...options, size: "total-ram" });
    const changed = structuredClone(scene);
    changed.capacityObservations = changed.capacityObservations.map((item) => ({
      ...item,
      name: "memory.used_percent",
      unit: "%",
      value: 99,
    }));
    expect(observedTotalRam(changed, host.id)).toBeNull();
    const unknown = layout.project(changed, { ...options, size: "total-ram" });
    expect(unknown.ramUnavailableIds).toContain(hostNode.id);
    expect(unknown.positions.get(hostNode.id)!.radius).toBeGreaterThan(0);
    expect([
      unknown.positions.get(hostNode.id)!.x,
      unknown.positions.get(hostNode.id)!.z,
    ]).toEqual([
      measured.positions.get(hostNode.id)!.x,
      measured.positions.get(hostNode.id)!.z,
    ]);
    const unchanged = layout.project(
      {
        ...scene,
        capacityObservations: [
          ...scene.capacityObservations,
          {
            resourceId: host.id,
            name: "memory.used_percent",
            unit: "%",
            value: 99,
            observedAt: scene.evaluatedAt,
            evidenceRef: "fixture:utilization",
          },
        ],
      },
      { ...options, size: "total-ram" },
    );
    expect(unchanged.positions.get(hostNode.id)?.radius).toBe(
      measured.positions.get(hostNode.id)?.radius,
    );
  });
  it("distinguishes required local impact from exposure, optional failure and missing observations", () => {
    const scene = projectObservatory(operationalObservatoryFixture());
    expect(operationalAttention(scene.summary)).toBe("impact");
    const summary = structuredClone(scene.summary);
    summary.availability.confirmedImpact = false;
    summary.security.counts.confirmed_incident = 0;
    summary.provider.counts.confirmed_local_impact = 0;
    summary.provider.counts.potential_exposure = 1;
    expect(operationalAttention(summary)).toBe("exposure");
    summary.provider.counts.potential_exposure = 0;
    expect(operationalAttention(summary)).toBe("neutral");
    expect(summary.availability.optional.failing).toBe(1);
  });
  it("handles the complete thousand-resource deep/adversarial fixture and more than 257 active representations", () => {
    const input = scaleObservatoryFixture(),
      collapsed = projectObservatory(input);
    const scene = projectObservatory({
      ...input,
      expandedRepresentationIds: collapsed.representations.map(
        (node) => node.id,
      ),
    });
    const result = new OperationalLayout().project(scene, options);
    expect(result.representedResourceIds).toHaveLength(1000);
    expect(result.wells.length).toBeGreaterThan(257);
    expect(result.wells).toHaveLength(scene.visibleRepresentationIds.length);
    expect(
      result.wells.every((well) =>
        Number.isFinite(well.x + well.z + well.radius),
      ),
    ).toBe(true);
    expect(result.positions.has(scene.visibleRepresentationIds.at(-1)!)).toBe(
      true,
    );
    // A 300-deep host chain stays within a bounded landscape.
    expect(
      Math.max(...result.wells.map((well) => Math.hypot(well.x, well.z))),
    ).toBeLessThan(500);
    expect(
      Math.min(...result.wells.map((well) => well.radius)),
    ).toBeGreaterThan(0);
  });
  it.each(observatoryGroupings)(
    "keeps %s members inside their pools and every sibling cluster apart",
    (grouping) => {
      const scene = projectObservatory({
        ...mixedObservatoryFixture(),
        grouping,
      });
      const { wells } = new OperationalLayout().project(scene, options);
      expect(wells).toHaveLength(scene.representations.length);
      const byId = new Map(wells.map((well) => [well.id, well]));
      const reach = new Map<string, number>();
      for (const well of wells)
        for (
          let parent = well.hostId ? byId.get(well.hostId) : undefined;
          parent;
          parent = parent.hostId ? byId.get(parent.hostId) : undefined
        )
          reach.set(
            parent.id,
            Math.max(
              reach.get(parent.id) ?? parent.radius,
              Math.hypot(well.x - parent.x, well.z - parent.z) + well.radius,
            ),
          );
      const cluster = (well: Well) => reach.get(well.id) ?? well.radius;
      const siblings = new Map<string | null, Well[]>();
      for (const well of wells) {
        const group = siblings.get(well.hostId) ?? [];
        group.push(well);
        siblings.set(well.hostId, group);
        const parent = well.hostId ? byId.get(well.hostId) : undefined;
        if (!parent) continue;
        const distance = Math.hypot(well.x - parent.x, well.z - parent.z);
        if (parent.pool)
          // Members and their own clusters sit on the flat pool floor.
          expect(distance + cluster(well)).toBeLessThanOrEqual(
            parent.radius * 0.84 + 1e-6,
          );
        // Orbiting members clear the resource basin they belong to.
        else
          expect(distance).toBeGreaterThanOrEqual(parent.radius + well.radius);
      }
      for (const group of siblings.values())
        for (const [index, a] of group.entries())
          for (const b of group.slice(index + 1))
            expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(
              cluster(a) + cluster(b) - 1e-6,
            );
    },
  );
  it.each(observatoryGroupings)(
    "spaces %s members evenly on rings that face away from their own parent",
    (grouping) => {
      const scene = projectObservatory({
        ...mixedObservatoryFixture(),
        grouping,
      });
      const { wells } = new OperationalLayout().project(scene, options);
      const byId = new Map(wells.map((well) => [well.id, well]));
      let rings = 0;
      for (const parent of wells) {
        const members = wells.filter((well) => well.hostId === parent.id);
        const distance = (well: Well) =>
          Math.hypot(well.x - parent.x, well.z - parent.z);
        const byRing = new Map<string, Well[]>();
        for (const member of members.filter((well) => distance(well) > 1e-6)) {
          const key = distance(member).toFixed(4);
          byRing.set(key, [...(byRing.get(key) ?? []), member]);
        }
        const grandparent = parent.hostId ? byId.get(parent.hostId) : undefined;
        for (const ring of byRing.values()) {
          const angles = ring
            .map((well) => Math.atan2(well.z - parent.z, well.x - parent.x))
            .sort((a, b) => a - b);
          // Same-size leaf members sit at equal angles; mixed sizes keep equal
          // edge gaps instead (see the memberRings unit tests).
          const uniform =
            ring.every(
              (well) =>
                well.radius === ring[0]!.radius &&
                !wells.some((other) => other.hostId === well.id),
            ) && angles.length > 1;
          if (uniform) {
            rings++;
            const slot = (Math.PI * 2) / angles.length;
            angles.forEach((angle, index) => {
              const next = angles[(index + 1) % angles.length]!;
              const gap =
                index === angles.length - 1
                  ? next + Math.PI * 2 - angle
                  : next - angle;
              expect(gap).toBeCloseTo(slot, 6);
            });
          }
          if (
            !grandparent ||
            Math.hypot(parent.x - grandparent.x, parent.z - grandparent.z) <
              1e-6
          )
            continue;
          const inward = Math.atan2(
            grandparent.z - parent.z,
            grandparent.x - parent.x,
          );
          // The tether from the grandparent arrives clear of every member.
          for (const well of ring) {
            const angle = Math.atan2(well.z - parent.z, well.x - parent.x);
            const offset = Math.abs(
              Math.atan2(Math.sin(angle - inward), Math.cos(angle - inward)),
            );
            expect(offset).toBeGreaterThan(
              Math.asin(Math.min(1, well.radius / distance(well))),
            );
          }
        }
      }
      expect(rings).toBeGreaterThan(0);
    },
  );
  it("retains event IDs and evidence while mapping collapsed members and never invents dependency traffic", () => {
    const scene = projectObservatory(mixedObservatoryFixture()),
      result = new OperationalLayout().project(scene, options);
    const resourceId = scene.membershipIndex.resourceIds[0]!;
    const event = {
      id: "actual-event",
      resourceId,
      summary: "Recorded observation",
      occurredAt: scene.evaluatedAt,
      sourceLabel: "Recorded source",
      evidenceHref: "/api/v1/source-envelopes/observed",
    };
    const mapped = mapOperationalEvents(
      {
        events: [
          event,
          { ...event, id: "denied", resourceId: "not-authorized" },
        ],
      },
      result,
    );
    expect(mapped).toEqual([
      {
        ...event,
        resourceId: result.visibleSubjectForResource.get(resourceId),
        canonicalResourceId: resourceId,
      },
    ]);
    expect(mapOperationalEvents({ events: [] }, result)).toEqual([]);
  });
  it("keeps confirmed impact and provider exposure separate in actual renderer attention", () => {
    const scene = projectObservatory(operationalObservatoryFixture());
    const projection = new OperationalLayout().project(scene, options);
    const source = new OperationalRecordedActivity();
    source.setProjection(projection);
    for (const [id, node] of projection.byId)
      expect(source.attention(id)).toBe(
        operationalAttention(node.summary) === "impact"
          ? 1
          : operationalAttention(node.summary) === "exposure"
            ? 0.5
            : 0,
      );
    source.synchronize({ events: [] }, true);
    expect(source.snapshot().transfers).toEqual([]);
    expect(source.snapshot().events).toEqual([]);
  });
  it("accepts empty scenes and rejects an incomplete/foreign visible population", () => {
    const scene = projectObservatory(scaleObservatoryFixture(0));
    expect(new OperationalLayout().project(scene, options).wells).toEqual([]);
    const full = projectObservatory(mixedObservatoryFixture());
    expect(() =>
      new OperationalLayout().project(
        { ...full, visibleRepresentationIds: [] },
        options,
      ),
    ).toThrow(/incomplete/);
    expect(() =>
      new OperationalLayout().project(
        { ...full, visibleRepresentationIds: ["foreign"] },
        options,
      ),
    ).toThrow(/Unknown visible/);
    expect(() =>
      new OperationalLayout().project(
        { ...full, completeness: "partial" as "complete" },
        options,
      ),
    ).toThrow(/incomplete/);
  });
});

describe("operational component interactions with the real semantic scene", () => {
  // A zero reveal budget starts aggregated, exercising collapsed -> expanded refits.
  function setup(revealBudget?: number) {
    const input = {
        ...mixedObservatoryFixture(),
        ...(revealBudget === undefined ? {} : { revealBudget }),
      },
      scene = projectObservatory(input);
    const host = scene.representations.find(
      (node) =>
        node.kind === "host" &&
        scene.visibleRepresentationIds.includes(node.id),
    )!;
    const snapshot: InfrastructureOverview = {
      readAt: scene.readCompletedAt,
      total: 91,
      nextCursor: null,
      items: [],
      edges: [],
      events: [],
    };
    const props = {
      scene,
      snapshot,
      selectedId: null as string | null,
      onSelect: vi.fn(),
      onProject: vi.fn(),
      onQueryChange: vi.fn(),
      onCameraFocus: vi.fn(),
    };
    return { input, scene, host, props };
  }
  it("collapses every group from the stage, remembers the choice and expands again", async () => {
    const { input, props } = setup();
    const view = render(createElement(OperationalObservatory, props));
    await waitFor(() => expect(engine.update).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));
    const collapsed = props.onQueryChange.mock.lastCall![0] as ObservatoryQuery;
    expect(collapsed).toMatchObject({
      reveal: "groups",
      expandedRepresentationIds: [],
    });
    const roots = projectObservatory({ ...input, ...collapsed });
    expect(roots.visibleRepresentationIds).toEqual(
      [...roots.rootRepresentationIds].sort(),
    );
    await waitFor(() =>
      expect(
        JSON.parse(localStorage.getItem(observatoryStorageKey)!).reveal,
      ).toBe("groups"),
    );
    view.unmount();
    props.onQueryChange.mockClear();
    render(createElement(OperationalObservatory, props));
    await waitFor(() => expect(props.onQueryChange).toHaveBeenCalledTimes(1));
    expect(props.onQueryChange.mock.lastCall![0]).toMatchObject({
      reveal: "groups",
    });
    fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
    expect(props.onQueryChange.mock.lastCall![0]).toMatchObject({
      reveal: "members",
    });
  });
  it("persists implicit custom grouping from the actual add-resource action and restores it on remount", async () => {
    const { input, scene, host, props } = setup();
    localStorage.setItem(
      observatoryStorageKey,
      JSON.stringify({
        ...defaultObservatoryPreferences(),
        grouping: "projects",
      }),
    );
    const view = render(createElement(OperationalObservatory, props));
    await waitFor(() => expect(props.onQueryChange).toHaveBeenCalledTimes(1));
    const projects = props.onQueryChange.mock.lastCall![0] as ObservatoryQuery;
    expect(projects.grouping).toBe("projects");
    view.rerender(
      createElement(OperationalObservatory, {
        ...props,
        scene: projectObservatory({ ...input, ...projects }),
      }),
    );
    expect(screen.getByLabelText("Observatory grouping")).toHaveValue(
      "projects",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Appearance and views" }),
    );
    fireEvent.change(screen.getByLabelText("Sector name"), {
      target: { value: "Implicit sector" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Resource" }), {
      target: { value: host.resourceId },
    });
    fireEvent.change(
      screen.getByRole("combobox", { name: "Group this sector by" }),
      { target: { value: "hosts" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Add resource to sector" }),
    );
    expect(props.onQueryChange).toHaveBeenCalledTimes(2);
    const custom = props.onQueryChange.mock.lastCall![0] as ObservatoryQuery;
    expect(custom).toMatchObject({
      grouping: "custom",
      sectors: [
        {
          id: "local-sector:Implicit%20sector",
          label: "Implicit sector",
          grouping: "hosts",
          resourceIds: [host.resourceId],
        },
      ],
    });
    const response = projectObservatory({ ...input, ...custom });
    expect(response.membershipIndex.resourceIds).toEqual(
      scene.membershipIndex.resourceIds,
    );
    view.rerender(
      createElement(OperationalObservatory, { ...props, scene: response }),
    );
    expect(
      screen.getByRole("region", { name: "Operational Observatory" }),
    ).toHaveAttribute("data-grouping", "custom");
    expect(
      screen.getByRole("region", { name: "Operational Observatory" }),
    ).toHaveAttribute("data-pending", "false");
    await waitFor(() =>
      expect(
        JSON.parse(localStorage.getItem(observatoryStorageKey)!),
      ).toMatchObject({
        grouping: "custom",
        sectors: custom.sectors,
      }),
    );
    view.unmount();
    props.onQueryChange.mockClear();
    const remount = render(createElement(OperationalObservatory, props));
    await waitFor(() => expect(props.onQueryChange).toHaveBeenCalledTimes(1));
    const restored = props.onQueryChange.mock.lastCall![0] as ObservatoryQuery;
    expect(restored).toMatchObject({
      grouping: "custom",
      sectors: custom.sectors,
    });
    remount.rerender(
      createElement(OperationalObservatory, {
        ...props,
        scene: projectObservatory({ ...input, ...restored }),
      }),
    );
    expect(screen.getByLabelText("Observatory grouping")).toHaveValue("custom");
    expect(
      screen.getByRole("region", { name: "Operational Observatory" }),
    ).toHaveAttribute("data-pending", "false");
    await waitFor(() =>
      expect(engine.update.mock.lastCall![1].cameraMode).toBe("composed"),
    );
  });
  it.each([
    {
      name: "unsupported operational grouping in the legacy key",
      raw: null,
      legacy: '{"version":1,"grouping":"operational"}',
    },
    {
      name: "version one data in the version two key with valid legacy data",
      raw: '{"version":1,"grouping":"operational"}',
      legacy: '{"version":1,"grouping":"custom"}',
    },
    {
      name: "version two data in the legacy key",
      raw: null,
      legacy: '{"version":2,"grouping":"operational"}',
    },
  ])(
    "preserves incoming Projects without a restoring query for $name",
    async ({ raw, legacy }) => {
      const { input, props } = setup();
      if (raw !== null) localStorage.setItem(observatoryStorageKey, raw);
      localStorage.setItem(legacyObservatoryStorageKey, legacy);
      render(
        createElement(OperationalObservatory, {
          ...props,
          scene: projectObservatory({ ...input, grouping: "projects" }),
        }),
      );
      await waitFor(() => expect(engine.created).toHaveBeenCalledTimes(1));
      expect(screen.getByLabelText("Observatory grouping")).toHaveValue(
        "projects",
      );
      expect(props.onQueryChange).not.toHaveBeenCalled();
      expect(engine.update.mock.lastCall![1].cameraMode).toBe("composed");
    },
  );
  it.each(["hosts", "projects", "custom"] as const)(
    "restores the supported legacy %s grouping into the active query",
    async (grouping) => {
      const { props } = setup();
      localStorage.setItem(
        legacyObservatoryStorageKey,
        JSON.stringify({ version: 1, grouping }),
      );
      render(createElement(OperationalObservatory, props));
      await waitFor(() => expect(props.onQueryChange).toHaveBeenCalledTimes(1));
      expect(props.onQueryChange.mock.lastCall![0].grouping).toBe(grouping);
      expect(screen.getByLabelText("Observatory grouping")).toHaveValue(
        grouping,
      );
    },
  );
  it("treats a supported operational grouping in the version two key as an explicit saved choice", async () => {
    const { input, props } = setup();
    localStorage.setItem(
      observatoryStorageKey,
      JSON.stringify(defaultObservatoryPreferences()),
    );
    render(
      createElement(OperationalObservatory, {
        ...props,
        scene: projectObservatory({ ...input, grouping: "projects" }),
      }),
    );
    await waitFor(() => expect(props.onQueryChange).toHaveBeenCalledTimes(1));
    expect(props.onQueryChange.mock.lastCall![0].grouping).toBe("operational");
    expect(screen.getByLabelText("Observatory grouping")).toHaveValue(
      "operational",
    );
  });
  it("restores saved custom grouping into one authorized query without losing filters or replaying on refresh", async () => {
    const { input, scene, props } = setup();
    const resourceId = scene.membershipIndex.resourceIds[0]!;
    const sectors = [
      {
        id: "shared",
        label: "Authorized sector",
        grouping: "hosts" as const,
        resourceIds: [resourceId, "hidden-resource", resourceId],
      },
      {
        id: "private",
        label: "Private sector name",
        grouping: "providers" as const,
        resourceIds: ["hidden-resource"],
      },
    ];
    localStorage.setItem(
      observatoryStorageKey,
      JSON.stringify({
        ...defaultObservatoryPreferences(),
        grouping: "custom",
        sectors,
        camera: "orbit",
      }),
    );
    const view = render(
      createElement(OperationalObservatory, {
        ...props,
        initialQuery: {
          grouping: "operational",
          environment: "production",
          search: "retained filter",
          sectors: [],
          expandedRepresentationIds: [],
          reveal: "members",
          viewRevision: scene.viewRevision,
        },
      }),
    );
    await waitFor(() => expect(props.onQueryChange).toHaveBeenCalledTimes(1));
    const restored = props.onQueryChange.mock.lastCall![0] as ObservatoryQuery;
    expect(restored).toMatchObject({
      grouping: "custom",
      environment: "production",
      search: "retained filter",
      sectors: [
        {
          id: "shared",
          label: "Authorized sector",
          grouping: "hosts",
          resourceIds: [resourceId],
        },
      ],
    });
    expect(restored.viewRevision).toMatch(/^local:/);
    expect(JSON.stringify(restored)).not.toContain("hidden-resource");
    expect(JSON.stringify(restored)).not.toContain("Private sector name");
    expect(screen.getByLabelText("Observatory grouping")).toHaveValue("custom");
    const response = projectObservatory({ ...input, ...restored });
    expect(response.membershipIndex.resourceIds).toEqual(
      scene.membershipIndex.resourceIds,
    );
    view.rerender(
      createElement(OperationalObservatory, { ...props, scene: response }),
    );
    await waitFor(() => expect(engine.created).toHaveBeenCalledTimes(1));
    expect(
      screen.getByRole("region", { name: "Operational Observatory" }),
    ).toHaveAttribute("data-pending", "false");
    expect(engine.update.mock.lastCall![1].cameraMode).toBe("composed");
    expect(props.onQueryChange).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText("Observatory grouping"), {
      target: { value: "projects" },
    });
    const chosen = props.onQueryChange.mock.lastCall![0] as ObservatoryQuery;
    view.rerender(
      createElement(OperationalObservatory, {
        ...props,
        scene: projectObservatory({ ...input, ...chosen }),
      }),
    );
    await act(async () => {});
    expect(screen.getByLabelText("Observatory grouping")).toHaveValue(
      "projects",
    );
    expect(props.onQueryChange).toHaveBeenCalledTimes(2);
    expect(
      JSON.parse(localStorage.getItem(observatoryStorageKey)!),
    ).toMatchObject({
      grouping: "projects",
      sectors: restored.sectors,
    });
  });
  it("restores projects grouping on each navigation remount while keeping the camera still", async () => {
    const { props } = setup();
    localStorage.setItem(
      observatoryStorageKey,
      JSON.stringify({
        ...defaultObservatoryPreferences(),
        grouping: "projects",
        camera: "tour",
      }),
    );
    const first = render(createElement(OperationalObservatory, props));
    await waitFor(() => expect(props.onQueryChange).toHaveBeenCalledTimes(1));
    expect(props.onQueryChange.mock.lastCall![0].grouping).toBe("projects");
    await waitFor(() => expect(engine.created).toHaveBeenCalledTimes(1));
    expect(engine.update.mock.lastCall![1].cameraMode).toBe("composed");
    first.unmount();
    render(createElement(OperationalObservatory, { ...props, compact: true }));
    await waitFor(() => expect(props.onQueryChange).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText("Observatory grouping")).toHaveValue(
      "projects",
    );
    expect(props.onQueryChange.mock.lastCall![0].grouping).toBe("projects");
    await waitFor(() => expect(engine.created).toHaveBeenCalledTimes(2));
    expect(engine.update.mock.lastCall![1].cameraMode).toBe("composed");
  });
  it("reauthorizes saved sectors once when navigation narrows the resource scope", async () => {
    const { input, props } = setup();
    const retained = input.resources[0]!,
      removed = input.resources[1]!;
    localStorage.setItem(
      observatoryStorageKey,
      JSON.stringify({
        ...defaultObservatoryPreferences(),
        grouping: "custom",
        sectors: [
          {
            id: "shared",
            label: "Retained sector",
            grouping: "hosts",
            resourceIds: [retained.id, removed.id],
          },
          {
            id: "private",
            label: "Removed private sector",
            grouping: "hosts",
            resourceIds: [removed.id],
          },
        ],
      }),
    );
    const view = render(createElement(OperationalObservatory, props));
    await waitFor(() => expect(props.onQueryChange).toHaveBeenCalledTimes(1));
    const restricted = projectObservatory({
      ...observatoryFixtureInput([retained]),
      scopeDigest: "fixture:restricted",
    });
    view.rerender(
      createElement(OperationalObservatory, { ...props, scene: restricted }),
    );
    await waitFor(() => expect(props.onQueryChange).toHaveBeenCalledTimes(2));
    expect(props.onQueryChange.mock.lastCall![0]).toMatchObject({
      grouping: "custom",
      sectors: [
        {
          id: "shared",
          label: "Retained sector",
          grouping: "hosts",
          resourceIds: [retained.id],
        },
      ],
    });
    await act(async () => {});
    expect(props.onQueryChange).toHaveBeenCalledTimes(2);
    const stored = localStorage.getItem(observatoryStorageKey)!;
    expect(stored).not.toContain(removed.id);
    expect(stored).not.toContain("Removed private sector");
  });
  it.each([null, "broken", '{"version":8}'])(
    "keeps a useful default query and explicit choices with absent or invalid storage: %s",
    async (stored) => {
      const { props } = setup();
      if (stored !== null) localStorage.setItem(observatoryStorageKey, stored);
      render(createElement(OperationalObservatory, props));
      await waitFor(() => expect(engine.created).toHaveBeenCalledTimes(1));
      expect(screen.getByLabelText("Observatory grouping")).toHaveValue(
        "operational",
      );
      expect(props.onQueryChange).not.toHaveBeenCalled();
      fireEvent.change(screen.getByLabelText("Observatory grouping"), {
        target: { value: "hosts" },
      });
      expect(props.onQueryChange).toHaveBeenCalledTimes(1);
      expect(props.onQueryChange.mock.lastCall![0].grouping).toBe("hosts");
    },
  );
  it("keeps explicit grouping chosen before saved preferences finish loading", async () => {
    const { props } = setup();
    localStorage.setItem(
      observatoryStorageKey,
      JSON.stringify({
        ...defaultObservatoryPreferences(),
        grouping: "custom",
      }),
    );
    render(createElement(OperationalObservatory, props));
    fireEvent.change(screen.getByLabelText("Observatory grouping"), {
      target: { value: "projects" },
    });
    await waitFor(() => expect(engine.created).toHaveBeenCalledTimes(1));
    expect(props.onQueryChange).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Observatory grouping")).toHaveValue(
      "projects",
    );
    expect(
      JSON.parse(localStorage.getItem(observatoryStorageKey)!),
    ).toMatchObject({
      grouping: "projects",
    });
  });
  it("keeps grouping usable when device storage cannot be read", async () => {
    const { props } = setup();
    const read = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("Device storage unavailable");
      });
    try {
      render(createElement(OperationalObservatory, props));
      await waitFor(() => expect(engine.created).toHaveBeenCalledTimes(1));
      fireEvent.change(screen.getByLabelText("Observatory grouping"), {
        target: { value: "providers" },
      });
      expect(props.onQueryChange).toHaveBeenCalledTimes(1);
      expect(props.onQueryChange.mock.lastCall![0].grouping).toBe("providers");
    } finally {
      read.mockRestore();
    }
  });
  function canonicalWorkPage(
    projectId: string,
    cursor: FoundationProjectWorkCursor | null,
  ): FoundationProjectWorkPage {
    const firstId = "00000000-0000-4000-8000-000000009000";
    const id =
      cursor === null ? firstId : "00000000-0000-4000-8000-000000009001";
    return {
      schemaVersion: 1,
      requestedProjectId: projectId,
      consistency: "live",
      selectedAt: "2026-10-16T12:00:00Z",
      items: [
        {
          work: {
            id,
            projectId,
            sourceCaptureId: "00000000-0000-4000-8000-000000009002",
            generatedFromWorkItemId: null,
            title:
              "Canonical integration Work " +
              (cursor === null ? "first" : "last"),
            description: "Canonical assignment is not execution",
            workType: cursor === null ? "task" : "initiative",
            assigneeKind: "agent",
            assigneeAgentId: "00000000-0000-4000-8000-000000009003",
            assigneeLabel: "Assigned agent",
            status: cursor === null ? "open" : "done",
            priority: null,
            dueOn: null,
            contextLink: null,
            createdAt: "2026-10-01T12:00:00Z",
            updatedAt: "2026-10-15T12:00:00Z",
          },
          contentDigest: "a".repeat(64),
        },
      ],
      nextCursor: cursor === null ? { projectId, afterId: firstId } : null,
    };
  }
  it("retargets operational evidence and review controls without retaining prior panels", async () => {
    const { input, scene, props } = setup();
    const snapshot: InfrastructureOverview = {
      ...props.snapshot,
      items: input.resources.map((resource) => ({
        ...resource,
        health: "unknown" as const,
        projects: resource.projects.map((project) => ({ ...project })),
        sources: resource.sources.map((source) => ({
          ...source,
          name: "Synthetic source",
          kind: "linux-host",
        })),
        metrics: resource.metrics.map((metric) => ({ ...metric })),
      })),
    };
    const clientProps = {
      ...props,
      snapshot,
      workProjectIds: input.projects.map((project) => project.id),
      evidenceClient: async (resourceId: string, facet: string) => ({
        schemaVersion: 1,
        scopeDigest: scene.scopeDigest,
        projectionRevision: scene.projectionRevision,
        completeness: "complete",
        resourceId,
        facet,
        access: "unsupported",
        items: [],
      }),
      reviewClient: {
        loadCatalogue: vi.fn(async () => ({})),
        review: vi.fn(async () => ({})),
      },
      onReviewed: vi.fn(),
    };
    const view = render(createElement(OperationalObservatory, clientProps));
    const hosts = input.resources.filter(
      (resource) => resource.kind === "host",
    );
    for (const resource of [hosts[0]!, hosts[1]!, hosts[2]!, hosts[0]!]) {
      view.rerender(
        createElement(OperationalObservatory, {
          ...clientProps,
          selectedId: resource.id,
        }),
      );
      await waitFor(() => {
        expect(
          screen.getAllByRole("complementary", {
            name: "Observatory inspector",
          }),
        ).toHaveLength(1);
        expect(
          screen.getAllByRole("heading", { name: /^Operational evidence$/ }),
        ).toHaveLength(1);
        expect(
          screen.getAllByRole("region", { name: "Operational source details" }),
        ).toHaveLength(1);
      });
      expect(
        screen.getByRole("complementary", { name: "Observatory inspector" }),
      ).toHaveTextContent(resource.id);
    }
    fireEvent.click(
      within(
        screen.getByRole("navigation", { name: "Observatory breadcrumbs" }),
      ).getByRole("button", { name: /^Overview$/ }),
    );
    await waitFor(() => {
      expect(
        screen.queryAllByRole("heading", { name: /^Operational evidence$/ }),
      ).toHaveLength(0);
      expect(
        screen.queryAllByRole("region", { name: "Operational source details" }),
      ).toHaveLength(0);
    });
  });
  it("shows an approved repository logo on its stage badge and falls back to the resolved icon", async () => {
    const { input, scene: plain, props } = setup();
    const labelled = plain.representations.filter(
      (node) =>
        node.kind === "repository" &&
        !node.referenceTo &&
        plain.visibleRepresentationIds.includes(node.id),
    );
    expect(labelled.length).toBeGreaterThan(1);
    const [approved, other] = labelled as [
      (typeof labelled)[number],
      (typeof labelled)[number],
    ];
    const digest = "d".repeat(64);
    const scene = projectObservatory({
      ...input,
      logos: [
        {
          resourceId: approved.resourceId!,
          digest,
          mediaType: "image/png",
          width: 128,
          height: 128,
          version: 1,
        },
      ],
    });
    const logoUrl = vi.fn(
      (resourceId: string, value: string) => `/logos/${resourceId}/${value}`,
    );
    const badge = (node: { label: string }) =>
      screen
        .getAllByRole("button", {
          name: new RegExp(`^Inspect ${node.label},`),
        })[0]!
        .querySelector(".cmd-op-kind")!;
    const view = render(
      createElement(OperationalObservatory, { ...props, scene, logoUrl }),
    );
    await waitFor(() =>
      expect(badge(approved).querySelector("img")).not.toBeNull(),
    );
    const image = badge(approved).querySelector("img")!;
    expect(image.getAttribute("src")).toBe(
      `/logos/${approved.resourceId}/${digest}`,
    );
    expect(image.getAttribute("alt")).toBe("");
    expect(badge(approved).getAttribute("data-logo")).toBe("true");
    expect(badge(other).querySelector("img")).toBeNull();
    expect(badge(other).querySelector("svg")).not.toBeNull();
    expect(badge(other).getAttribute("data-icon")).toBe("github");
    // A broken image restores the icon glyph instead of an empty badge.
    fireEvent.error(image);
    await waitFor(() =>
      expect(badge(approved).querySelector("img")).toBeNull(),
    );
    expect(badge(approved).querySelector("svg")).not.toBeNull();
    // Without a host-supplied address no image is requested at all.
    view.rerender(createElement(OperationalObservatory, { ...props, scene }));
    expect(document.querySelectorAll(".cmd-op-kind img")).toHaveLength(0);
  });

  it("lets an explicit device icon choice take precedence over an approved logo", async () => {
    const { input, scene: plain, props } = setup();
    const approved = plain.representations.find(
      (node) =>
        node.kind === "repository" &&
        !node.referenceTo &&
        plain.visibleRepresentationIds.includes(node.id),
    )!;
    const scene = projectObservatory({
      ...input,
      logos: [
        {
          resourceId: approved.resourceId!,
          digest: "d".repeat(64),
          mediaType: "image/png",
          width: 128,
          height: 128,
          version: 1,
        },
      ],
    });
    const badge = () =>
      screen
        .getAllByRole("button", {
          name: new RegExp(`^Inspect ${approved.label},`),
        })[0]!
        .querySelector(".cmd-op-kind")!;
    render(
      createElement(OperationalObservatory, {
        ...props,
        scene,
        selectedId: approved.resourceId,
        logoUrl: (resourceId: string, digest: string) =>
          `/logos/${resourceId}/${digest}`,
      }),
    );
    await waitFor(() => expect(badge().querySelector("img")).not.toBeNull());
    const choice = screen.getByLabelText("Icon on this device");
    expect(
      within(choice).getByRole("option", {
        name: "Automatic: Approved repository logo",
      }),
    ).toBeInTheDocument();
    fireEvent.change(choice, { target: { value: "docker" } });
    await waitFor(() => expect(badge().querySelector("img")).toBeNull());
    expect(badge().getAttribute("data-icon")).toBe("docker");
    fireEvent.change(choice, { target: { value: "" } });
    await waitFor(() => expect(badge().querySelector("img")).not.toBeNull());
  });

  it("offers logo review only for a selected canonical repository", async () => {
    const { input, scene, props } = setup();
    const repository = input.resources.find(
      (resource) => resource.kind === "repository",
    )!;
    const host = input.resources.find((resource) => resource.kind === "host")!;
    const logoReviewClient = {
      loadLogo: vi.fn(async () => ({
        schemaVersion: 1,
        scopeDigest: scene.scopeDigest,
        projectionRevision: scene.projectionRevision,
        completeness: "complete",
        kind: "logo",
        items: [],
      })),
      preview: vi.fn(),
      review: vi.fn(),
    };
    const clientProps = {
      ...props,
      logoReviewClient,
      onReviewed: vi.fn(),
      selectedId: repository.id,
    };
    const view = render(createElement(OperationalObservatory, clientProps));
    await waitFor(() =>
      expect(screen.getByText("Repository logo")).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.getByText(/No logo is approved/)).toBeInTheDocument(),
    );
    expect(logoReviewClient.loadLogo).toHaveBeenCalledWith(repository.id);
    view.rerender(
      createElement(OperationalObservatory, {
        ...clientProps,
        selectedId: host.id,
      }),
    );
    await waitFor(() =>
      expect(screen.queryByText("Repository logo")).toBeNull(),
    );
    expect(logoReviewClient.preview).not.toHaveBeenCalled();
  });

  it("keeps canonical Work explicitly unavailable without a client in a collapsed panel below recorded observations", async () => {
    const { props } = setup();
    render(createElement(OperationalObservatory, props));
    const panel = screen
      .getByText("Canonical project Work")
      .closest("details")!;
    expect(panel).not.toHaveAttribute("open");
    expect(panel.previousElementSibling).toHaveAttribute(
      "aria-label",
      "Recorded active work",
    );
    expect(
      within(panel).getByText("Canonical Work unavailable in this view."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Missing runtime coverage is not an idle-agent signal/),
    ).toBeInTheDocument();
    expect(within(panel).queryByText("0 Work items")).not.toBeInTheDocument();
  });
  it("withholds Work reads and totals until a complete canonical project catalogue is supplied", async () => {
    const { props } = setup();
    const workClient = vi.fn(
      async (projectId: string, cursor: FoundationProjectWorkCursor | null) =>
        canonicalWorkPage(projectId, cursor),
    );
    const view = render(
      createElement(OperationalObservatory, { ...props, workClient }),
    );
    expect(
      screen.getByText("Canonical Work unavailable in this view."),
    ).toBeInTheDocument();
    expect(workClient).not.toHaveBeenCalled();
    view.rerender(
      createElement(OperationalObservatory, {
        ...props,
        workClient,
        workProjectIds: [],
      }),
    );
    expect(
      await screen.findByText(
        "No authorized project context. Work totals unavailable.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("0 Work items")).not.toBeInTheDocument();
    expect(workClient).not.toHaveBeenCalled();
  });
  it("mounts the actual complete Work dock for every authorized canonical project despite absent resource representations and an empty snapshot page", async () => {
    const { props, scene } = setup();
    expect(props.snapshot.items).toHaveLength(0);
    const workProjectIds = [
      "00000000-0000-4000-8000-000000008001",
      "00000000-0000-4000-8000-000000008002",
    ];
    const target = workProjectIds[0]!;
    expect(
      scene.representations.some(
        (node) => node.resourceId === workProjectIds[1],
      ),
    ).toBe(false);
    const workClient = vi.fn(
      async (
        projectId: string,
        cursor: FoundationProjectWorkCursor | null,
      ): Promise<FoundationProjectWorkPage> =>
        projectId === target
          ? canonicalWorkPage(projectId, cursor)
          : {
              schemaVersion: 1,
              requestedProjectId: projectId,
              consistency: "live",
              selectedAt: "2026-10-16T12:00:00Z",
              items: [],
              nextCursor: null,
            },
    );
    render(
      createElement(OperationalObservatory, {
        ...props,
        workClient,
        workProjectIds,
      }),
    );
    expect(await screen.findByText("2 Work items")).toBeInTheDocument();
    expect(
      screen.getByText("Canonical integration Work first"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Canonical integration Work last"),
    ).toBeInTheDocument();
    expect(
      [
        ...new Set(workClient.mock.calls.map(([projectId]) => projectId)),
      ].sort(),
    ).toEqual([...workProjectIds].sort());
    expect(
      workClient.mock.calls.filter(([projectId]) => projectId === target),
    ).toHaveLength(2);
    const panel = screen
      .getByText("Canonical project Work")
      .closest("details")!;
    expect(panel).not.toHaveAttribute("open");
    expect(within(panel).getByText("Project Work").tagName).toBe("H2");
    expect(
      within(panel).getByText(
        "Actual runtime unavailable. Assignment is not an active run.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/No qualifying active work observation/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^(running|queued)$/i)).not.toBeInTheDocument();
  });
  it("forwards selected canonical project context and pause through the actual dock without reading other projects", async () => {
    const { props } = setup();
    const workProjectIds = [
      "00000000-0000-4000-8000-000000008001",
      "00000000-0000-4000-8000-000000008002",
    ];
    const target = workProjectIds[1]!;
    const workClient = vi.fn(
      async (projectId: string, cursor: FoundationProjectWorkCursor | null) =>
        canonicalWorkPage(projectId, cursor),
    );
    const view = render(
      createElement(OperationalObservatory, {
        ...props,
        workClient,
        workProjectIds,
        scopeProjectId: target,
        paused: true,
        compact: true,
      }),
    );
    expect(
      await screen.findByText("Work loading paused. Totals unavailable."),
    ).toBeInTheDocument();
    expect(workClient).not.toHaveBeenCalled();
    view.rerender(
      createElement(OperationalObservatory, {
        ...props,
        workClient,
        workProjectIds,
        scopeProjectId: target,
        paused: false,
        compact: true,
      }),
    );
    expect(await screen.findByText("2 Work items")).toBeInTheDocument();
    expect(workClient).toHaveBeenCalledTimes(2);
    expect(
      workClient.mock.calls.every(([projectId]) => projectId === target),
    ).toBe(true);
    view.rerender(
      createElement(OperationalObservatory, {
        ...props,
        workClient,
        workProjectIds,
        scopeProjectId: target,
        paused: true,
        compact: true,
      }),
    );
    expect(screen.queryByText("2 Work items")).not.toBeInTheDocument();
    expect(
      screen.getByText("Work loading paused. Totals unavailable."),
    ).toBeInTheDocument();
  });
  it("retains the authoritative environment after a scope remount and expansion", async () => {
    const { props } = setup();
    const fixture = operationalObservatoryFixture();
    const initial = projectObservatory(fixture);
    const production = projectObservatory({
      ...fixture,
      environment: "production",
      scopeDigest: "fixture:production-environment",
    });
    const query = {
      grouping: production.grouping,
      environment: "production",
      expandedRepresentationIds: [],
      reveal: "members" as const,
      search: "",
      sectors: [],
      viewRevision: production.viewRevision,
    };
    const view = render(
      createElement(OperationalObservatory, { ...props, scene: initial }),
    );
    await waitFor(() => expect(engine.update).toHaveBeenCalled());
    view.rerender(
      createElement(OperationalObservatory, {
        ...props,
        scene: production,
        initialQuery: query,
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("combobox", { name: /^Environment$/ }),
      ).toHaveValue("production"),
    );
    fireEvent.click(screen.getAllByRole("button", { name: /^Expand / })[0]!);
    expect(props.onQueryChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ environment: "production" }),
    );
  });
  it("shows and clears a retained environment even when no signal supplies its option", async () => {
    const { scene, props } = setup();
    expect(scene.signals.every((signal) => signal.environment === null)).toBe(
      true,
    );
    render(
      createElement(OperationalObservatory, {
        ...props,
        initialQuery: {
          grouping: scene.grouping,
          environment: "production",
          expandedRepresentationIds: [],
          reveal: "members",
          search: "",
          sectors: [],
          viewRevision: scene.viewRevision,
        },
      }),
    );
    const environment = screen.getByRole("combobox", { name: /^Environment$/ });
    expect(environment).toHaveValue("production");
    fireEvent.change(environment, { target: { value: "" } });
    expect(props.onQueryChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ environment: null }),
    );
  });
  it("shows a recorded containment cycle even when its parent label is authorized", async () => {
    const { input, host, props } = setup();
    const other = input.resources.find(
      (resource) => resource.kind === "host" && resource.id !== host.resourceId,
    )!;
    const scene = projectObservatory({
      ...input,
      resources: input.resources.map((resource) => ({
        ...resource,
        parentResourceId:
          resource.id === host.resourceId
            ? other.id
            : resource.id === other.id
              ? host.resourceId!
              : resource.parentResourceId,
      })),
    });
    render(
      createElement(OperationalObservatory, {
        ...props,
        scene,
        selectedId: host.resourceId,
      }),
    );
    expect(
      await screen.findByText("Containment cycle recorded"),
    ).toBeInTheDocument();
  });
  it("chooses a resource icon on this device and shows it on the resource's badges", async () => {
    const { host, props } = setup();
    render(createElement(OperationalObservatory, props));
    await waitFor(() => expect(engine.update).toHaveBeenCalled());
    fireEvent.click(
      screen.getByRole("button", {
        name: `Inspect ${host.label}, Host, ${host.memberCount} unique resources`,
      }),
    );
    const picker = within(
      screen.getByRole("complementary", { name: "Observatory inspector" }),
    ).getByLabelText("Icon on this device");
    expect(picker).toHaveValue("");
    const badge = () =>
      document
        .querySelector(
          `.cmd-op-outline li[data-representation-id="${host.id}"] .cmd-op-kind`,
        )
        ?.getAttribute("data-icon");
    expect(badge()).toBe(
      defaultResourceIconId({ kind: "host", label: host.label }),
    );
    fireEvent.change(picker, { target: { value: "proxmox" } });
    expect(badge()).toBe("proxmox");
    await waitFor(() =>
      expect(
        JSON.parse(localStorage.getItem(observatoryStorageKey)!).icons,
      ).toEqual({ [host.resourceId!]: "proxmox" }),
    );
    fireEvent.change(picker, { target: { value: "" } });
    expect(badge()).toBe(
      defaultResourceIconId({ kind: "host", label: host.label }),
    );
  });
  it("inspects a group in one activation and does not refocus on unchanged data refresh", async () => {
    const { input, scene, host, props } = setup(0);
    const view = render(createElement(OperationalObservatory, props));
    await waitFor(() => expect(engine.update).toHaveBeenCalled());
    fireEvent.click(
      screen.getByRole("button", {
        name: `Inspect ${host.label}, Host, ${host.memberCount} unique resources`,
      }),
    );
    expect(
      within(
        screen.getByRole("complementary", { name: "Observatory inspector" }),
      ).getByRole("heading", { name: host.label }),
    ).toBeTruthy();
    expect(props.onSelect).toHaveBeenLastCalledWith(host.resourceId);
    expect(props.onQueryChange).toHaveBeenCalledWith(
      expect.objectContaining({
        expandedRepresentationIds: expect.arrayContaining([host.id]),
      }),
    );
    const calls = props.onCameraFocus.mock.calls.length;
    view.rerender(
      createElement(OperationalObservatory, {
        ...props,
        scene: {
          ...scene,
          evaluatedAt: "2026-10-16T12:00:18.000Z",
          representations: [...scene.representations],
        },
      }),
    );
    await act(async () => {});
    expect(props.onCameraFocus).toHaveBeenCalledTimes(calls);
    expect(engine.update.mock.lastCall?.[1].focus).toBe(false);
    expect(engine.update.mock.lastCall?.[1].ambient).toBe(false);
    const expanded = projectObservatory({
      ...input,
      ...props.onQueryChange.mock.lastCall![0],
    });
    view.rerender(
      createElement(OperationalObservatory, { ...props, scene: expanded }),
    );
    await waitFor(() =>
      expect(props.onCameraFocus.mock.lastCall?.[2]).toMatchObject({
        refit: true,
        restore: false,
      }),
    );
  });
  it("restores pre-search canonical selection and query when search clears", async () => {
    const { input, scene, host, props } = setup();
    const view = render(
      createElement(OperationalObservatory, {
        ...props,
        selectedId: host.resourceId,
      }),
    );
    await waitFor(() => expect(engine.update).toHaveBeenCalled());
    const search = screen.getByRole("searchbox", {
      name: "Search complete Observatory inventory",
    });
    fireEvent.change(search, { target: { value: "Synthetic repository 1" } });
    const request = props.onQueryChange.mock.lastCall![0];
    const searched = projectObservatory({ ...input, ...request });
    view.rerender(
      createElement(OperationalObservatory, {
        ...props,
        selectedId: host.resourceId,
        scene: searched,
      }),
    );
    const result = searched.searchResults[0]!;
    const node = searched.representations.find(
      (item) => item.id === result.representationId,
    )!;
    fireEvent.click(
      screen.getByRole("button", {
        name: `Inspect ${node.label}, Repository, ${node.memberCount} unique resources`,
      }),
    );
    expect(props.onSelect).toHaveBeenLastCalledWith(result.resourceId);
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(props.onSelect).toHaveBeenLastCalledWith(host.resourceId);
    expect(props.onQueryChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: "", grouping: scene.grouping }),
    );
    expect(
      within(
        screen.getByRole("complementary", { name: "Observatory inspector" }),
      ).getByRole("heading", { name: host.label }),
    ).toBeTruthy();
  });
  it("dismisses Appearance before unwinding focus and clears removed-scope names", async () => {
    const { props, host } = setup();
    const view = render(createElement(OperationalObservatory, props));
    await waitFor(() => expect(engine.update).toHaveBeenCalled());
    fireEvent.click(
      screen.getByRole("button", {
        name: `Inspect ${host.label}, Host, ${host.memberCount} unique resources`,
      }),
    );
    const trigger = screen.getByRole("button", {
      name: "Appearance and views",
    });
    fireEvent.click(trigger);
    const form = screen.getByRole("dialog", {
      name: "Observatory appearance and local views",
    });
    expect(form).not.toHaveAttribute("aria-modal");
    fireEvent.keyDown(form, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      within(
        screen.getByRole("complementary", { name: "Observatory inspector" }),
      ).getByRole("heading", { name: host.label }),
    ).toBeTruthy();
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(
      within(
        screen.getByRole("complementary", { name: "Observatory inspector" }),
      ).getByRole("heading", { name: "Coverage and evidence" }),
    ).toBeTruthy();
    const next = projectObservatory({
      ...scaleObservatoryFixture(0),
      scopeDigest: "different-authorized-scope",
    });
    view.rerender(
      createElement(OperationalObservatory, { ...props, scene: next }),
    );
    await screen.findByText("No authorized resources in this view.");
    expect(screen.queryByText(host.label)).toBeNull();
  });
  it("keeps complete outline, search and honest unsupported work when WebGL fails", async () => {
    engine.fail = true;
    const { props, scene } = setup();
    render(createElement(OperationalObservatory, props));
    await screen.findByText(/Terrain is unavailable/);
    expect(screen.getByText(/Complete resource outline/).textContent).toContain(
      "91",
    );
    expect(screen.getByRole("searchbox")).toBeTruthy();
    expect(
      screen.getByText(/No qualifying active work observation/),
    ).toBeTruthy();
    expect(scene.summary.coverage.monitored).toBe(0);
    const group = scene.representations.find(
      (node) => node.kind === "collection" && node.memberCount === 60,
    )!;
    fireEvent.click(
      screen.getByRole("button", { name: `Expand ${group.label}` }),
    );
    expect(props.onQueryChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        expandedRepresentationIds: expect.arrayContaining([group.id]),
      }),
    );
  });
});

describe("provider plane context in the actual inspector", () => {
  it.each([
    [
      "control",
      "Control plane: a disruption may delay deployment or administration. Service availability is observed independently.",
    ],
    [
      "data",
      "Data plane: a disruption may affect service traffic. Local availability and impact are observed independently.",
    ],
    [
      null,
      "Plane unknown: the notice does not identify control or data plane. Local availability and impact are observed independently.",
    ],
  ] as const)(
    "discloses %s plane without converting passing availability to failure",
    async (plane, explanation) => {
      const fixture = operationalObservatoryFixture();
      const service = { ...fixture.services[0]!, parentResourceId: null };
      const scene = projectObservatory({
        ...observatoryFixtureInput([service, fixture.providers[0]!]),
        signals: [fixture.signals[0]!],
        requirements: [fixture.requirements[0]!],
        providerDependencies: [
          { ...fixture.providerDependencies[0]!, plane: plane ?? "control" },
        ],
        providerNotices: [{ ...fixture.providerNotices[0]!, plane }],
      });
      const snapshot: InfrastructureOverview = {
        readAt: scene.readCompletedAt,
        total: 2,
        nextCursor: null,
        items: [],
        edges: [],
        events: [],
      };
      render(
        createElement(OperationalObservatory, {
          scene,
          snapshot,
          selectedId: service.id,
          onSelect: vi.fn(),
          onProject: vi.fn(),
          onQueryChange: vi.fn(),
        }),
      );
      await waitFor(() => expect(engine.update).toHaveBeenCalled());
      const inspector = screen.getByRole("complementary", {
        name: "Observatory inspector",
      });
      const summary = within(inspector).getByText(
        "Provider notices and relevance (1)",
      );
      fireEvent.click(summary);
      const disclosure = summary.closest("details")!;
      expect(disclosure).toHaveAttribute("open");
      expect(within(disclosure).getByText(explanation)).toBeVisible();
      expect(
        within(inspector).getByText(
          "1 passing / 0 failing / 0 degraded / 0 unknown / 0 maintenance",
        ),
      ).toBeVisible();
      expect(
        within(inspector).getByText(
          "No confirmed required local impact in the available evidence.",
        ),
      ).toBeVisible();
      expect(
        within(disclosure).getByText(
          plane === null ? "relevance unknown" : "potential exposure",
        ),
      ).toBeVisible();
      expect(disclosure).toHaveTextContent(
        "local impact unknown; causation unknown",
      );
      for (const other of ["Control plane:", "Data plane:", "Plane unknown:"])
        if (!explanation.startsWith(other))
          expect(
            within(disclosure).queryByText((text) => text.startsWith(other)),
          ).toBeNull();
    },
  );
});

function guidedTourFixture(revealBudget?: number) {
  const input = {
      ...mixedObservatoryFixture(),
      ...(revealBudget === undefined ? {} : { revealBudget }),
    },
    scene = projectObservatory(input),
    // Top-level hosts: primary groups the presentation visits.
    hosts = scene.representations.filter(
      (node) =>
        node.kind === "host" &&
        !node.parentRepresentationId &&
        scene.visibleRepresentationIds.includes(node.id),
    );
  const props = {
    scene,
    snapshot: {
      readAt: scene.readCompletedAt,
      total: 91,
      nextCursor: null,
      items: [],
      edges: [],
      events: [],
    } as InfrastructureOverview,
    selectedId: null as string | null,
    onSelect: vi.fn(),
    onProject: vi.fn(),
    onQueryChange: vi.fn(),
    onCameraFocus: vi.fn(),
  };
  return { input, scene, hosts, props };
}
describe("automatic tour features in the actual operational component", () => {
  it("keeps the existing inspector and tour without focus, expansion or artificial reading history on automatic features", async () => {
    const { scene, hosts, props } = guidedTourFixture();
    const view = render(createElement(OperationalObservatory, props));
    await waitFor(() => expect(engine.update).toHaveBeenCalled());
    const inspector = screen.getByRole("complementary", {
        name: "Observatory inspector",
      }),
      start = screen.getByRole("button", { name: "Start presentation" });
    fireEvent.click(start);
    expect(engine.update.mock.lastCall?.[1].cameraMode).toBe("tour");
    const focusCalls = props.onCameraFocus.mock.calls.length,
      created = engine.created.mock.calls.length;
    for (const host of hosts.slice(0, 2)) {
      act(() => engine.hooks?.featured?.(host.id));
      expect(
        screen.getByRole("complementary", { name: "Observatory inspector" }),
      ).toBe(inspector);
      expect(
        within(inspector).getByRole("heading", { name: host.label }),
      ).toBeVisible();
      expect(inspector).toHaveTextContent(host.resourceId!);
      expect(engine.update.mock.lastCall?.[1]).toMatchObject({
        cameraMode: "tour",
        motion: true,
        selected: host.id,
      });
      expect(props.onCameraFocus).toHaveBeenCalledTimes(focusCalls);
      expect(props.onQueryChange).not.toHaveBeenCalled();
      expect(props.onSelect).not.toHaveBeenCalled();
    }
    view.rerender(
      createElement(OperationalObservatory, {
        ...props,
        scene: {
          ...scene,
          evaluatedAt: "2026-10-16T12:00:18.000Z",
          representations: [...scene.representations],
        },
      }),
    );
    await act(async () => {});
    expect(engine.update.mock.lastCall?.[1].cameraMode).toBe("tour");
    expect(props.onCameraFocus).toHaveBeenCalledTimes(focusCalls);
    expect(engine.created).toHaveBeenCalledTimes(created);
    fireEvent.click(within(inspector).getByRole("button", { name: "Back" }));
    expect(
      within(inspector).getByRole("heading", { name: "Coverage and evidence" }),
    ).toBeVisible();
    expect(props.onQueryChange).not.toHaveBeenCalled();
  });
});

describe("direct operational presentation interruptions", () => {
  it.each([
    "selection",
    "keyboard activation",
    "search",
    "drag",
    "inspector reading",
  ])(
    "stops the tour on %s and resumes it only by explicit Start presentation",
    async (action) => {
      const { hosts, props } = guidedTourFixture();
      render(createElement(OperationalObservatory, props));
      await waitFor(() => expect(engine.update).toHaveBeenCalled());
      fireEvent.click(
        screen.getByRole("button", { name: "Start presentation" }),
      );
      act(() => engine.hooks?.featured?.(hosts[0]!.id));
      expect(engine.update.mock.lastCall?.[1]).toMatchObject({
        cameraMode: "tour",
        selected: hosts[0]!.id,
      });
      const focusCalls = props.onCameraFocus.mock.calls.length;
      if (action === "selection") act(() => engine.hooks!.select(hosts[0]!.id));
      if (action === "keyboard activation")
        fireEvent.click(
          screen.getByRole("button", {
            name:
              "Inspect " +
              hosts[0]!.label +
              ", Host, " +
              hosts[0]!.memberCount +
              " unique resources",
          }),
          { detail: 0 },
        );
      if (action === "search") {
        const input = screen.getByRole("searchbox");
        fireEvent.focus(input);
        fireEvent.change(input, { target: { value: "Synthetic" } });
      }
      if (action === "drag") {
        fireEvent.pointerDown(
          screen.getByLabelText("Projected operational landscape"),
        );
        act(() => engine.hooks!.interrupted());
      }
      if (action === "inspector reading")
        fireEvent.focus(
          within(
            screen.getByRole("complementary", {
              name: "Observatory inspector",
            }),
          ).getByRole("button", { name: "Back" }),
        );
      // Selecting a primary group deliberately watches it instead.
      const direct = action === "selection" || action === "keyboard activation";
      const held = direct ? "watch" : "manual";
      expect(engine.update.mock.lastCall?.[1].cameraMode).toBe(held);
      if (direct) {
        expect(engine.update.mock.lastCall?.[1].watch).toBe(hosts[0]!.id);
        expect(props.onSelect).toHaveBeenLastCalledWith(hosts[0]!.resourceId);
        expect(props.onCameraFocus).toHaveBeenCalledTimes(focusCalls + 1);
        expect(props.onCameraFocus.mock.lastCall?.[1]).toBe(hosts[0]!.id);
      }
      act(() => engine.hooks?.featured?.(hosts[1]!.id));
      await act(async () => {});
      expect(engine.update.mock.lastCall?.[1].cameraMode).toBe(held);
      expect(engine.update.mock.lastCall?.[1].selected).toBe(hosts[0]!.id);
      fireEvent.click(
        screen.getByRole("button", { name: "Start presentation" }),
      );
      expect(engine.update.mock.lastCall?.[1]).toMatchObject({
        cameraMode: "tour",
        motion: true,
      });
      act(() => engine.hooks?.featured?.(hosts[1]!.id));
      expect(engine.update.mock.lastCall?.[1]).toMatchObject({
        cameraMode: "tour",
        selected: hosts[1]!.id,
      });
    },
  );
  it("keeps pause and reduced motion static, rejects foreign and non-primary features, and resets denied scope state", async () => {
    const { scene, hosts, props } = guidedTourFixture(),
      view = render(createElement(OperationalObservatory, props));
    await waitFor(() => expect(engine.update).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Start presentation" }));
    act(() => engine.hooks?.featured?.(hosts[0]!.id));
    const nested = scene.representations.find(
      (node) =>
        node.parentRepresentationId &&
        scene.visibleRepresentationIds.includes(node.id),
    )!;
    const repository = scene.representations.find(
      (node) => node.kind === "repository",
    )!;
    act(() => {
      engine.hooks?.featured?.("foreign");
      engine.hooks?.featured?.(nested.id);
      engine.hooks?.featured?.(repository.id);
    });
    expect(engine.update.mock.lastCall?.[1].selected).toBe(hosts[0]!.id);
    fireEvent.click(screen.getByRole("button", { name: "Pause scene" }));
    expect(engine.update.mock.lastCall?.[1]).toMatchObject({
      cameraMode: "manual",
      motion: false,
    });
    act(() => engine.hooks?.featured?.(hosts[1]!.id));
    expect(engine.update.mock.lastCall?.[1].selected).toBe(hosts[0]!.id);
    fireEvent.click(screen.getByRole("button", { name: "Resume scene" }));
    expect(engine.update.mock.lastCall?.[1].cameraMode).toBe("manual");
    fireEvent.click(
      screen.getByRole("button", { name: "Appearance and views" }),
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Reduced motion" }));
    expect(engine.update.mock.lastCall?.[1]).toMatchObject({
      cameraMode: "composed",
      motion: false,
    });
    expect(
      screen.getByRole("button", { name: "Start presentation" }),
    ).toBeDisabled();
    const next = projectObservatory({
      ...scaleObservatoryFixture(0),
      scopeDigest: "tour-new-empty-scope",
    });
    view.rerender(
      createElement(OperationalObservatory, { ...props, scene: next }),
    );
    await screen.findByText("No authorized resources in this view.");
    expect(screen.queryByText(hosts[0]!.label)).toBeNull();
    await waitFor(() =>
      expect(engine.update.mock.lastCall?.[1].selected).toBeNull(),
    );
  });
  it("keeps deliberate orbit moving until a real interaction and resumes only by owner input", async () => {
    const { props } = guidedTourFixture();
    render(createElement(OperationalObservatory, props));
    await waitFor(() => expect(engine.update).toHaveBeenCalled());
    fireEvent.click(
      screen.getByRole("button", { name: "Appearance and views" }),
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Camera" }), {
      target: { value: "orbit" },
    });
    expect(engine.update.mock.lastCall?.[1].cameraMode).toBe("orbit");
    act(() => engine.hooks!.interrupted());
    expect(engine.update.mock.lastCall?.[1].cameraMode).toBe("manual");
    await act(async () => {});
    expect(engine.update.mock.lastCall?.[1].cameraMode).toBe("manual");
    fireEvent.click(screen.getByRole("button", { name: "Start presentation" }));
    expect(engine.update.mock.lastCall?.[1].cameraMode).toBe("orbit");
  });
});

it("treats explicit outline expansion after a tour feature as direct focus and preserves normal refitting", async () => {
  const { input, hosts, props } = guidedTourFixture(0),
    view = render(createElement(OperationalObservatory, props));
  await waitFor(() => expect(engine.update).toHaveBeenCalled());
  fireEvent.click(screen.getByRole("button", { name: "Start presentation" }));
  act(() => engine.hooks?.featured?.(hosts[0]!.id));
  const before = props.onCameraFocus.mock.calls.length;
  fireEvent.click(
    screen.getByRole("button", { name: "Expand " + hosts[0]!.label }),
  );
  expect(engine.update.mock.lastCall?.[1].cameraMode).toBe("manual");
  expect(props.onQueryChange).toHaveBeenCalledTimes(1);
  const expanded = projectObservatory({
    ...input,
    ...props.onQueryChange.mock.lastCall![0],
  });
  view.rerender(
    createElement(OperationalObservatory, { ...props, scene: expanded }),
  );
  await waitFor(() =>
    expect(props.onCameraFocus).toHaveBeenCalledTimes(before + 1),
  );
  expect(props.onCameraFocus.mock.lastCall?.[1]).toBe(hosts[0]!.id);
  expect(engine.update.mock.lastCall?.[1].cameraMode).toBe("manual");
});

describe("explicit external selection intent after automatic tour context", () => {
  it("accepts a repeated canonical ID request after a different automatic host without replaying intent on refresh", async () => {
    const { scene, hosts, props } = guidedTourFixture();
    const requested = {
      ...props,
      selectedId: hosts[0]!.resourceId,
      selectionRevision: 1,
    };
    const view = render(createElement(OperationalObservatory, requested));
    await waitFor(() => expect(engine.update).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Start presentation" }));
    act(() => engine.hooks?.featured?.(hosts[1]!.id));
    expect(engine.update.mock.lastCall?.[1]).toMatchObject({
      cameraMode: "tour",
      selected: hosts[1]!.id,
    });
    const inspector = screen.getByRole("complementary", {
        name: "Observatory inspector",
      }),
      calls = props.onCameraFocus.mock.calls.length;
    view.rerender(
      createElement(OperationalObservatory, {
        ...requested,
        selectionRevision: 2,
      }),
    );
    await waitFor(() =>
      expect(engine.update.mock.lastCall?.[1]).toMatchObject({
        cameraMode: "manual",
        selected: hosts[0]!.id,
      }),
    );
    expect(
      within(inspector).getByRole("heading", { name: hosts[0]!.label }),
    ).toBeVisible();
    expect(props.onCameraFocus).toHaveBeenCalledTimes(calls + 1);
    expect(props.onCameraFocus.mock.lastCall?.[1]).toBe(hosts[0]!.id);
    expect(props.onSelect).not.toHaveBeenCalled();
    expect(props.onQueryChange).not.toHaveBeenCalled();
    const after = props.onCameraFocus.mock.calls.length;
    view.rerender(
      createElement(OperationalObservatory, {
        ...requested,
        selectionRevision: 2,
        scene: {
          ...scene,
          representations: [...scene.representations],
          evaluatedAt: "2026-10-16T12:00:25.000Z",
        },
      }),
    );
    await act(async () => {});
    expect(props.onCameraFocus).toHaveBeenCalledTimes(after);
    expect(engine.update.mock.lastCall?.[1].cameraMode).toBe("manual");
    fireEvent.click(screen.getByRole("button", { name: "Start presentation" }));
    act(() => engine.hooks?.featured?.(hosts[1]!.id));
    expect(engine.update.mock.lastCall?.[1].cameraMode).toBe("tour");
  });
});

it("treats a new same-ID request as direct before the first tour feature without duplicating it on refresh", async () => {
  const { hosts, props } = guidedTourFixture(),
    first = hosts[0]!,
    requested = {
      ...props,
      selectedId: first.resourceId,
      selectionRevision: 10,
    };
  const view = render(createElement(OperationalObservatory, requested));
  await waitFor(() => expect(engine.update).toHaveBeenCalled());
  fireEvent.click(screen.getByRole("button", { name: "Start presentation" }));
  expect(engine.update.mock.lastCall?.[1].cameraMode).toBe("tour");
  const before = props.onCameraFocus.mock.calls.length;
  view.rerender(
    createElement(OperationalObservatory, {
      ...requested,
      selectionRevision: 11,
    }),
  );
  await waitFor(() =>
    expect(engine.update.mock.lastCall?.[1].cameraMode).toBe("manual"),
  );
  expect(props.onCameraFocus).toHaveBeenCalledTimes(before + 1);
  expect(props.onCameraFocus.mock.lastCall?.[1]).toBe(first.id);
  view.rerender(
    createElement(OperationalObservatory, {
      ...requested,
      selectionRevision: 11,
      snapshot: { ...props.snapshot },
    }),
  );
  await act(async () => {});
  expect(props.onCameraFocus).toHaveBeenCalledTimes(before + 1);
  expect(props.onQueryChange).not.toHaveBeenCalled();
});

describe("breadcrumb reading-context restoration", () => {
  async function setupReadingContext(initialChild = false) {
    const host = observatoryFixtureResource(61001, "host"),
      child = {
        ...observatoryFixtureResource(61002),
        parentResourceId: host.id,
      },
      leaf = {
        ...observatoryFixtureResource(61003),
        parentResourceId: child.id,
      },
      input = observatoryFixtureInput([host, child, leaf]),
      scene = projectObservatory(input);
    const { ObservatoryRenderer: ActualRenderer } =
      await vi.importActual<typeof import("./renderer")>("./renderer");
    const camera = new PerspectiveCamera(40, 1, 0.1, 500),
      target = new Vector3(0, -1, 0);
    camera.position.set(24, 18, 30);
    // Use the shipped saved-pose method, without constructing a GPU or a second camera store.
    const main = Object.assign(Object.create(ActualRenderer.prototype), {
      renderer: { domElement: { dataset: {} } },
      camera,
      controls: { target, update() {} },
      targets: [] as Well[],
      memberSpacing: [],
      settings: { motion: false },
      focusedSubject: null,
      savedFocusPoses: new Map(),
      cameraTween: null,
      reconcileViewport() {},
    }) as {
      targets: Well[];
      focusSubject: ObservatoryRenderer["focusSubject"];
      adoptSubject: ObservatoryRenderer["adoptSubject"];
      presentationMoved: boolean;
      focusedSubject: string | null;
      savedFocusPoses: Map<
        string | null,
        { position: Vector3; target: Vector3 }
      >;
    };
    engine.adopt.mockImplementation((id) => main.adoptSubject(id));
    const props = {
      scene,
      snapshot: {
        readAt: scene.readCompletedAt,
        total: 3,
        nextCursor: null,
        items: [],
        edges: [],
        events: [],
      } as InfrastructureOverview,
      selectedId: initialChild ? child.id : null,
      onSelect: vi.fn(),
      onProject: vi.fn(),
      onQueryChange: vi.fn<(query: ObservatoryQuery) => void>(),
      onCameraFocus: vi.fn<
        NonNullable<OperationalObservatoryProps["onCameraFocus"]>
      >((_renderer, id, options) => {
        main.targets = engine.update.mock.lastCall![0];
        expect(main.focusSubject(id, { ...options, immediate: true })).toBe(
          true,
        );
      }),
    };
    const view = render(createElement(OperationalObservatory, props));
    await waitFor(() => expect(props.onCameraFocus).toHaveBeenCalled());
    const node = (resourceId: string) =>
      scene.representations.find(
        (item) => item.resourceId === resourceId && !item.referenceTo,
      )!;
    const publish = async () => {
      props.scene = projectObservatory({
        ...input,
        ...props.onQueryChange.mock.lastCall?.[0],
      });
      props.selectedId = props.onSelect.mock.lastCall?.[0] ?? props.selectedId;
      view.rerender(createElement(OperationalObservatory, props));
      await act(async () => {});
    };
    const select = async (resourceId: string) => {
      act(() => engine.hooks!.select(node(resourceId).id));
      await publish();
    };
    const breadcrumb = (resourceId: string) =>
      within(
        screen.getByRole("navigation", { name: "Observatory breadcrumbs" }),
      ).getByRole("button", { name: node(resourceId).label });
    return {
      host,
      child,
      leaf,
      props,
      view,
      main,
      camera,
      target,
      node,
      publish,
      select,
      breadcrumb,
    };
  }

  it.each(["breadcrumb", "Back", "Escape"])(
    "restores the exact panned ancestor pose and authorized query through %s",
    async (action) => {
      const context = await setupReadingContext();
      const {
        host,
        child,
        props,
        camera,
        target,
        node,
        publish,
        select,
        breadcrumb,
      } = context;
      const overview = {
        position: camera.position.clone(),
        target: target.clone(),
      };
      await select(host.id);
      // Selecting a primary group starts its watch orbit.
      expect(engine.update.mock.lastCall![1]).toMatchObject({
        cameraMode: "watch",
        watch: node(host.id).id,
      });
      const savedQuery = props.onQueryChange.mock.lastCall![0];
      // Panning is direct interaction: it stops the orbit at this pose.
      act(() => engine.hooks!.interrupted());
      camera.position.set(13, 19, 27);
      target.set(3, -2, 7);
      const reading = {
        position: camera.position.clone(),
        target: target.clone(),
      };
      await select(child.id);
      expect(
        props.onQueryChange.mock.lastCall![0].expandedRepresentationIds,
      ).toContain(node(child.id).id);
      expect(camera.position.toArray()).not.toEqual(reading.position.toArray());
      if (action === "breadcrumb") fireEvent.click(breadcrumb(host.id));
      else if (action === "Back")
        fireEvent.click(screen.getByRole("button", { name: "Back" }));
      else
        fireEvent.keyDown(
          screen.getByRole("region", { name: "Operational Observatory" }),
          { key: "Escape" },
        );
      expect(props.onCameraFocus.mock.lastCall).toEqual([
        expect.anything(),
        node(host.id).id,
        expect.objectContaining({ restore: true }),
      ]);
      expect(props.onQueryChange.mock.lastCall![0]).toEqual({
        ...savedQuery,
        viewRevision: expect.any(String),
      });
      expect(props.onSelect).toHaveBeenLastCalledWith(host.id);
      expect(engine.update.mock.lastCall![1].cameraMode).toBe("manual");
      expect(camera.position.toArray()).toEqual(reading.position.toArray());
      expect(target.toArray()).toEqual(reading.target.toArray());
      await publish();
      const calls = props.onCameraFocus.mock.calls.length;
      viewRefresh(context);
      await act(async () => {});
      expect(props.onCameraFocus).toHaveBeenCalledTimes(calls);
      expect(camera.position.toArray()).toEqual(reading.position.toArray());
      expect(target.toArray()).toEqual(reading.target.toArray());
      fireEvent.click(breadcrumb(host.id));
      expect(props.onCameraFocus).toHaveBeenCalledTimes(calls);
      expect(camera.position.toArray()).toEqual(reading.position.toArray());
      fireEvent.click(screen.getByRole("button", { name: "Back" }));
      expect(props.onCameraFocus.mock.lastCall![1]).toBeNull();
      expect(camera.position.toArray()).toEqual(overview.position.toArray());
      expect(target.toArray()).toEqual(overview.target.toArray());
    },
  );

  function viewRefresh(
    context: Awaited<ReturnType<typeof setupReadingContext>>,
  ) {
    context.view.rerender(
      createElement(OperationalObservatory, {
        ...context.props,
        scene: {
          ...context.props.scene,
          representations: [...context.props.scene.representations],
        },
      }),
    );
  }

  it("unwinds descendants when an earlier ancestor breadcrumb is restored", async () => {
    const { host, child, leaf, props, camera, target, select, breadcrumb } =
      await setupReadingContext();
    await select(host.id);
    camera.position.set(11, 17, 29);
    target.set(4, -3, 8);
    const position = camera.position.toArray(),
      center = target.toArray();
    await select(child.id);
    await select(leaf.id);
    fireEvent.click(breadcrumb(host.id));
    expect(props.onCameraFocus.mock.lastCall![2].restore).toBe(true);
    expect(camera.position.toArray()).toEqual(position);
    expect(target.toArray()).toEqual(center);
    fireEvent.keyDown(
      screen.getByRole("region", { name: "Operational Observatory" }),
      { key: "Escape" },
    );
    expect(props.onCameraFocus.mock.lastCall![1]).toBeNull();
  });

  it("fits a never-visited ancestor directly and keeps Back to its prior composed child context", async () => {
    const { host, child, props, node, publish, breadcrumb } =
      await setupReadingContext(true);
    fireEvent.click(breadcrumb(host.id));
    expect(props.onCameraFocus.mock.lastCall![1]).toBe(node(host.id).id);
    expect(props.onCameraFocus.mock.lastCall![2].restore).toBe(false);
    await publish();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(props.onCameraFocus.mock.lastCall![1]).toBe(node(child.id).id);
    expect(props.onCameraFocus.mock.lastCall![2].restore).toBe(true);
    expect(engine.update.mock.lastCall![1].cameraMode).toBe("composed");
  });
  it("does not turn an automatic ancestor feature into retained direct reading history", async () => {
    const { host, child, props, node, select } = await setupReadingContext();
    fireEvent.click(screen.getByRole("button", { name: "Start presentation" }));
    act(() => engine.hooks?.featured?.(node(host.id).id));
    expect(engine.update.mock.lastCall![1].cameraMode).toBe("tour");
    await select(child.id);
    expect(engine.update.mock.lastCall![1].cameraMode).toBe("manual");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(props.onCameraFocus.mock.lastCall![1]).toBeNull();
    expect(props.onCameraFocus.mock.lastCall![2].restore).toBe(true);
  });

  it("independent: retains a tour host reading pose after current breadcrumb, child, and ancestor", async () => {
    const {
      host,
      child,
      props,
      camera,
      target,
      node,
      select,
      breadcrumb,
      main,
    } = await setupReadingContext();
    fireEvent.click(screen.getByRole("button", { name: "Start presentation" }));
    act(() => engine.hooks?.featured?.(node(host.id).id));
    camera.position.set(31, 23, 47);
    target.set(7, -3, 11);
    main.presentationMoved = true;
    const pose = {
      position: camera.position.toArray(),
      target: target.toArray(),
    };
    const calls = props.onCameraFocus.mock.calls.length;
    fireEvent.click(breadcrumb(host.id));
    expect(props.onCameraFocus).toHaveBeenCalledTimes(calls);
    expect(engine.update.mock.lastCall![1].cameraMode).toBe("manual");
    expect(camera.position.toArray()).toEqual(pose.position);
    expect(target.toArray()).toEqual(pose.target);
    expect(engine.adopt).toHaveBeenLastCalledWith(node(host.id).id);
    const beforeChildSubject = main.focusedSubject;
    await select(child.id);
    const savedKeys = [...main.savedFocusPoses.keys()];
    fireEvent.click(breadcrumb(host.id));
    expect(props.onCameraFocus.mock.lastCall![2].restore).toBe(true);
    console.info(
      "Independent tour/current-crumb diagnostics",
      JSON.stringify({
        expectedSubject: node(host.id).id,
        beforeChildSubject,
        savedKeys,
        expectedPose: pose,
        actualPose: {
          position: camera.position.toArray(),
          target: target.toArray(),
        },
      }),
    );
    expect(camera.position.toArray()).toEqual(pose.position);
    expect(target.toArray()).toEqual(pose.target);
  });

  it.each([false, true])(
    "discards removed ancestor context after scope change=%s",
    async (scopeChanged) => {
      const { host, child, leaf, props, view, select } =
        await setupReadingContext();
      await select(host.id);
      await select(child.id);
      props.onSelect.mockClear();
      const next = projectObservatory({
        ...observatoryFixtureInput([
          { ...child, parentResourceId: null },
          leaf,
        ]),
        ...(scopeChanged ? { scopeDigest: "fixture:new-reading-scope" } : {}),
      });
      view.rerender(
        createElement(OperationalObservatory, { ...props, scene: next }),
      );
      await act(async () => {});
      expect(screen.queryByText(host.name)).toBeNull();
      props.onQueryChange.mockClear();
      fireEvent.click(screen.getByRole("button", { name: "Back" }));
      expect(props.onSelect).not.toHaveBeenCalled();
      expect(engine.update.mock.lastCall![1].selected).toBeNull();
      expect(props.onCameraFocus.mock.lastCall![1]).toBeNull();
      if (scopeChanged) expect(props.onQueryChange).not.toHaveBeenCalled();
      else
        expect(
          props.onQueryChange.mock.lastCall![0].expandedRepresentationIds,
        ).not.toContain("resource:" + host.id);
    },
  );
});

it.each([false, true])(
  "restores only the exact shared alias context while alias removed=%s",
  async (removed) => {
    const input = mixedObservatoryFixture(),
      scene = projectObservatory({ ...input, grouping: "projects" }),
      alias = scene.representations.find(
        (node) => node.referenceTo && node.resourceId,
      )!,
      canonical = scene.representations.find(
        (node) => node.id === alias.referenceTo,
      )!;
    const props = {
      scene,
      snapshot: {
        readAt: scene.readCompletedAt,
        total: 91,
        nextCursor: null,
        items: [],
        edges: [],
        events: [],
      } as InfrastructureOverview,
      selectedId: null as string | null,
      onSelect: vi.fn(),
      onProject: vi.fn(),
      onQueryChange: vi.fn<(query: ObservatoryQuery) => void>(),
      onCameraFocus: vi.fn(),
    };
    const view = render(createElement(OperationalObservatory, props));
    await waitFor(() => expect(engine.update).toHaveBeenCalled());
    act(() => engine.hooks!.select(alias.id));
    props.selectedId = alias.resourceId;
    props.scene = projectObservatory({
      ...input,
      ...props.onQueryChange.mock.lastCall![0],
    });
    view.rerender(createElement(OperationalObservatory, props));
    await act(async () => {});
    expect(engine.update.mock.lastCall![1].selected).toBe(alias.id);
    fireEvent.click(
      screen.getByRole("button", { name: "Inspect canonical context" }),
    );
    expect(engine.update.mock.lastCall![1].selected).toBe(canonical.id);
    props.onSelect.mockClear();
    if (removed) {
      props.scene = projectObservatory({ ...input, grouping: "hosts" });
      expect(
        props.scene.representations.some((node) => node.id === alias.id),
      ).toBe(false);
      view.rerender(createElement(OperationalObservatory, props));
      await act(async () => {});
    }
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(engine.update.mock.lastCall![1].selected).toBe(
      removed ? null : alias.id,
    );
    expect(props.onCameraFocus.mock.lastCall![2].restore).toBe(true);
    if (removed) {
      expect(props.onSelect).not.toHaveBeenCalled();
      expect(props.onCameraFocus.mock.lastCall![1]).toBeNull();
    } else {
      expect(props.onSelect).toHaveBeenLastCalledWith(alias.resourceId);
      expect(props.onCameraFocus.mock.lastCall![1]).toBe(alias.id);
      view.rerender(createElement(OperationalObservatory, props));
      await act(async () => {});
      expect(engine.update.mock.lastCall![1].selected).toBe(alias.id);
    }
  },
);

describe("primary-group presentation in the actual operational component", () => {
  it.each(["mouse", "touch"])(
    "stops watch and presentation through a %s pointer sequence while terrain input still interrupts",
    async (pointerType) => {
      const { props } = guidedTourFixture();
      render(createElement(OperationalObservatory, props));
      await waitFor(() => expect(engine.update).toHaveBeenCalled());
      function pointerClick(button: HTMLElement) {
        fireEvent.pointerDown(button, { pointerType });
        fireEvent.pointerUp(button, { pointerType });
        fireEvent.click(button);
      }
      const roster = screen.getByRole("navigation", { name: "Primary groups" });
      pointerClick(within(roster).getAllByRole("button")[0]!);
      expect(engine.update.mock.lastCall?.[1].cameraMode).toBe("watch");
      pointerClick(screen.getByRole("button", { name: "Stop watching" }));
      expect(engine.update.mock.lastCall?.[1].cameraMode).toBe("manual");
      expect(screen.getByRole("button", { name: "Watch" })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
      pointerClick(screen.getByRole("button", { name: "Start presentation" }));
      expect(engine.update.mock.lastCall?.[1].cameraMode).toBe("tour");
      pointerClick(screen.getByRole("button", { name: "Stop presentation" }));
      expect(engine.update.mock.lastCall?.[1].cameraMode).toBe("manual");
      pointerClick(screen.getByRole("button", { name: "Start presentation" }));
      expect(engine.update.mock.lastCall?.[1].cameraMode).toBe("tour");
      fireEvent.pointerDown(document.querySelector(".cmd-op-canvas")!, {
        pointerType,
      });
      expect(engine.update.mock.lastCall?.[1].cameraMode).toBe("manual");
    },
  );

  it("watches a selected primary group, holds a sub-resource still and offers Watch for it", async () => {
    const { scene, hosts, props } = guidedTourFixture();
    render(createElement(OperationalObservatory, props));
    await waitFor(() => expect(engine.update).toHaveBeenCalled());
    const primary = new OperationalLayout().project(
      scene,
      options,
    ).primaryGroupIds;
    expect(engine.update.mock.lastCall?.[1].stops).toEqual(primary);
    fireEvent.click(
      screen.getByRole("button", {
        name: `Inspect ${hosts[0]!.label}, Host, ${hosts[0]!.memberCount} unique resources`,
      }),
    );
    expect(engine.update.mock.lastCall?.[1]).toMatchObject({
      cameraMode: "watch",
      watch: hosts[0]!.id,
      selected: hosts[0]!.id,
    });
    expect(
      screen.getByRole("button", { name: "Stop watching" }),
    ).toHaveAttribute("aria-pressed", "true");
    const card = document.querySelector(".cmd-op-briefing-card")!;
    expect(card).toHaveTextContent("Watching / Host");
    expect(card.querySelector("strong")).toHaveTextContent(hosts[0]!.label);
    const member = scene.representations.find(
      (node) =>
        node.parentRepresentationId === hosts[0]!.id &&
        scene.visibleRepresentationIds.includes(node.id),
    )!;
    act(() => engine.hooks!.select(member.id));
    expect(engine.update.mock.lastCall?.[1]).toMatchObject({
      cameraMode: "manual",
      watch: null,
      selected: member.id,
    });
    fireEvent.click(screen.getByRole("button", { name: "Watch" }));
    expect(engine.update.mock.lastCall?.[1]).toMatchObject({
      cameraMode: "watch",
      watch: member.id,
    });
    fireEvent.click(screen.getByRole("button", { name: "Stop watching" }));
    expect(engine.update.mock.lastCall?.[1].cameraMode).toBe("manual");
    // The roster marks the primary group that contains the selection.
    const roster = screen.getByRole("navigation", { name: "Primary groups" });
    expect(
      within(roster)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")!.split(":")[0]),
    ).toEqual(
      primary.map(
        (id) => scene.representations.find((node) => node.id === id)!.label,
      ),
    );
    expect(
      within(roster).getByRole("button", { current: true }),
    ).toHaveAccessibleName(
      `${hosts[0]!.label}: Host, ${hosts[0]!.memberCount} unique resources`,
    );
    fireEvent.click(screen.getByRole("button", { name: "Start presentation" }));
    expect(engine.update.mock.lastCall?.[1].cameraMode).toBe("tour");
  });

  it("selects and watches a group from its roster chip and names the stop the tour reports", async () => {
    const { scene, props } = guidedTourFixture();
    render(createElement(OperationalObservatory, props));
    await waitFor(() => expect(engine.update).toHaveBeenCalled());
    const primary = new OperationalLayout().project(
      scene,
      options,
    ).primaryGroupIds;
    const last = scene.representations.find(
      (node) => node.id === primary.at(-1),
    )!;
    const roster = screen.getByRole("navigation", { name: "Primary groups" });
    fireEvent.click(
      within(roster).getByRole("button", {
        name: new RegExp(`^${last.label}:`),
      }),
    );
    expect(engine.update.mock.lastCall?.[1]).toMatchObject({
      cameraMode: "watch",
      watch: last.id,
    });
    expect(props.onCameraFocus.mock.lastCall?.[1]).toBe(last.id);
    fireEvent.click(screen.getByRole("button", { name: "Start presentation" }));
    const first = scene.representations.find((node) => node.id === primary[0])!;
    act(() => {
      engine.hooks!.tour?.({
        id: first.id,
        reason: "sequence",
        travel: 4.5,
        dwell: 24,
        sequence: 1,
      });
      engine.hooks!.featured?.(first.id);
    });
    const card = document.querySelector(".cmd-op-briefing-card")!;
    expect(card).toHaveTextContent(`Presentation 1 of ${primary.length}`);
    expect(card.querySelector("strong")).toHaveTextContent(first.label);
    expect(
      within(roster).getByRole("button", { current: true }),
    ).toHaveAccessibleName(new RegExp(`^${first.label}:`));
    expect(roster.querySelector(".cmd-op-roster-progress")).toHaveStyle({
      animationDuration: "28.5s",
    });
  });

  it("keeps a primary-group selection still under reduced motion and lists every member in the inspector briefing", async () => {
    vi.mocked(matchMedia).mockImplementation(
      (query: string) =>
        ({
          matches: query.includes("reduce"),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }) as unknown as MediaQueryList,
    );
    const { scene, props } = guidedTourFixture();
    render(createElement(OperationalObservatory, props));
    await waitFor(() => expect(engine.update).toHaveBeenCalled());
    const repositories = scene.representations.find(
      (node) => node.kind === "collection" && node.label === "Repositories",
    )!;
    const roster = screen.getByRole("navigation", { name: "Primary groups" });
    fireEvent.click(
      within(roster).getByRole("button", { name: /^Repositories:/ }),
    );
    await waitFor(() =>
      expect(engine.update.mock.lastCall?.[1].selected).toBe(repositories.id),
    );
    expect(engine.update.mock.lastCall?.[1].cameraMode).toBe("manual");
    expect(screen.getByRole("button", { name: "Watch" })).toBeDisabled();
    const inspector = screen.getByRole("complementary", {
      name: "Observatory inspector",
    });
    const unmapped = within(inspector).getByRole("list", {
      name: "Unmapped repositories",
    });
    expect(within(unmapped).getAllByRole("button")).toHaveLength(48);
    const card = document.querySelector(".cmd-op-briefing-card")!;
    // Without motion the briefing is shown complete, once.
    expect(card.querySelector(".cmd-op-decode")).toBeNull();
    expect(card).toHaveTextContent(
      "60 repositories: 12 linked to projects, 48 unmapped.",
    );
    const target = within(unmapped).getAllByRole("button")[0]!;
    fireEvent.click(target);
    expect(
      within(inspector).getByRole("heading", { level: 3 }),
    ).toHaveTextContent(target.textContent!);
  });
});

it("pulses new current check evidence once, without initial replay, stale traffic or invented transfers", () => {
  const now = Date.now();
  const observedAt = new Date(now).toISOString();
  const signal = {
    id: "actual-check",
    sourceId: "configured-probe",
    resourceId: "actual-resource",
    facet: "availability" as const,
    state: "passing" as const,
    freshness: "fresh" as const,
    observedAt,
    freshnessMs: 60000,
    evidenceRefs: ["source:configured-probe"],
    sourceQualification: "current" as const,
    environment: "production",
    incidentId: null,
  };
  const projection = {
    visibleSubjectForResource: new Map([["actual-resource", "visible-host"]]),
  };
  const activity = new OperationalRecordedActivity();
  activity.synchronize(
    {
      events: mapOperationalCheckObservations(
        { signals: [signal] },
        projection,
      ),
    },
    true,
    now,
  );
  expect(activity.snapshot().events).toEqual([]);
  const next = {
    ...signal,
    id: "next-actual-check",
    observedAt: new Date(now + 1000).toISOString(),
  };
  activity.synchronize(
    {
      events: mapOperationalCheckObservations({ signals: [next] }, projection),
    },
    true,
    now + 1000,
  );
  expect(activity.snapshot().events).toHaveLength(1);
  expect(activity.snapshot().events[0]).toMatchObject({
    from: "visible-host",
    to: "visible-host",
    summary: "Availability check passing",
  });
  expect(activity.snapshot().transfers).toEqual([]);
  activity.synchronize(
    {
      events: mapOperationalCheckObservations({ signals: [next] }, projection),
    },
    true,
    now + 1000,
  );
  expect(activity.snapshot().events).toHaveLength(1);
  expect(
    mapOperationalCheckObservations(
      { signals: [{ ...next, sourceQualification: "last_known" }] },
      projection,
    ),
  ).toEqual([]);
  expect(
    mapOperationalCheckObservations(
      { signals: [next] },
      { visibleSubjectForResource: new Map() },
    ),
  ).toEqual([]);
});

it("replays only new evidenced probe paths and never invents a response to a missing peer", () => {
  const now = Date.now(),
    observedAt = new Date(now).toISOString();
  const base = {
    id: "one",
    resourceId: "target",
    sourceId: "native",
    facet: "availability" as const,
    state: "passing" as const,
    observedAt,
    freshness: "fresh" as const,
    sourceQualification: "current" as const,
    freshnessMs: 300000,
    evidenceRefs: ["real"],
    environment: "production",
    incidentId: null,
    probe: {
      originResourceId: "origin",
      protocol: "http" as const,
      responseTimeMs: 100,
      responseReceived: true,
    },
  };
  const projection = {
    visibleSubjectForResource: new Map([
      ["origin", "visible-origin"],
      ["target", "visible-target"],
    ]),
  };
  const activity = new OperationalRecordedActivity();
  const sync = (signal: typeof base) =>
    activity.synchronize(
      {
        events: mapOperationalCheckObservations(
          { signals: [signal] },
          projection,
        ),
      },
      true,
      now,
    );
  sync(base);
  expect(activity.snapshot().transfers).toEqual([]);
  sync({ ...base, id: "two" });
  expect(
    activity
      .snapshot()
      .transfers.map((flow) => [flow.phase, flow.from, flow.to]),
  ).toEqual([
    ["outbound", "visible-origin", "visible-target"],
    ["response", "visible-target", "visible-origin"],
  ]);
  sync({ ...base, id: "two" });
  expect(activity.snapshot().transfers).toHaveLength(2);
  expect(activity.snapshot().transfers.every((flow) => flow.recorded)).toBe(
    true,
  );
  activity.advance(6);
  expect(activity.snapshot().transfers).toEqual([]);
  sync({
    ...base,
    id: "three",
    probe: { ...base.probe, responseReceived: false },
  });
  expect(activity.snapshot().transfers).toHaveLength(1);
  expect(activity.snapshot().transfers[0]?.phase).toBe("outbound");
  activity.setVisible(false);
  expect(activity.snapshot().transfers).toEqual([]);
  activity.setVisible(true);
  sync({ ...base, id: "four" });
  expect(activity.snapshot().transfers).toEqual([]);
});
