import * as THREE from "three";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { parentWellId, surfaceHeight } from "./model";
import type { Palette, Well } from "./model";

export type TetherPath = {
  parentId: string;
  /** The connected member; null for an orbit arc or a pool's hub ring. */
  childId: string | null;
  points: { x: number; z: number }[];
};

const reach = (well: Well) => well.radius * Math.max(1, well.aspect) * 1.08;
const STEP = 0.14;

function segment(
  a: { x: number; z: number },
  b: { x: number; z: number },
): { x: number; z: number }[] {
  const steps = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / STEP));
  return Array.from({ length: steps + 1 }, (_, index) => ({
    x: a.x + ((b.x - a.x) * index) / steps,
    z: a.z + ((b.z - a.z) * index) / steps,
  }));
}

function arc(
  center: { x: number; z: number },
  radius: number,
  from: number,
  to: number,
): { x: number; z: number }[] {
  const steps = Math.max(2, Math.ceil(((to - from) * radius) / STEP));
  return Array.from({ length: steps + 1 }, (_, index) => {
    const angle = from + ((to - from) * index) / steps;
    return {
      x: center.x + Math.cos(angle) * radius,
      z: center.z + Math.sin(angle) * radius,
    };
  });
}

/** Every visible member is tied to its visible parent. The innermost ring gets
 * spokes from the parent's rim (or a pool's open hub, or the pool member at its
 * centre); each ring of two or more members is joined by orbit arcs between
 * neighbours. Rings are concentric, so spokes never cross another member.
 */
export function tetherPaths(wells: readonly Well[]): TetherPath[] {
  const byId = new Map(wells.map((well) => [well.id, well]));
  const children = new Map<string, Well[]>();
  for (const well of wells) {
    const parent = parentWellId(well);
    if (!parent || !byId.has(parent)) continue;
    const siblings = children.get(parent) ?? [];
    siblings.push(well);
    children.set(parent, siblings);
  }
  const paths: TetherPath[] = [];
  for (const [parentId, members] of [...children].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const parent = byId.get(parentId)!;
    const distance = (well: Well) =>
      Math.hypot(well.x - parent.x, well.z - parent.z);
    const tolerance = Math.max(0.01, parent.radius * 0.002);
    const central = members.find((well) => distance(well) < tolerance);
    const hub = central
      ? reach(central)
      : parent.pool
        ? Math.max(0.12, parent.radius * 0.08)
        : reach(parent);
    const orbiting = members
      .filter((well) => well !== central)
      .sort((a, b) => distance(a) - distance(b) || a.id.localeCompare(b.id));
    const rings: Well[][] = [];
    for (const well of orbiting) {
      const ring = rings.at(-1);
      if (ring && Math.abs(distance(ring[0]!) - distance(well)) < tolerance * 5)
        ring.push(well);
      else rings.push([well]);
    }
    if (!rings.length) continue;
    if (parent.pool && !central)
      paths.push({
        parentId,
        childId: null,
        points: arc(parent, hub, 0, Math.PI * 2),
      });
    for (const well of rings[0]!) {
      const length = distance(well);
      if (hub + reach(well) >= length) continue;
      const x = (well.x - parent.x) / length,
        z = (well.z - parent.z) / length;
      paths.push({
        parentId,
        childId: well.id,
        points: segment(
          { x: parent.x + x * hub, z: parent.z + z * hub },
          {
            x: well.x - x * reach(well),
            z: well.z - z * reach(well),
          },
        ),
      });
    }
    for (const ring of rings) {
      if (ring.length < 2) continue;
      const radius =
        ring.reduce((sum, well) => sum + distance(well), 0) / ring.length;
      const placed = ring
        .map((well) => ({
          angle: Math.atan2(well.z - parent.z, well.x - parent.x),
          half: Math.asin(Math.min(1, reach(well) / radius)),
        }))
        .sort((a, b) => a.angle - b.angle);
      placed.forEach((item, index) => {
        const next = placed[(index + 1) % placed.length]!;
        const end =
          next.angle + (index === placed.length - 1 ? Math.PI * 2 : 0);
        const from = item.angle + item.half,
          to = end - next.half;
        if (to - from > 0.02)
          paths.push({
            parentId,
            childId: null,
            points: arc(parent, radius, from, to),
          });
      });
    }
  }
  return paths;
}

/** Draped tether lines. They are rebuilt once the layout settles and hidden
 * while basins move, so a stale line never cuts across a moving basin. Showing
 * or hiding costs one frame; there is no fade that would keep the scene drawing.
 */
export class TetherRenderer {
  readonly group = new THREE.Group();
  // Opaque: overlapping round joints of translucent segments would bead.
  private material = new LineMaterial({
    vertexColors: true,
    depthWrite: false,
    linewidth: 1.5,
  });
  private lines: LineSegments2 | null = null;
  private key = "";
  private built: {
    wells: readonly Well[];
    palette: Palette;
    night: boolean;
  } | null = null;

  constructor() {
    this.group.renderOrder = 2;
  }

  resize(width: number, height: number) {
    this.material.resolution.set(width, height);
  }

  /** Returns true when the lines changed and the scene needs one more frame. */
  update(
    wells: readonly Well[],
    settled: boolean,
    palette: Palette,
    night: boolean,
  ): boolean {
    let rebuilt = false;
    // Inputs change only on a renderer update; compare cheaply every frame and
    // rebuild only when the settled geometry or colours actually differ.
    const built = this.built;
    if (
      settled &&
      (built?.wells !== wells ||
        built.palette !== palette ||
        built.night !== night)
    ) {
      this.built = { wells, palette, night };
      const key = JSON.stringify([
        night,
        wells.map((well) => [
          well.id,
          parentWellId(well),
          well.x,
          well.z,
          well.radius,
          well.aspect,
          well.depth,
          well.elevation,
          well.profile,
          palette[well.sector],
        ]),
      ]);
      if (key !== this.key) {
        this.key = key;
        this.rebuild(wells, palette, night);
        rebuilt = true;
      }
    }
    const visible = settled && !!this.lines;
    const changed = rebuilt || visible !== this.group.visible;
    this.group.visible = visible;
    return changed;
  }

  private rebuild(wells: readonly Well[], palette: Palette, night: boolean) {
    if (this.lines) {
      this.group.remove(this.lines);
      this.lines.geometry.dispose();
      this.lines = null;
    }
    const paths = tetherPaths(wells);
    if (!paths.length) return;
    const byId = new Map(wells.map((well) => [well.id, well]));
    const positions: number[] = [],
      colors: number[] = [];
    // Muted toward the ground so opaque lines stay quieter than basin rims.
    const ground = new THREE.Color(night ? 0x1a2c38 : 0xc9d3d4);
    const light = new THREE.Color(night ? 0xd8e8ec : 0x2a4654);
    // Basins far from a cluster's tethers cannot change their surface by a
    // visible amount, so each cluster samples heights from nearby basins only.
    const spans = new Map<string, number>();
    for (const path of paths) {
      const parent = byId.get(path.parentId)!;
      for (const point of path.points)
        spans.set(
          path.parentId,
          Math.max(
            spans.get(path.parentId) ?? 0,
            Math.hypot(point.x - parent.x, point.z - parent.z),
          ),
        );
    }
    const local = new Map<string, Well[]>();
    for (const path of paths) {
      const parent = byId.get(path.parentId)!;
      let nearby = local.get(path.parentId);
      if (!nearby) {
        const span = spans.get(path.parentId)!;
        nearby = wells.filter(
          (well) =>
            Math.hypot(well.x - parent.x, well.z - parent.z) <
            span + well.radius * Math.max(1, well.aspect) * 4.5 + 1,
        );
        local.set(path.parentId, nearby);
      }
      const color = new THREE.Color(palette[parent.sector] ?? palette.reporting)
        .lerp(light, 0.35)
        .lerp(ground, night ? 0.38 : 0.3);
      const lifted = path.points.map((point) => [
        point.x,
        surfaceHeight(point.x, point.z, nearby) + 0.1,
        point.z,
      ]);
      for (let index = 1; index < lifted.length; index++) {
        positions.push(...lifted[index - 1]!, ...lifted[index]!);
        colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
      }
    }
    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(positions);
    geometry.setColors(colors);
    this.lines = new LineSegments2(geometry, this.material);
    this.lines.frustumCulled = false;
    this.group.add(this.lines);
  }

  dispose() {
    this.lines?.geometry.dispose();
    this.material.dispose();
  }
}
