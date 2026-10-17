import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { PerspectiveCamera, Vector3, type BufferGeometry } from "three";
import { basinGeometry, basinGeometryWindow } from "./basin-geometry";
import { fieldBounds, fieldTransition } from "./field";
import { surfaceHeight, type Well } from "./model";

const basin = (id = "basin", patch: Partial<Well> = {}): Well => ({
  id,
  label: id,
  kind: "host",
  hostId: null,
  sector: "test",
  x: 0,
  z: 0,
  radius: 2,
  depth: 4,
  aspect: 1,
  angle: 0,
  elevation: 0.7,
  profile: 1.1,
  attention: false,
  ...patch,
});

function sampler(geometry: BufferGeometry, wells: Well[]) {
  const position = geometry.attributes.position!;
  const heights = Array.from({ length: position.count }, (_, i) =>
    surfaceHeight(position.getX(i), position.getZ(i), wells),
  );
  const index = geometry.index!;
  const triangles = Array.from({ length: index.count / 3 }, (_, i) => {
    const [a, b, c] = [
      index.getX(i * 3),
      index.getX(i * 3 + 1),
      index.getX(i * 3 + 2),
    ];
    return {
      a: a!,
      b: b!,
      c: c!,
      minX: Math.min(position.getX(a!), position.getX(b!), position.getX(c!)),
      maxX: Math.max(position.getX(a!), position.getX(b!), position.getX(c!)),
      minZ: Math.min(position.getZ(a!), position.getZ(b!), position.getZ(c!)),
      maxZ: Math.max(position.getZ(a!), position.getZ(b!), position.getZ(c!)),
    };
  });
  return (x: number, z: number) => {
    for (const { a, b, c, minX, maxX, minZ, maxZ } of triangles) {
      if (
        x < minX - 1e-6 ||
        x > maxX + 1e-6 ||
        z < minZ - 1e-6 ||
        z > maxZ + 1e-6
      )
        continue;
      const ax = position.getX(a),
        az = position.getZ(a),
        bx = position.getX(b),
        bz = position.getZ(b),
        cx = position.getX(c),
        cz = position.getZ(c);
      const determinant = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / determinant;
      const v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / determinant;
      if (u >= -1e-6 && v >= -1e-6 && u + v <= 1 + 1e-6)
        return u * heights[a]! + v * heights[b]! + (1 - u - v) * heights[c]!;
    }
    throw new Error("A sample fell through the joined terrain.");
  };
}

function deviation(
  geometry: BufferGeometry,
  wells: Well[],
  subject: Well,
  pose: number[],
) {
  const camera = new PerspectiveCamera(40, 1200 / 900, 0.1, 2000);
  camera.position.set(pose[0]!, pose[1]!, pose[2]!);
  camera.lookAt(subject.x, -1, subject.z);
  camera.updateMatrixWorld();
  const height = sampler(geometry, wells);
  let maximum = 0;
  let compared = 0;
  for (const radius of [
    0, 0.2, 0.45, 0.7, 0.9, 1, 1.05, 1.08, 1.2, 1.5, 1.8, 2.5, 3.5,
  ])
    for (let i = 0; i < 64; i++) {
      const angle = (i * Math.PI * 2) / 64;
      const dx = Math.cos(angle) * radius * subject.radius * subject.aspect,
        dz = Math.sin(angle) * radius * subject.radius;
      const x =
          subject.x +
          dx * Math.cos(subject.angle) -
          dz * Math.sin(subject.angle),
        z =
          subject.z +
          dx * Math.sin(subject.angle) +
          dz * Math.cos(subject.angle);
      const actual = new Vector3(x, height(x, z), z).project(camera);
      const expected = new Vector3(x, surfaceHeight(x, z, wells), z).project(
        camera,
      );
      if (
        expected.z < -1 ||
        expected.z > 1 ||
        Math.abs(expected.x) > 1 ||
        Math.abs(expected.y) > 1
      )
        continue;
      compared++;
      maximum = Math.max(
        maximum,
        Math.hypot(
          (actual.x - expected.x) * 600,
          (actual.y - expected.y) * 450,
        ),
      );
    }
  expect(compared).toBeGreaterThan(64);
  return maximum;
}

describe("joined local basin geometry", () => {
  it.each([
    ["circular", 1, 0],
    ["rotated elliptical", 1.7, 0.73],
    ["narrow elliptical", 0.55, 1.1],
  ] as const)(
    "keeps sampled %s surface deviation below two CSS pixels in overview, close and oblique views",
    (_name, aspect, angle) => {
      const subject = basin("subject", { aspect, angle });
      const wells = [subject];
      const plan = basinGeometry(wells);
      try {
        expect(plan.detailScale).toBe(1);
        for (const pose of [
          [7, 10, 12],
          [3, 5, 6],
          [5, 3, 8],
        ])
          expect(
            deviation(plan.geometry, wells, subject, pose),
          ).toBeLessThanOrEqual(2);
      } finally {
        plan.geometry.dispose();
      }
    },
  );
  it("fails the same analytic comparison when local samples are removed", () => {
    const wells = [basin()];
    const coarse = basinGeometry(wells, fieldBounds(wells), 4);
    try {
      expect(
        deviation(coarse.geometry, wells, wells[0]!, [3, 5, 6]),
      ).toBeGreaterThan(20);
      expect(coarse.detailScale).toBeGreaterThan(1);
      expect(coarse.basins).toBe(1);
    } finally {
      coarse.geometry.dispose();
    }
  });
  it("shares every internal edge, has no overlapping floor and basin layers and covers the entire floor", () => {
    const wells = [
      basin("outer"),
      basin("child", {
        x: 0.8,
        z: 0.3,
        radius: 0.35,
        depth: 0.8,
        kind: "service",
        hostId: "outer",
      }),
    ];
    const plan = basinGeometry(wells);
    try {
      const index = plan.geometry.index!,
        position = plan.geometry.attributes.position!;
      const edges = new Map<string, number>();
      let area = 0;
      for (let i = 0; i < index.count; i += 3) {
        const a = index.getX(i),
          b = index.getX(i + 1),
          c = index.getX(i + 2);
        const signed =
          (position.getZ(b) - position.getZ(a)) *
            (position.getX(c) - position.getX(a)) -
          (position.getX(b) - position.getX(a)) *
            (position.getZ(c) - position.getZ(a));
        expect(signed).toBeGreaterThan(0);
        area += signed / 2;
        for (const [from, to] of [
          [a, b],
          [b, c],
          [c, a],
        ]) {
          const key = Math.min(from!, to!) + ":" + Math.max(from!, to!);
          edges.set(key, (edges.get(key) ?? 0) + 1);
        }
      }
      for (const [key, count] of edges) {
        expect(count).toBeLessThanOrEqual(2);
        if (count === 2) continue;
        const [a, b] = key.split(":").map(Number);
        const x = position.getX(a!),
          z = position.getZ(a!);
        expect(
          (x === position.getX(b!) &&
            (Math.abs(x - plan.bounds.minX) < 1e-4 ||
              Math.abs(x - plan.bounds.maxX) < 1e-4)) ||
            (z === position.getZ(b!) &&
              (Math.abs(z - plan.bounds.minZ) < 1e-4 ||
                Math.abs(z - plan.bounds.maxZ) < 1e-4)),
        ).toBe(true);
      }
      expect(area).toBeCloseTo(
        (plan.bounds.maxX - plan.bounds.minX) *
          (plan.bounds.maxZ - plan.bounds.minZ),
        2,
      );
      expect(plan.bytes).toBe(
        position.array.byteLength + index.array.byteLength,
      );
      const height = sampler(plan.geometry, wells);
      expect(
        Math.abs(height(0.8, 0.3) - surfaceHeight(0.8, 0.3, wells)),
      ).toBeLessThan(0.025);
    } finally {
      plan.geometry.dispose();
    }
  });
  it("retains all 257 active basin identities under genuine sampling pressure", () => {
    const wells = Array.from({ length: 257 }, (_, i) =>
      basin("active-" + i, { x: (i % 17) * 9, z: Math.floor(i / 17) * 9 }),
    );
    const plan = basinGeometry(wells, fieldBounds(wells), 8000);
    try {
      expect(plan.basins).toBe(257);
      expect(plan.leaves).toBeLessThanOrEqual(8000);
      expect(plan.detailScale).toBeGreaterThan(1);
      expect(plan.bounds.maxX).toBeGreaterThan(wells.at(-1)!.x);
      const last = wells.at(-1)!;
      expect(
        Number.isFinite(sampler(plan.geometry, wells)(last.x, last.z)),
      ).toBe(true);
    } finally {
      plan.geometry.dispose();
    }
  });
  it("covers moved footprints and actual fading wells without spending twice on unchanged identities", () => {
    const a = basin("a"),
      b = basin("b", { x: 12, depth: 0.01 });
    const transition = fieldTransition(
      [a, b],
      [{ ...a, x: -12 }, basin("entering", { x: 20 })],
    );
    const plan = basinGeometry(transition.footprints, transition.bounds);
    try {
      expect(plan.basins).toBe(3);
      expect(plan.bounds.minX).toBeLessThan(-12);
      expect(plan.bounds.maxX).toBeGreaterThan(20);
    } finally {
      plan.geometry.dispose();
    }
  });
  it("keeps a translating basin refined throughout its interpolation path", () => {
    const previous = basin("moving", { x: -24, z: 0.3 });
    const next = { ...previous, x: 24 };
    const transition = fieldTransition([previous], [next]);
    const plan = basinGeometry(transition.footprints, transition.bounds);
    try {
      expect(transition.population).toBe(1);
      expect(plan.detailScale).toBe(1);
      for (const progress of [0.51875, 0.05, 0.25, 0.5, 0.75, 0.95]) {
        const current = {
          ...previous,
          x: previous.x + (next.x - previous.x) * progress,
        };
        const height = sampler(plan.geometry, [current]);
        expect(
          Math.abs(
            height(current.x, current.z) -
              surfaceHeight(current.x, current.z, [current]),
          ),
        ).toBeLessThan(0.025);
        expect(
          deviation(plan.geometry, [current], current, [
            current.x + 3,
            5,
            current.z + 6,
          ]),
        ).toBeLessThanOrEqual(2);
      }
    } finally {
      plan.geometry.dispose();
    }
  });
  it("covers moving, rotating elliptical shapes between endpoint footprints", () => {
    const previous = basin("changing", { x: -6, z: 0.3, aspect: 1.5 });
    const next = { ...previous, x: 6, z: 3.7, aspect: 0.8, angle: 1.2 };
    const transition = fieldTransition([previous], [next]);
    const plan = basinGeometry(transition.footprints, transition.bounds);
    try {
      expect(transition.population).toBe(1);
      expect(plan.basins).toBe(1);
      for (const t of [0.25, 0.5, 0.75]) {
        const current = {
          ...previous,
          x: previous.x + (next.x - previous.x) * t,
          z: previous.z + (next.z - previous.z) * t,
          aspect: previous.aspect + (next.aspect - previous.aspect) * t,
          angle: next.angle * t,
        };
        expect(
          deviation(plan.geometry, [current], current, [
            current.x + 3,
            5,
            current.z + 6,
          ]),
        ).toBeLessThanOrEqual(2);
      }
    } finally {
      plan.geometry.dispose();
    }
  });
  it("bounds planning work before refining all 257 active identities", () => {
    const wells = Array.from({ length: 257 }, (_, i) =>
      basin("budget-" + i, { x: (i % 17) * 9, z: Math.floor(i / 17) * 9 }),
    );
    const plan = basinGeometry(wells);
    const exhausted = basinGeometry(wells, fieldBounds(wells), 4);
    try {
      expect(plan.basins).toBe(257);
      expect(plan.planningPasses).toBe(1);
      expect(plan.planningCandidates).toBeLessThanOrEqual(plan.planningBudget);
      expect(plan.planningVisits).toBeLessThanOrEqual(plan.planningBudget);
      expect(plan.leaves).toBeLessThanOrEqual(120_000);
      expect(plan.detailScale).toBeGreaterThan(1);
      expect(exhausted.basins).toBe(257);
      expect(exhausted.planningPasses).toBe(1);
      expect(exhausted.planningCandidates).toBe(exhausted.planningBudget);
      expect(exhausted.quality).toBe("uniform-pressure");
      expect(exhausted.leaves).toBeLessThanOrEqual(4);
    } finally {
      plan.geometry.dispose();
      exhausted.geometry.dispose();
    }
  });
  it("uses an exact local triangle subset for the lens with independently owned buffers", () => {
    const wells = Array.from({ length: 49 }, (_, i) =>
      basin("lens-" + i, { x: (i % 7) * 12, z: Math.floor(i / 7) * 12 }),
    );
    const plan = basinGeometry(wells);
    const center = wells[24]!;
    const lens = basinGeometryWindow(plan.geometry, {
      minX: center.x - 10,
      maxX: center.x + 10,
      minZ: center.z - 10,
      maxZ: center.z + 10,
    });
    try {
      const original = plan.geometry.attributes.position!,
        local = lens.attributes.position!;
      expect(local).not.toBe(original);
      expect(local.array).not.toBe(original.array);
      expect(local.count).toBeLessThan(original.count / 4);
      const known = new Set(
        Array.from({ length: original.count }, (_, i) =>
          [original.getX(i), original.getY(i), original.getZ(i)].join(":"),
        ),
      );
      for (let i = 0; i < local.count; i++)
        expect(
          known.has([local.getX(i), local.getY(i), local.getZ(i)].join(":")),
        ).toBe(true);
      const overviewHeight = sampler(plan.geometry, wells),
        lensHeight = sampler(lens, wells);
      for (const x of [-8, 0, 8])
        for (const z of [-8, 0, 8])
          expect(lensHeight(center.x + x, center.z + z)).toBe(
            overviewHeight(center.x + x, center.z + z),
          );
    } finally {
      lens.dispose();
      plan.geometry.dispose();
    }
  });
  it("handles an empty landscape and rejects malformed geometry without a silent identity drop", () => {
    const empty = basinGeometry([]);
    expect(empty.basins).toBe(0);
    expect(empty.geometry.index!.count).toBeGreaterThan(0);
    empty.geometry.dispose();
    expect(() => basinGeometry([basin("invalid", { radius: 0 })])).toThrow(
      RangeError,
    );
    expect(() => basinGeometry([basin("invalid", { x: NaN })])).toThrow(
      RangeError,
    );
    expect(() => basinGeometry([], fieldBounds([]), 0)).toThrow(RangeError);
  });
});

// Captured from the pre-correction planner, before adding view refinement.
describe("ordinary terrain byte compatibility", () => {
  it.each([
    [1, "c9d57d4cfd2637263b480816242c7db081a6dd64111fa8a5713c1317a96d2086"],
    [2, "db6caf37bae8c8083a55d76bee8fe8652c4440338b2df182c05fb673c8a907fd"],
    [3, "32ffe70d459ef7572be2c9e33ab193d02bafa21542a9f9409fd489aad13fc47e"],
    [4, "cb104d6142b288e20a67e41c67d8d2a30967d60f87385ab8dd26da48f66c5166"],
    [5, "f69e60f8142fdbe50102eb8396d6f4d71aa7519bd775a8ad9ae9fe59d10afd2b"],
    [6, "b711f3fab08a4e0bf324518d46329ba91d93fca78395d19774e85b5ec37f2730"],
    [7, "a4c89988fbc796ac07d6b23a75676dff196d430d2fbf75a0371aa4d301c6a2c3"],
  ] as const)(
    "retains the original %i-basin positions and topology hash",
    (count, hash) => {
      const wells = Array.from({ length: count }, (_, i) =>
        basin("ordinary-" + i, {
          x: i * 9,
          z: (i % 2) * 7,
          aspect: i % 2 ? 1.7 : 1,
          angle: i * 0.23,
        }),
      );
      const plan = basinGeometry(wells);
      try {
        expect(
          createHash("sha256")
            .update(
              new Uint8Array(plan.geometry.attributes.position!.array.buffer),
            )
            .update(new Uint8Array(plan.geometry.index!.array.buffer))
            .digest("hex"),
        ).toBe(hash);
      } finally {
        plan.geometry.dispose();
      }
    },
  );
});
