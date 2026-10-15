import type { Well } from "./model";

export type Vector = { x: number; y: number; z: number };
export type Bounds = { center: Vector; half: Vector };
export type CameraPose = {
  position: Vector;
  target: Vector;
  featured: string | null;
};

export function landscapeBounds(wells: Well[]): Bounds {
  const hosts = wells.filter((well) => well.kind === "host");
  if (!hosts.length)
    return { center: { x: 0, y: 0, z: 0 }, half: { x: 10, y: 4, z: 10 } };
  let minX = Infinity,
    maxX = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  for (const well of hosts) {
    const footprint = well.radius * Math.max(1, well.aspect) * 1.7;
    minX = Math.min(minX, well.x - footprint);
    maxX = Math.max(maxX, well.x + footprint);
    minZ = Math.min(minZ, well.z - footprint);
    maxZ = Math.max(maxZ, well.z + footprint);
  }
  return {
    center: { x: (minX + maxX) / 2, y: 0, z: (minZ + maxZ) / 2 },
    half: { x: (maxX - minX) / 2, y: 5, z: (maxZ - minZ) / 2 },
  };
}

export function fittedPose(
  bounds: Bounds,
  aspect: number,
  azimuth = 0.18,
  elevation = 0.95,
): CameraPose {
  const direction = {
    x: Math.sin(azimuth) * Math.cos(elevation),
    y: Math.sin(elevation),
    z: Math.cos(azimuth) * Math.cos(elevation),
  };
  const right = { x: Math.cos(azimuth), y: 0, z: -Math.sin(azimuth) };
  const up = {
    x: -Math.sin(azimuth) * Math.sin(elevation),
    y: Math.cos(elevation),
    z: -Math.cos(azimuth) * Math.sin(elevation),
  };
  const tangent = Math.tan((40 * Math.PI) / 360);
  let distance = 0;
  for (const x of [-bounds.half.x, bounds.half.x])
    for (const y of [-bounds.half.y, bounds.half.y])
      for (const z of [-bounds.half.z, bounds.half.z]) {
        const depth = x * direction.x + y * direction.y + z * direction.z;
        distance = Math.max(
          distance,
          Math.abs(x * right.x + z * right.z) /
            (tangent * Math.max(0.2, aspect)) +
            depth,
          Math.abs(x * up.x + y * up.y + z * up.z) / tangent + depth,
        );
      }
  distance *= 1.18;
  return {
    target: { ...bounds.center },
    position: {
      x: bounds.center.x + direction.x * distance,
      y: bounds.center.y + direction.y * distance,
      z: bounds.center.z + direction.z * distance,
    },
    featured: null,
  };
}

export function presentationPose(
  wells: Well[],
  aspect: number,
  time: number,
  tour: boolean,
): CameraPose {
  const bounds = landscapeBounds(wells);
  const azimuth = 0.18 + time * (tour ? 0.045 : 0.025);
  const wide = fittedPose(
    bounds,
    aspect,
    azimuth,
    tour ? 0.23 : 0.23 + Math.sin(time * 0.08) * 0.025,
  );
  const hosts = wells
    .filter((well) => well.kind === "host")
    .sort(
      (a, b) =>
        Math.atan2(a.x - bounds.center.x, a.z - bounds.center.z) -
        Math.atan2(b.x - bounds.center.x, b.z - bounds.center.z),
    );
  if (!tour || !hosts.length) return wide;
  const cycle = time / 14;
  const host = hosts[Math.floor(cycle) % hosts.length]!;
  const blend = Math.sin((cycle % 1) * Math.PI) ** 2 * 0.88;
  const close = fittedPose(
    {
      center: { x: host.x, y: 0.2, z: host.z },
      half: {
        x: host.radius * host.aspect * 1.65,
        y: 3.5,
        z: host.radius * 1.65,
      },
    },
    aspect,
    azimuth,
    0.86,
  );
  const lerp = (a: Vector, b: Vector): Vector => ({
    x: a.x + (b.x - a.x) * blend,
    y: a.y + (b.y - a.y) * blend,
    z: a.z + (b.z - a.z) * blend,
  });
  return {
    position: lerp(wide.position, close.position),
    target: lerp(wide.target, close.target),
    featured: blend > 0.25 ? host.id : null,
  };
}
