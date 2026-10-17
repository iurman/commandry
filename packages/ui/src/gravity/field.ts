import type { Well } from "./model";

export type FieldColor = readonly [number, number, number];
export type PackedField = {
  data: Float32Array;
  width: number;
  height: number;
  columns: number;
  count: number;
  changed: boolean;
};

// Each well occupies three adjacent RGBA texels: position/depth, shape, color/attention.
export function packField(
  wells: readonly Well[],
  maxTextureSize: number,
  colorFor: (well: Well) => FieldColor,
  attentionFor: (well: Well) => number,
  previous?: PackedField,
): PackedField {
  const maxColumns = Math.floor(maxTextureSize / 3);
  const maximum = maxColumns * Math.floor(maxTextureSize);
  if (
    !Number.isInteger(maxTextureSize) ||
    maxColumns < 1 ||
    wells.length > maximum
  )
    throw new RangeError(
      `The complete field needs ${wells.length} records; this GPU's ${maxTextureSize}px texture limit supports ${maximum}.`,
    );
  let columns = previous?.columns ?? 0;
  let height = previous?.height ?? 0;
  let data = previous?.data;
  if (
    !data ||
    columns > maxColumns ||
    height > maxTextureSize ||
    columns * height < wells.length
  ) {
    const capacity = Math.min(
      maximum,
      Math.max(1, wells.length, columns * height * 2),
    );
    columns = Math.min(maxColumns, Math.ceil(Math.sqrt(capacity)));
    height = Math.ceil(capacity / columns);
    data = new Float32Array(columns * height * 12);
  }
  let changed = data !== previous?.data || wells.length !== previous?.count;
  const write = (index: number, value: number) => {
    const float = Math.fround(value);
    if (data[index] !== float) {
      data[index] = float;
      changed = true;
    }
  };
  wells.forEach((well, index) => {
    const offset = index * 12;
    const color = colorFor(well);
    write(offset, well.x);
    write(offset + 1, well.z);
    write(offset + 2, well.radius);
    write(offset + 3, well.depth);
    write(offset + 4, well.aspect);
    write(offset + 5, well.angle);
    write(offset + 6, well.elevation);
    write(offset + 7, well.profile);
    write(offset + 8, color[0]);
    write(offset + 9, color[1]);
    write(offset + 10, color[2]);
    write(offset + 11, attentionFor(well));
  });
  return {
    data,
    columns,
    width: columns * 3,
    height,
    count: wells.length,
    changed,
  };
}

export function fieldBounds(wells: readonly Well[]) {
  let minX = -34,
    maxX = 34,
    minZ = -29,
    maxZ = 29;
  const heights = new Map<string, number>();
  const dimensions = new Map<string, { radius: number; aspect: number }>();
  for (const well of wells) {
    const previous = dimensions.get(well.id);
    dimensions.set(well.id, {
      radius: Math.max(previous?.radius ?? 0, well.radius),
      aspect: Math.max(previous?.aspect ?? 1, well.aspect),
    });
  }
  for (const well of wells) {
    // Conservative through rotation and the 1.3x entry-radius transition.
    const shape = dimensions.get(well.id)!;
    // Radius and aspect can peak together between unlike endpoint shapes.
    const extent = shape.radius * Math.max(1, shape.aspect) * 4 * 1.3;
    minX = Math.min(minX, well.x - extent);
    maxX = Math.max(maxX, well.x + extent);
    minZ = Math.min(minZ, well.z - extent);
    maxZ = Math.max(maxZ, well.z + extent);
    heights.set(
      well.id,
      Math.max(
        heights.get(well.id) ?? 0,
        Math.abs(well.depth) + Math.abs(well.elevation) + well.radius * 0.13,
      ),
    );
  }
  const width = maxX - minX,
    depth = maxZ - minZ;
  return {
    x: (minX + maxX) / 2,
    z: (minZ + maxZ) / 2,
    width,
    depth,
    vertical:
      1 + [...heights.values()].reduce((sum, height) => sum + height, 0),
    apron: Math.max(90, Math.max(width, depth) * 0.35),
  };
}

// Bound field evaluations rather than dropping resources. Focus spends its budget locally.
export function fieldGeometry(
  population: number,
  width: number,
  depth: number,
  focus = false,
) {
  const evaluations = focus ? 2_000_000 : 3_000_000;
  const vertices = Math.max(
    4,
    Math.min(
      focus ? 65_000 : 137_000,
      Math.floor(evaluations / Math.max(1, population)),
    ),
  );
  const ratio = Math.max(0.25, Math.min(4, width / Math.max(0.001, depth)));
  const x = Math.max(
    1,
    Math.min(
      Math.floor(vertices / 2) - 1,
      Math.floor(Math.sqrt(vertices * ratio)) - 1,
    ),
  );
  const z = Math.max(1, Math.floor(vertices / (x + 1)) - 1);
  return { x, z, vertices: (x + 1) * (z + 1), evaluations };
}

const geometryFields = [
  "x",
  "z",
  "radius",
  "depth",
  "aspect",
  "angle",
  "elevation",
  "profile",
] as const;

// A moving identity can need both footprints, but consumes one contribution budget.
export function fieldTransition(
  previous: readonly Well[],
  next: readonly Well[],
) {
  const identities = new Set<string>();
  const shapes = new Set<string>();
  const footprints: Well[] = [];
  for (const well of [...previous, ...next]) {
    identities.add(well.id);
    const key = JSON.stringify([
      well.id,
      ...geometryFields.map((field) => well[field]),
    ]);
    if (!shapes.has(key)) {
      shapes.add(key);
      footprints.push(well);
    }
  }
  return {
    population: identities.size,
    footprints,
    bounds: fieldBounds(footprints),
    key: JSON.stringify([...shapes].sort()),
  };
}
