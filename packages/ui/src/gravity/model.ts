export type ViewMode = "hosts" | "projects" | "custom";
export type SurfaceTheme = "porcelain" | "midnight";
export type SizeBasis = "capacity" | "services" | "uniform";
export type CameraMode = "composed" | "orbit" | "tour" | "manual";
export type SectorId = string;
export type Point = { x: number; z: number };
export type Palette = Record<SectorId, string> & {
  attention: string;
  reporting: string;
  unhealthy: string;
};
export type Well = Point & {
  id: string;
  label: string;
  kind: "host" | "service" | "project";
  hostId: string | null;
  sector: SectorId;
  radius: number;
  depth: number;
  aspect: number;
  angle: number;
  elevation: number;
  profile: number;
  attention: boolean;
  /** An aggregate basin whose floor encloses its nested members. */
  pool?: boolean;
};

/** The containing well, if any. Some layouts mark a top-level host as its own host. */
export const parentWellId = (well: Well) =>
  well.hostId && well.hostId !== well.id ? well.hostId : null;

/** Decorative floor swell outside the basins. */
export function floorSwell(x: number, z: number, time = 0, ambient = 0) {
  return (
    Math.sin(x * 0.14 + z * 0.11) * 0.55 +
    Math.cos(z * 0.18 - x * 0.09) * 0.35 +
    Math.sin(Math.hypot(x, z) * 0.7 - time * 0.35) *
      Math.cos(x * 0.12 + z * 0.09) *
      0.055 *
      ambient
  );
}

/** Basin relief and the calming weight each basin applies to the floor swell.
 * Without calming, a shallow basin's contours follow the swell instead of the
 * basin and read as stray lines crossing its rim.
 */
export function basinField(x: number, z: number, wells: readonly Well[]) {
  let height = 0,
    calm = 0;
  for (const well of wells) {
    const dx = x - well.x;
    const dz = z - well.z;
    const localX = dx * Math.cos(well.angle) + dz * Math.sin(well.angle);
    const localZ = -dx * Math.sin(well.angle) + dz * Math.cos(well.angle);
    const r2 =
      (localX / (well.radius * well.aspect)) ** 2 + (localZ / well.radius) ** 2;
    const strength = Math.min(1, well.depth);
    height += well.elevation * Math.exp(-r2 * 0.23) * strength;
    height -= well.depth * Math.exp(-(r2 ** well.profile) * 1.5);
    height +=
      0.13 *
      well.radius *
      Math.exp(-((Math.sqrt(r2) - 1.05) ** 2) * 12) *
      Math.min(1, well.depth);
    calm += Math.min(1, well.depth * 3) * 4 * Math.exp(-r2 * 0.9);
  }
  return { height, calm };
}

// Same height function is used by the GPU, DOM anchors, and event trajectories.
export function surfaceHeight(
  x: number,
  z: number,
  wells: readonly Well[],
  time = 0,
  ambient = 0,
): number {
  const field = basinField(x, z, wells);
  return floorSwell(x, z, time, ambient) * Math.exp(-field.calm) + field.height;
}
