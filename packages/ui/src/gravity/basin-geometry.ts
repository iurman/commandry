import { BufferAttribute, BufferGeometry } from "three";
import { fieldBounds } from "./field";
import type { Well } from "./model";

type Extent = ReturnType<typeof fieldBounds>;
type Cell = { x: number; z: number; size: number };
export type BasinGeometry = {
  geometry: BufferGeometry;
  leaves: number;
  basins: number;
  detailScale: number;
  bytes: number;
  planningVisits: number;
  planningCandidates: number;
  planningBudget: number;
  planningPasses: number;
  quality: "local" | "uniform-pressure";
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
};

const grid = 2 ** 24;
const lowerBound = (values: number[], value: number) => {
  let start = 0,
    end = values.length;
  while (start < end) {
    const middle = (start + end) >>> 1;
    if (values[middle]! < value) start = middle + 1;
    else end = middle;
  }
  return start;
};

// One joined mesh replaces overlapping basin patches. Local refinement follows the
// analytic ellipses; every T-junction shares vertices with both neighbouring cells.
// The shader still samples the complete field, including all fading contributions.
export function basinGeometry(
  footprints: readonly Well[],
  extent: Extent = fieldBounds(footprints),
  maximumLeaves = 120_000,
): BasinGeometry {
  if (!Number.isInteger(maximumLeaves) || maximumLeaves < 4)
    throw new RangeError("The terrain leaf budget must be at least four.");
  for (const well of footprints)
    if (
      ![well.x, well.z, well.radius, well.aspect, well.angle, well.depth].every(
        Number.isFinite,
      ) ||
      well.radius <= 0 ||
      well.aspect <= 0
    )
      throw new RangeError(
        "Basin footprints must have finite positions and positive axes.",
      );
  const span = Math.max(extent.width, extent.depth) + extent.apron * 2;
  if (
    !Number.isFinite(span) ||
    span <= 0 ||
    !Number.isFinite(extent.x) ||
    !Number.isFinite(extent.z)
  )
    throw new RangeError("Terrain bounds must be finite and nonempty.");
  const minX = extent.x - span / 2,
    minZ = extent.z - span / 2;
  const unit = span / grid;
  const identities = new Map<string, Well[]>();
  for (const well of footprints) {
    const shapes = identities.get(well.id) ?? [];
    shapes.push(well);
    identities.set(well.id, shapes);
  }
  // Repeated IDs describe the same basin at different points in a transition.
  // A capsule along the center path covers every interpolated rotation and axis.
  const basins = [...identities.values()]
    .filter((shapes) => shapes.some((well) => Math.abs(well.depth) > 0.002))
    .map((shapes) => {
      const first = shapes[0]!;
      const minor =
        Math.min(...shapes.map((well) => well.radius)) *
        Math.min(1, ...shapes.map((well) => well.aspect));
      const major =
        Math.max(...shapes.map((well) => well.radius)) *
        Math.max(1, ...shapes.map((well) => well.aspect));
      const segments =
        shapes.length <= 2
          ? shapes.flatMap((from, i) =>
              shapes.slice(i + 1).map((to) => ({
                x: from.x,
                z: from.z,
                dx: to.x - from.x,
                dz: to.z - from.z,
                length2: (to.x - from.x) ** 2 + (to.z - from.z) ** 2,
              })),
            )
          : [];
      return {
        x: first.x,
        z: first.z,
        radius: first.radius,
        aspect: first.aspect,
        cosine: Math.cos(first.angle),
        sine: Math.sin(first.angle),
        minor,
        major,
        segments,
        spread: shapes.length > 2,
        centerMinX: Math.min(...shapes.map((well) => well.x)),
        centerMaxX: Math.max(...shapes.map((well) => well.x)),
        centerMinZ: Math.min(...shapes.map((well) => well.z)),
        centerMaxZ: Math.max(...shapes.map((well) => well.z)),
        minX: Math.min(...shapes.map((well) => well.x)) - major * 6,
        maxX: Math.max(...shapes.map((well) => well.x)) + major * 6,
        minZ: Math.min(...shapes.map((well) => well.z)) - major * 6,
        maxZ: Math.max(...shapes.map((well) => well.z)) + major * 6,
      };
    });
  const background = Math.max(
    span / 64,
    Math.min(6, Math.max(extent.width, extent.depth) / 32),
  );
  let leaves: Cell[] = [];
  const estimatedLeaves =
    4096 +
    basins.reduce(
      (sum, basin) =>
        sum +
        12_000 * (basin.major / basin.minor) ** 2 +
        (700 *
          (basin.centerMaxX -
            basin.centerMinX +
            (basin.centerMaxZ - basin.centerMinZ)) *
          basin.major) /
          (basin.minor * basin.minor),
      0,
    );
  let detailScale =
    2 **
    Math.max(
      0,
      Math.ceil(Math.log2(Math.sqrt(estimatedLeaves / maximumLeaves))),
    );
  const planningBudget = Math.max(128, Math.min(1_000_000, maximumLeaves * 32));
  let planningVisits = 0,
    planningCandidates = 0;
  let quality: BasinGeometry["quality"] = "local";
  // Choose pressure reduction before visiting fine cells, then attempt only once.
  // A strict work cap gives unusual overlapping/swept shapes a complete coarse floor.
  {
    leaves = [];
    const subdivide = (
      x: number,
      z: number,
      size: number,
      candidates: typeof basins,
    ): boolean => {
      if (planningVisits >= planningBudget) return false;
      planningVisits++;
      const half = size / 2;
      const worldX = minX + (x + half) * unit,
        worldZ = minZ + (z + half) * unit;
      const worldSize = size * unit;
      let step = background * detailScale;
      const relevant: typeof basins = [];
      // Pass only intersecting candidates down the tree. Testing every basin in
      // every fine cell made dense planning quadratic in otherwise distant wells.
      for (const basin of candidates) {
        if (planningCandidates >= planningBudget) return false;
        planningCandidates++;
        const halfSize = worldSize / 2;
        if (
          worldX + halfSize < basin.minX ||
          worldX - halfSize > basin.maxX ||
          worldZ + halfSize < basin.minZ ||
          worldZ - halfSize > basin.maxZ
        )
          continue;
        relevant.push(basin);
        let distance2: number, reach: number;
        if (basin.spread) {
          const dx = Math.max(
            basin.centerMinX - worldX,
            0,
            worldX - basin.centerMaxX,
          );
          const dz = Math.max(
            basin.centerMinZ - worldZ,
            0,
            worldZ - basin.centerMaxZ,
          );
          distance2 = (dx * dx + dz * dz) / (basin.major * basin.major);
          reach = (worldSize * Math.SQRT1_2) / basin.major;
        } else if (basin.segments.length) {
          let nearest2 = Infinity;
          for (const segment of basin.segments) {
            const dx = worldX - segment.x,
              dz = worldZ - segment.z;
            const t = segment.length2
              ? Math.max(
                  0,
                  Math.min(
                    1,
                    (dx * segment.dx + dz * segment.dz) / segment.length2,
                  ),
                )
              : 0;
            nearest2 = Math.min(
              nearest2,
              (dx - t * segment.dx) ** 2 + (dz - t * segment.dz) ** 2,
            );
          }
          distance2 = nearest2 / (basin.major * basin.major);
          reach = (worldSize * Math.SQRT1_2) / basin.major;
        } else {
          const dx = worldX - basin.x,
            dz = worldZ - basin.z;
          distance2 =
            ((dx * basin.cosine + dz * basin.sine) /
              (basin.radius * basin.aspect)) **
              2 +
            ((-dx * basin.sine + dz * basin.cosine) / basin.radius) ** 2;
          reach = (worldSize * Math.SQRT1_2) / basin.minor;
        }
        const divisions =
          distance2 <= (1.8 + reach) ** 2
            ? 12
            : distance2 <= (3.5 + reach) ** 2
              ? 5
              : distance2 <= (6 + reach) ** 2
                ? 2
                : 0;
        if (divisions)
          step = Math.min(step, (basin.minor / divisions) * detailScale);
      }
      if (worldSize > step && size > 1) {
        return (
          subdivide(x, z, half, relevant) &&
          subdivide(x + half, z, half, relevant) &&
          subdivide(x, z + half, half, relevant) &&
          subdivide(x + half, z + half, half, relevant)
        );
      }
      leaves.push({ x, z, size });
      return leaves.length <= maximumLeaves;
    };
    if (!subdivide(0, 0, grid, basins)) {
      quality = "uniform-pressure";
      leaves = [];
      const cells =
        2 ** Math.floor(Math.log2(Math.sqrt(Math.min(maximumLeaves, 4096))));
      const size = grid / cells;
      for (let z = 0; z < cells; z++)
        for (let x = 0; x < cells; x++)
          leaves.push({ x: x * size, z: z * size, size });
      const minor = Math.min(...basins.map((basin) => basin.minor), 1);
      detailScale = Math.max(detailScale, ((span / cells) * 12) / minor);
    }
  }
  const horizontal = new Map<number, Set<number>>();
  const vertical = new Map<number, Set<number>>();
  const add = (map: Map<number, Set<number>>, key: number, value: number) => {
    let line = map.get(key);
    if (!line) {
      line = new Set();
      map.set(key, line);
    }
    line.add(value);
  };
  for (const cell of leaves)
    for (const x of [cell.x, cell.x + cell.size])
      for (const z of [cell.z, cell.z + cell.size]) {
        add(horizontal, z, x);
        add(vertical, x, z);
      }
  const rows = new Map(
    [...horizontal].map(([key, values]) => [
      key,
      [...values].sort((a, b) => a - b),
    ]),
  );
  const columns = new Map(
    [...vertical].map(([key, values]) => [
      key,
      [...values].sort((a, b) => a - b),
    ]),
  );
  const positions: number[] = [],
    indices: number[] = [];
  const vertices = new Map<string, number>();
  const vertex = (x: number, z: number) => {
    const key = x + ":" + z;
    let index = vertices.get(key);
    if (index === undefined) {
      index = positions.length / 3;
      positions.push(minX + x * unit, 0, minZ + z * unit);
      vertices.set(key, index);
    }
    return index;
  };
  const edge = (
    values: number[],
    from: number,
    to: number,
    fixed: number,
    row: boolean,
  ) => {
    const points: number[] = [];
    for (
      let i = lowerBound(values, Math.min(from, to));
      i < values.length && values[i]! <= Math.max(from, to);
      i++
    )
      points.push(row ? vertex(values[i]!, fixed) : vertex(fixed, values[i]!));
    return from < to ? points.slice(0, -1) : points.reverse().slice(0, -1);
  };
  for (const { x, z, size } of leaves) {
    const right = x + size,
      top = z + size;
    const boundary = [
      ...edge(columns.get(x)!, z, top, x, false),
      ...edge(rows.get(top)!, x, right, top, true),
      ...edge(columns.get(right)!, top, z, right, false),
      ...edge(rows.get(z)!, right, x, z, true),
    ];
    const center = vertex(x + size / 2, z + size / 2);
    for (let i = 0; i < boundary.length; i++)
      indices.push(center, boundary[i]!, boundary[(i + 1) % boundary.length]!);
  }
  const position = new Float32Array(positions),
    index = new Uint32Array(indices);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(position, 3));
  geometry.setIndex(new BufferAttribute(index, 1));
  return {
    geometry,
    leaves: leaves.length,
    basins: basins.length,
    detailScale,
    bytes: position.byteLength + index.byteLength,
    planningVisits,
    planningCandidates,
    planningBudget,
    planningPasses: 1,
    quality,
    bounds: { minX, maxX: minX + span, minZ, maxZ: minZ + span },
  };
}

// Copy the existing triangles intersecting the lens window. Positions remain
// bit-identical to the overview, while copied buffers have independent lifetimes.
export function basinGeometryWindow(
  source: BufferGeometry,
  bounds: BasinGeometry["bounds"],
): BufferGeometry {
  const position = source.attributes.position,
    index = source.index;
  if (!position || !index)
    throw new RangeError("A lens window requires indexed terrain.");
  const positions: number[] = [],
    indices: number[] = [];
  const remap = new Map<number, number>();
  const vertex = (original: number) => {
    let mapped = remap.get(original);
    if (mapped === undefined) {
      mapped = positions.length / 3;
      positions.push(
        position.getX(original),
        position.getY(original),
        position.getZ(original),
      );
      remap.set(original, mapped);
    }
    return mapped;
  };
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i),
      b = index.getX(i + 1),
      c = index.getX(i + 2);
    if (
      Math.max(position.getX(a), position.getX(b), position.getX(c)) <
        bounds.minX ||
      Math.min(position.getX(a), position.getX(b), position.getX(c)) >
        bounds.maxX ||
      Math.max(position.getZ(a), position.getZ(b), position.getZ(c)) <
        bounds.minZ ||
      Math.min(position.getZ(a), position.getZ(b), position.getZ(c)) >
        bounds.maxZ
    )
      continue;
    indices.push(vertex(a), vertex(b), vertex(c));
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array(positions), 3),
  );
  geometry.setIndex(new BufferAttribute(new Uint32Array(indices), 1));
  return geometry;
}
