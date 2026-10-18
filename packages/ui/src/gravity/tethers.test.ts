import { describe, expect, it } from "vitest";
import type { Well } from "./model";
import { TetherRenderer, tetherPaths } from "./tethers";

const well = (id: string, x: number, z: number, extra: Partial<Well> = {}) =>
  ({
    id,
    label: id,
    kind: "host",
    hostId: null,
    sector: "a",
    x,
    z,
    radius: 0.5,
    depth: 0.5,
    aspect: 1,
    angle: 0,
    elevation: 0,
    profile: 1,
    attention: false,
    ...extra,
  }) satisfies Well;
const ring = (parent: string, count: number, distance: number, from = 0) =>
  Array.from({ length: count }, (_, index) => {
    const angle = from + (index * Math.PI * 2) / count;
    return well(
      `${parent}-${distance}-${index}`,
      Math.cos(angle) * distance,
      Math.sin(angle) * distance,
      { hostId: parent },
    );
  });

describe("parent-member tethers", () => {
  it("ties every innermost member to its host rim and joins ring neighbours", () => {
    const host = well("host", 0, 0, { radius: 2 });
    const members = ring("host", 5, 4);
    const paths = tetherPaths([host, ...members]);
    const spokes = paths.filter((path) => path.childId);
    expect(spokes.map((path) => path.childId).sort()).toEqual(
      members.map((member) => member.id).sort(),
    );
    for (const spoke of spokes) {
      const [start, end] = [spoke.points[0]!, spoke.points.at(-1)!];
      // Rim to rim: the spoke never enters either basin.
      expect(Math.hypot(start.x, start.z)).toBeCloseTo(2 * 1.08, 5);
      const member = members.find((item) => item.id === spoke.childId)!;
      expect(Math.hypot(end.x - member.x, end.z - member.z)).toBeCloseTo(
        0.5 * 1.08,
        5,
      );
    }
    // One orbit arc between each pair of neighbours, all on the ring itself.
    const arcs = paths.filter((path) => !path.childId);
    expect(arcs).toHaveLength(5);
    for (const point of arcs.flatMap((arc) => arc.points))
      expect(Math.hypot(point.x, point.z)).toBeCloseTo(4, 5);
  });

  it("uses a pool's open hub, skips its central member and leaves outer rings as orbits", () => {
    const pool = well("pool", 10, 0, {
      radius: 9,
      pool: true,
      kind: "project",
    });
    const centre = well("centre", 10, 0, { hostId: "pool", radius: 2 });
    const inner = ring("pool", 6, 4).map((item) => ({
      ...item,
      x: item.x + 10,
    }));
    const outer = ring("pool", 12, 7).map((item) => ({
      ...item,
      x: item.x + 10,
    }));
    const withCentre = tetherPaths([pool, centre, ...inner, ...outer]);
    const spokes = withCentre.filter((path) => path.childId);
    // Only the innermost ring has spokes, starting at the central member's rim.
    expect(spokes.map((path) => path.childId).sort()).toEqual(
      inner.map((item) => item.id).sort(),
    );
    for (const spoke of spokes)
      expect(
        Math.hypot(spoke.points[0]!.x - 10, spoke.points[0]!.z),
      ).toBeCloseTo(2 * 1.08, 5);
    expect(withCentre.filter((path) => !path.childId)).toHaveLength(6 + 12);
    // Without a central member the spokes meet on a small hub ring.
    const open = tetherPaths([pool, ...inner]);
    const hub = open.find(
      (path) =>
        !path.childId &&
        path.points.every(
          (point) => Math.abs(Math.hypot(point.x - 10, point.z) - 0.72) < 1e-9,
        ),
    );
    const [first, last] = [hub!.points[0]!, hub!.points.at(-1)!];
    expect(Math.hypot(first.x - last.x, first.z - last.z)).toBeLessThan(1e-9);
    expect(open.filter((path) => path.childId)).toHaveLength(6);
  });

  it("ignores a lab host that names itself and members of hidden parents", () => {
    expect(
      tetherPaths([
        well("self", 0, 0, { hostId: "self" }),
        well("orphan", 3, 0, { hostId: "hidden" }),
      ]),
    ).toEqual([]);
  });
});

describe("tether renderer", () => {
  it("draws only settled basins, rebuilds on change and hides during movement", () => {
    const tethers = new TetherRenderer();
    const palette = {
      a: "#628faa",
      attention: "",
      reporting: "",
      unhealthy: "",
    };
    const wells = [well("host", 0, 0, { radius: 2 }), ...ring("host", 4, 4)];
    try {
      // The group starts visible but empty; moving basins hide it once.
      expect(tethers.update(wells, false, palette, true)).toBe(true);
      expect(tethers.group.visible).toBe(false);
      expect(tethers.group.children).toHaveLength(0);
      expect(tethers.update(wells, false, palette, true)).toBe(false);
      // Settled: one line set appears and asks for exactly one more frame.
      expect(tethers.update(wells, true, palette, true)).toBe(true);
      const first = tethers.group.children[0];
      expect(first).toBeDefined();
      expect(tethers.group.visible).toBe(true);
      expect(tethers.update(wells, true, palette, true)).toBe(false);
      // Unchanged geometry in a new array is not rebuilt.
      expect(tethers.update([...wells], true, palette, true)).toBe(false);
      expect(tethers.group.children[0]).toBe(first);
      // Moved geometry is rebuilt once settled.
      const moved = wells.map((item) => ({ ...item, x: item.x + 1 }));
      expect(tethers.update(moved, true, palette, true)).toBe(true);
      expect(tethers.group.children[0]).not.toBe(first);
      // A transition hides the lines again.
      expect(tethers.update(moved, false, palette, true)).toBe(true);
      expect(tethers.group.visible).toBe(false);
    } finally {
      tethers.dispose();
    }
  });
});
