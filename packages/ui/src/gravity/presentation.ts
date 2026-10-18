import { parentWellId, type Well } from "./model";

export type Vector = { x: number; y: number; z: number };
export type Bounds = { center: Vector; half: Vector };
export type CameraPose = {
  position: Vector;
  target: Vector;
  featured: string | null;
};

// Host mounds spread well past the basin; a pool's rim is its whole footprint.
const footprint = (well: Well) =>
  well.radius * Math.max(1, well.aspect) * (well.pool ? 1.15 : 1.7);

export function landscapeBounds(wells: Well[]): Bounds {
  if (!wells.length)
    return { center: { x: 0, y: 0, z: 0 }, half: { x: 10, y: 4, z: 10 } };
  let minX = Infinity,
    maxX = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  for (const well of wells) {
    const reach = footprint(well);
    minX = Math.min(minX, well.x - reach);
    maxX = Math.max(maxX, well.x + reach);
    minZ = Math.min(minZ, well.z - reach);
    maxZ = Math.max(maxZ, well.z + reach);
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
  subjects: Bounds[] = [bounds],
  /** Share of the stage height free of overlay panels to fit within. */
  band = 1,
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
  for (const subject of subjects)
    for (const sx of [-subject.half.x, subject.half.x])
      for (const sy of [-subject.half.y, subject.half.y])
        for (const sz of [-subject.half.z, subject.half.z]) {
          const x = subject.center.x + sx - bounds.center.x;
          const y = subject.center.y + sy - bounds.center.y;
          const z = subject.center.z + sz - bounds.center.z;
          const depth = x * direction.x + y * direction.y + z * direction.z;
          distance = Math.max(
            distance,
            Math.abs(x * right.x + z * right.z) /
              (tangent * Math.max(0.2, aspect)) +
              depth,
            Math.abs(x * up.x + y * up.y + z * up.z) / (tangent * band) + depth,
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

export function fittedLandscapePose(
  wells: Well[],
  aspect: number,
  azimuth = 0.18,
  elevation = 0.95,
  band = 1,
): CameraPose {
  const bounds = landscapeBounds(wells);
  const subjects = wells.map((well) => ({
    center: { x: well.x, y: 0, z: well.z },
    half: { x: footprint(well), y: 5, z: footprint(well) },
  }));
  // Fit every occupied footprint, including nested resources and sector fields.
  return fittedPose(
    bounds,
    aspect,
    azimuth,
    elevation,
    subjects.length ? subjects : [bounds],
    band,
  );
}

/** A subject and every visible well nested under it. */
function family(wells: Well[], subjectId: string): Well[] | null {
  if (!wells.some((well) => well.id === subjectId)) return null;
  const members = new Set([subjectId]);
  const children = new Map<string, Well[]>();
  for (const well of wells) {
    if (!well.hostId) continue;
    const siblings = children.get(well.hostId) ?? [];
    siblings.push(well);
    children.set(well.hostId, siblings);
  }
  const pending = [subjectId];
  while (pending.length) {
    for (const child of children.get(pending.pop()!) ?? []) {
      if (members.has(child.id)) continue;
      members.add(child.id);
      pending.push(child.id);
    }
  }
  return wells.filter((well) => members.has(well.id));
}

/** Fit one visible semantic subject and its nested render fields. `narrow`
 * fits it into that share of the stage width, leaving room beside it. */
export function focusedLandscapePose(
  wells: Well[],
  subjectId: string,
  aspect: number,
  narrow = 1,
  band = 1,
): CameraPose | null {
  const members = family(wells, subjectId);
  if (!members) return null;
  const pose = fittedLandscapePose(members, aspect * narrow, 0.28, 0.78, band);
  return { ...pose, featured: subjectId };
}

/** An orbit around one target: the camera looks at `target` from `distance`
 * along `elevation`; the azimuth turns separately. */
export type OrbitFrame = {
  target: Vector;
  distance: number;
  elevation: number;
};
export const ORBIT_ELEVATION = 0.7;
/** Radians per second: about three and a half minutes per revolution. */
export const ORBIT_RATE = 0.03;

/** Frame a subject for orbiting. The distance fits its family at every
 * azimuth, so the group does not breathe while the camera turns. */
export function orbitFrame(
  wells: Well[],
  subjectId: string,
  aspect: number,
  narrow = 1,
  elevation = ORBIT_ELEVATION,
  band = 1,
): OrbitFrame | null {
  const members = family(wells, subjectId);
  if (!members) return null;
  let distance = 0,
    target: Vector = { x: 0, y: 0, z: 0 };
  for (let step = 0; step < 8; step++) {
    const pose = fittedLandscapePose(
      members,
      aspect * narrow,
      (step * Math.PI) / 4,
      elevation,
      band,
    );
    target = pose.target;
    distance = Math.max(
      distance,
      Math.hypot(
        pose.position.x - pose.target.x,
        pose.position.y - pose.target.y,
        pose.position.z - pose.target.z,
      ),
    );
  }
  return { target, distance, elevation };
}

/** The camera pose for a frame at an azimuth. */
export function orbitPose(frame: OrbitFrame, azimuth: number): CameraPose {
  const { target, distance, elevation } = frame;
  return {
    target: { ...target },
    position: {
      x: target.x + Math.sin(azimuth) * Math.cos(elevation) * distance,
      y: target.y + Math.sin(elevation) * distance,
      z: target.z + Math.cos(azimuth) * Math.cos(elevation) * distance,
    },
    featured: null,
  };
}

/** The frame and azimuth an existing camera pose already has. */
export function frameOfPose(
  position: Vector,
  target: Vector,
): OrbitFrame & { azimuth: number } {
  const x = position.x - target.x,
    y = position.y - target.y,
    z = position.z - target.z;
  const distance = Math.max(1e-6, Math.hypot(x, y, z));
  return {
    target: { ...target },
    distance,
    elevation: Math.asin(Math.max(-1, Math.min(1, y / distance))),
    azimuth: Math.atan2(x, z),
  };
}

const smootherstep = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/** A crane move between two frames: the target glides, and the camera lifts
 * mid-way in proportion to the ground covered, so a long move reads as
 * travel across the landscape rather than a cut. `t` runs from 0 to 1. */
export function travelFrame(
  from: OrbitFrame,
  to: OrbitFrame,
  t: number,
): OrbitFrame {
  const clamped = Math.max(0, Math.min(1, t));
  const ease = smootherstep(clamped);
  const lerp = (a: number, b: number) => a + (b - a) * ease;
  const ground = Math.hypot(
    to.target.x - from.target.x,
    to.target.z - from.target.z,
  );
  const lift =
    Math.min(0.35, ground / Math.max(1e-6, from.distance + to.distance)) *
    Math.sin(Math.PI * clamped);
  return {
    target: {
      x: lerp(from.target.x, to.target.x),
      y: lerp(from.target.y, to.target.y),
      z: lerp(from.target.z, to.target.z),
    },
    distance: lerp(from.distance, to.distance) * (1 + lift),
    elevation: Math.min(1.45, lerp(from.elevation, to.elevation) + lift * 0.25),
  };
}

/** The slow whole-landscape orbit. */
export function presentationPose(
  wells: Well[],
  aspect: number,
  time: number,
  startAzimuth = 0.18,
  band = 1,
): CameraPose {
  return fittedLandscapePose(
    wells,
    aspect,
    startAzimuth + time * 0.025,
    0.23 + Math.sin(time * 0.08) * 0.025,
    band,
  );
}

/** Default presentation stops when a consumer names none: top-level hosts,
 * around the landscape. Nested guests are framed with their parent, and
 * repositories never become stops merely because they lack a parent. */
export function hostTourStops(wells: Well[]): string[] {
  const bounds = landscapeBounds(wells);
  const present = new Set(wells.map((well) => well.id));
  return wells
    .filter(
      (well) => well.kind === "host" && !present.has(parentWellId(well) ?? ""),
    )
    .sort(
      (a, b) =>
        Math.atan2(a.x - bounds.center.x, a.z - bounds.center.z) -
          Math.atan2(b.x - bounds.center.x, b.z - bounds.center.z) ||
        a.id.localeCompare(b.id),
    )
    .map((well) => well.id);
}
