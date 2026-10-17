import { describe, expect, it } from "vitest";
import {
  Color,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  type BufferGeometry,
} from "three";
import { ObservatoryRenderer, type RendererSettings } from "./renderer";
import {
  fieldBounds,
  fieldGeometry,
  fieldTransition,
  packField,
} from "./field";
import type { FieldColor, PackedField } from "./field";
import { surfaceHeight } from "./model";
import type { Well } from "./model";
import { gravityDefaults, projectInfrastructure } from "./infrastructure";

const well = (index: number): Well => ({
  id: `resource-${index}`,
  label: `Resource ${index}`,
  kind: index % 7 === 0 ? "project" : index % 3 === 0 ? "service" : "host",
  hostId: index % 3 === 0 ? `resource-${index - 1}` : null,
  sector: `sector-${index % 5}`,
  x: Math.sin(index * 2.4) * Math.sqrt(index + 1) * 3,
  z: Math.cos(index * 2.4) * Math.sqrt(index + 1) * 3,
  radius: 0.3 + (index % 11) * 0.21,
  depth: (index % 13) * 0.19,
  aspect: 0.65 + (index % 9) * 0.16,
  angle: index * 0.37,
  elevation: (index % 5) * 0.21,
  profile: 0.7 + (index % 6) * 0.13,
  attention: index % 2 === 0,
});
const color = (subject: Well): FieldColor => {
  const n = Number(subject.id.split("-").at(-1)) || 0;
  return [(n % 4) / 4, (n % 8) / 8, (n % 16) / 16];
};
const attention = (subject: Well) => (subject.attention ? 0.75 : 0.125);
function unpack(packed: PackedField, originals: Well[]) {
  return originals.map((subject, index) => {
    const offset = index * 12,
      d = packed.data;
    return {
      ...subject,
      x: d[offset]!,
      z: d[offset + 1]!,
      radius: d[offset + 2]!,
      depth: d[offset + 3]!,
      aspect: d[offset + 4]!,
      angle: d[offset + 5]!,
      elevation: d[offset + 6]!,
      profile: d[offset + 7]!,
    };
  });
}

describe("complete Gravity field", () => {
  it.each([65, 101, 257, 1031])(
    "packs all %i contributions with shape, linear color, attention and final identity",
    (count) => {
      const wells = Array.from({ length: count }, (_, index) => well(index));
      const packed = packField(wells, 4096, color, attention);
      expect(packed.count).toBe(count);
      expect(packed.width).toBeLessThanOrEqual(4096);
      expect(packed.height).toBeLessThanOrEqual(4096);
      const decoded = unpack(packed, wells);
      for (let index = 0; index < count; index++) {
        const subject = wells[index]!;
        expect(
          Array.from(packed.data.slice(index * 12, index * 12 + 12)),
        ).toEqual(
          [
            subject.x,
            subject.z,
            subject.radius,
            subject.depth,
            subject.aspect,
            subject.angle,
            subject.elevation,
            subject.profile,
            ...color(subject),
            attention(subject),
          ].map(Math.fround),
        );
        // The texel addressing used by the shader must recover row-boundary records too.
        const column = index % packed.columns,
          row = Math.floor(index / packed.columns);
        expect(packed.data[(row * packed.width + column * 3) * 4]).toBe(
          Math.fround(subject.x),
        );
      }
      expect(decoded.at(-1)?.id).toBe(`resource-${count - 1}`);
      for (const subject of [
        wells[0]!,
        wells[Math.floor(count / 2)]!,
        wells.at(-1)!,
      ]) {
        for (const [dx, dz] of [
          [0, 0],
          [0.3, -0.7],
          [2.1, 1.5],
        ]) {
          expect(
            surfaceHeight(subject.x + dx!, subject.z + dz!, decoded, 17.3, 1),
          ).toBeCloseTo(
            surfaceHeight(subject.x + dx!, subject.z + dz!, wells, 17.3, 1),
            4,
          );
        }
      }
    },
  );

  it("keeps actual nested resources and presentation sectors in the same complete field", () => {
    const resources = Array.from({ length: 103 }, (_, index) => ({
      id: `resource-${index}`,
      name: `Resource ${index}`,
      kind: index === 0 ? "host" : "service",
      parentResourceId:
        index === 0 ? null : `resource-${Math.floor((index - 1) / 3)}`,
      childCount: 3,
      projects: [{ id: "project", name: "Fleet" }],
      sources: [],
      metrics: [],
      telemetry: "unknown" as const,
      health: "unknown" as const,
    }));
    const scene = projectInfrastructure(resources, {
      ...gravityDefaults,
      grouping: "projects",
    });
    const packed = packField(scene.wells, 64, color, attention);
    expect(packed.count).toBe(104);
    expect(
      scene.wells.filter((subject) => subject.kind === "service").length,
    ).toBe(102);
    expect(scene.wells[0]?.kind).toBe("project");
    expect(
      unpack(packed, scene.wells)
        .map((subject) => subject.id)
        .sort(),
    ).toEqual(
      ["sector:project", ...resources.map((resource) => resource.id)].sort(),
    );
  });

  it("retains a final well's measurable surface after 256 other records", () => {
    const wells = Array.from({ length: 257 }, (_, index) => ({
      ...well(index),
      x: 1000 + index * 10,
      z: 1000,
    }));
    wells[256] = { ...well(256), x: 0, z: 0, depth: 4, elevation: 1 };
    const decoded = unpack(packField(wells, 128, color, attention), wells);
    expect(surfaceHeight(0, 0, decoded)).toBeCloseTo(
      surfaceHeight(0, 0, wells),
      6,
    );
    expect(
      Math.abs(
        surfaceHeight(0, 0, decoded) -
          surfaceHeight(0, 0, decoded.slice(0, -1)),
      ),
    ).toBeGreaterThan(2.9);
  });

  it("reuses unchanged buffers, updates fields and retains fading contributions through empty snapshots", () => {
    const wells = Array.from({ length: 101 }, (_, index) => well(index));
    const initial = packField(wells, 64, color, attention);
    const same = packField(wells, 64, color, attention, initial);
    expect(same.data).toBe(initial.data);
    expect(same.changed).toBe(false);
    const fading = [...wells.slice(0, 65), { ...wells[100]!, depth: 0.001 }];
    const transition = packField(fading, 64, color, attention, same);
    expect(transition.data).toBe(initial.data);
    expect(transition.count).toBe(66);
    expect(transition.data[65 * 12 + 3]).toBe(Math.fround(0.001));
    const changed = packField(
      fading,
      64,
      () => [1, 0.5, 0.25],
      () => 1,
      transition,
    );
    expect(changed.changed).toBe(true);
    expect(Array.from(changed.data.slice(65 * 12 + 8, 65 * 12 + 12))).toEqual([
      1, 0.5, 0.25, 1,
    ]);
    const empty = packField([], 64, color, attention, changed);
    expect(empty.count).toBe(0);
    expect(empty.data).toBe(initial.data);
    expect(packField([], 64, color, attention, empty).changed).toBe(false);
    const grown = packField(
      Array.from({ length: 257 }, (_, index) => well(index)),
      64,
      color,
      attention,
      empty,
    );
    expect(grown.data).not.toBe(initial.data);
    expect(grown.count).toBe(257);
    expect(packField([], 3, color, attention).data.length).toBe(12);
  });

  it("uses the actual hardware rectangle and rejects overflow before mutating a retained field", () => {
    const wells = Array.from({ length: 12 }, (_, index) => well(index));
    const packed = packField(wells, 6, color, attention);
    expect([packed.width, packed.height, packed.count]).toEqual([6, 6, 12]);
    const retained = packed.data.slice();
    expect(() =>
      packField([...wells, well(12)], 6, color, attention, packed),
    ).toThrow(/GPU.*6px.*12/);
    expect(packed.data).toEqual(retained);
    expect(() => packField([well(0)], 2, color, attention)).toThrow(RangeError);
    expect(
      packField(
        Array.from({ length: 257 }, (_, index) => well(index)),
        1024,
        color,
        attention,
      ).count,
    ).toBe(257);
  });
});

describe("complete landscape work and coverage", () => {
  it("bounds overview and focus evaluations while every record still participates", () => {
    for (const population of [1, 65, 101, 257, 1000, 10000]) {
      for (const [width, depth] of [
        [68, 58],
        [1000, 1],
        [1, 1000],
      ]) {
        for (const focus of [false, true]) {
          const plan = fieldGeometry(population, width!, depth!, focus);
          expect(plan.vertices).toBe((plan.x + 1) * (plan.z + 1));
          expect(plan.x).toBeGreaterThanOrEqual(1);
          expect(plan.z).toBeGreaterThanOrEqual(1);
          expect(plan.vertices * population).toBeLessThanOrEqual(
            plan.evaluations,
          );
          expect(plan.vertices).toBeLessThanOrEqual(focus ? 65000 : 137000);
        }
      }
    }
    expect(fieldGeometry(257, 68, 58).vertices).toBeLessThan(
      fieldGeometry(1, 68, 58).vertices,
    );
    expect(fieldGeometry(257, 12, 12, true).vertices).toBeGreaterThan(7000);
  });

  it("covers arbitrary positions, elongated sectors, distant nested services and fade-out shapes", () => {
    const wells = [
      {
        ...well(0),
        x: 10000,
        z: -9000,
        kind: "project" as const,
        radius: 17,
        aspect: 4,
        angle: 1.2,
      },
      {
        ...well(1),
        x: -7000,
        z: 11000,
        kind: "service" as const,
        radius: 4,
        aspect: 0.3,
      },
      { ...well(2), x: -10000, z: -10000, depth: 0.001 },
    ];
    const bounds = fieldBounds(wells);
    for (const subject of wells) {
      const extent = subject.radius * Math.max(1, subject.aspect) * 4 * 1.3;
      expect(bounds.x - bounds.width / 2).toBeLessThanOrEqual(
        subject.x - extent,
      );
      expect(bounds.x + bounds.width / 2).toBeGreaterThanOrEqual(
        subject.x + extent,
      );
      expect(bounds.z - bounds.depth / 2).toBeLessThanOrEqual(
        subject.z - extent,
      );
      expect(bounds.z + bounds.depth / 2).toBeGreaterThanOrEqual(
        subject.z + extent,
      );
    }
    expect(bounds.apron).toBeGreaterThan(90);
    expect(fieldBounds([])).toMatchObject({
      x: 0,
      z: 0,
      width: 68,
      depth: 58,
      apron: 90,
    });
  });
});

describe("identity-aware renderer terrain planning", () => {
  it("keeps all 91 unchanged wells at their original terrain detail on refresh", () => {
    const wells = Array.from({ length: 91 }, (_, index) => well(index));
    const settings = {
      theme: "porcelain",
      palette: {
        reporting: "#2288bb",
        attention: "#cc8800",
        unhealthy: "#cc2200",
      },
      motion: false,
      cameraMode: "manual",
      ambient: false,
      selected: null,
      focus: false,
      activity: { source: null, running: false, follow: false, trace: null },
    } as unknown as RendererSettings;
    // Exercise the shipped update and terrain methods without creating a WebGL context.
    const renderer = Object.assign(
      Object.create(ObservatoryRenderer.prototype),
      {
        renderer: { domElement: { dataset: {} } },
        geometry: new PlaneGeometry(1, 1),
        terrain: new Mesh(),
        terrainPlan: "",
        targets: wells,
        wells,
        settings,
        fieldColors: new Map(),
        controls: { maxDistance: 220 },
        camera: new PerspectiveCamera(40, 1, 0.1, 500),
        uniforms: {
          uWarning: { value: new Color() },
          uReporting: { value: new Color() },
          uFailure: { value: new Color() },
        },
        submitField() {},
        reconcileViewport() {},
      },
    ) as {
      coverLandscape(wells: Well[]): void;
      update(wells: Well[], settings: RendererSettings): void;
      geometry: BufferGeometry;
      terrainPlan: string;
      cameraTween?: unknown;
    };
    try {
      renderer.coverLandscape(wells);
      const initial = renderer.geometry;
      const vertices = initial.attributes.position!.count;
      renderer.update(
        wells.map((subject) => ({ ...subject })),
        settings,
      );
      expect(renderer.geometry.attributes.position!.count).toBe(vertices);
      expect(renderer.geometry).toBe(initial);
      expect(renderer.cameraTween).toBeUndefined();
    } finally {
      renderer.geometry.dispose();
    }
  });
});

describe("transition identity union", () => {
  it("budgets each unchanged identity once and retains both moved and fading extents", () => {
    const previous = Array.from({ length: 91 }, (_, index) => well(index));
    const same = fieldTransition(
      previous,
      previous.map((subject) => ({ ...subject })),
    );
    expect(same.population).toBe(91);
    expect(same.footprints).toHaveLength(91);
    expect(same.bounds).toEqual(fieldBounds(previous));
    const next = previous
      .slice(1)
      .map((subject) =>
        subject.id === "resource-90"
          ? { ...subject, x: 500, z: -400, radius: 7 }
          : subject,
      );
    next.push({ ...well(100), x: -600, z: 500 });
    const transition = fieldTransition(previous, next);
    expect(transition.population).toBe(92);
    expect(
      transition.footprints.filter((subject) => subject.id === "resource-90"),
    ).toHaveLength(2);
    expect(
      transition.footprints.some((subject) => subject.id === "resource-0"),
    ).toBe(true);
    expect(
      transition.footprints.some((subject) => subject.id === "resource-100"),
    ).toBe(true);
    expect(transition.bounds).toEqual(fieldBounds([...previous, ...next]));
    expect(transition.key).toBe(
      fieldTransition([...previous].reverse(), [...next].reverse()).key,
    );
    const moved = next.find((subject) => subject.id === "resource-90")!;
    const old = previous[90]!;
    expect(transition.bounds.x + transition.bounds.width / 2).toBeGreaterThan(
      moved.x + moved.radius,
    );
    expect(transition.bounds.x - transition.bounds.width / 2).toBeLessThan(
      old.x - old.radius,
    );
  });
  it("keeps genuine exiting GPU fields until they fade rather than deduplicating by position", () => {
    const a = { ...well(0), x: 0, z: 0, depth: 3 };
    const b = { ...well(1), x: 0, z: 0, depth: 0.01 };
    const transition = fieldTransition([a, b], [a]);
    expect(transition.population).toBe(2);
    const packed = packField(transition.footprints, 64, color, attention);
    expect(packed.count).toBe(2);
    expect(packed.data[15]).toBe(Math.fround(b.depth));
    expect(fieldTransition([a, b], []).footprints).toHaveLength(2);
    expect(fieldTransition([], []).population).toBe(0);
  });
});

describe("swept field bounds", () => {
  it("covers interior radius/aspect peaks without double-counting the identity", () => {
    const previous = { ...well(10), x: -24, z: 0.3, radius: 1, aspect: 10 };
    const next = { ...previous, x: 24, radius: 10, aspect: 1 };
    const transition = fieldTransition([previous], [next]);
    expect(transition.population).toBe(1);
    for (const t of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      const x = previous.x + (next.x - previous.x) * t;
      const radius = previous.radius + (next.radius - previous.radius) * t;
      const aspect = previous.aspect + (next.aspect - previous.aspect) * t;
      const extent = radius * Math.max(1, aspect) * 4 * 1.3;
      expect(
        transition.bounds.x - transition.bounds.width / 2,
      ).toBeLessThanOrEqual(x - extent);
      expect(
        transition.bounds.x + transition.bounds.width / 2,
      ).toBeGreaterThanOrEqual(x + extent);
    }
    expect(fieldTransition([previous], [{ ...previous }]).bounds).toEqual(
      fieldBounds([previous]),
    );
  });
});
