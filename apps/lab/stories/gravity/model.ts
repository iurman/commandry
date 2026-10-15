export type ViewMode = "hosts" | "projects" | "custom";
export type SurfaceTheme = "porcelain" | "midnight";
export type SizeBasis = "capacity" | "services" | "uniform";
export type CameraMode = "composed" | "orbit" | "tour" | "manual";
export type SectorId = "commandry" | "work" | "home";
export type Point = { x: number; z: number };
export type Palette = Record<SectorId, string> & {
  attention: string;
  reporting: string;
  unhealthy: string;
};
export type Host = {
  id: string;
  name: string;
  sector: SectorId;
  memory: number;
  disk: number;
  load: number;
  ramGiB: number;
  profile: "general" | "compute" | "storage";
  attention: boolean;
  services: string[];
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
};

export const sectors: { id: SectorId; label: string; center: Point }[] = [
  { id: "commandry", label: "Commandry", center: { x: -7, z: 2 } },
  { id: "work", label: "Work", center: { x: 5, z: 3 } },
  { id: "home", label: "Home Lab", center: { x: 2, z: -7 } },
];
export const initialPalette: Palette = {
  commandry: "#438bce",
  work: "#a08ac5",
  home: "#55aaa7",
  reporting: "#68c5b6",
  unhealthy: "#e16f76",
  attention: "#e9a04b",
};
export const fixtureHosts: Host[] = [
  {
    id: "electra",
    name: "Electra",
    sector: "commandry",
    memory: 62,
    disk: 41,
    load: 0.8,
    ramGiB: 8,
    profile: "general",
    attention: false,
    services: ["Web", "Worker", "Database", "Storage"],
  },
  {
    id: "pleiades",
    name: "Pleiades",
    sector: "work",
    memory: 38,
    disk: 24,
    load: 1.2,
    ramGiB: 64,
    profile: "compute",
    attention: false,
    services: [
      "API",
      "Actions",
      "Queue",
      "Metrics",
      "Scheduler",
      "Gateway",
      "Search",
      "Events",
    ],
  },
  {
    id: "maia",
    name: "Maia",
    sector: "home",
    memory: 47,
    disk: 58,
    load: 0.4,
    ramGiB: 32,
    profile: "storage",
    attention: false,
    services: ["NAS", "DNS", "Home Assistant", "Proxy", "Backups", "Media"],
  },
  {
    id: "titan",
    name: "Titan",
    sector: "work",
    memory: 86,
    disk: 63,
    load: 2.1,
    ramGiB: 16,
    profile: "compute",
    attention: true,
    services: ["Builder", "Registry", "Runner"],
  },
];
export const arrivalHost: Host = {
  id: "atlas",
  name: "Atlas",
  sector: "commandry",
  memory: 18,
  disk: 12,
  load: 0.2,
  ramGiB: 128,
  profile: "compute",
  attention: false,
  services: ["Build agent", "Artifacts"],
};

export function projectWells(
  hosts: Host[],
  mode: ViewMode,
  assignments: Record<string, SectorId>,
  sizeBasis: SizeBasis = "services",
  portrait = false,
): Well[] {
  const wells: Well[] = [];
  const footprints: (Point & { radius: number })[] = [];
  if (mode !== "hosts") {
    for (const sector of sectors) {
      wells.push({
        ...sector.center,
        id: `sector-${sector.id}`,
        label: sector.label,
        kind: "project",
        hostId: null,
        sector: sector.id,
        radius: 5.2,
        depth: 0.75,
        aspect: sector.id === "work" ? 1.25 : 1.05,
        angle: 0,
        elevation: 0.6,
        profile: 0.9,
        attention: false,
      });
    }
  }
  hosts.forEach((host, index) => {
    const sector =
      mode === "custom" ? (assignments[host.id] ?? host.sector) : host.sector;
    let x: number;
    let z: number;
    if (mode === "hosts") {
      // An irregular sunflower seed fills two dimensions at every aspect ratio.
      // Identity adds bounded variation, never frame-by-frame layout noise.
      const identity = [...host.id].reduce(
        (hash, letter) => (hash * 31 + letter.charCodeAt(0)) >>> 0,
        7,
      );
      const variation = (identity % 997) / 997;
      const bearing = index * 2.399963 + 0.55 + variation * 0.55;
      const distance = 5.4 * Math.sqrt(index + 1) * (0.94 + variation * 0.12);
      x = Math.cos(bearing) * distance * (portrait ? 0.85 : 1.1);
      z = Math.sin(bearing) * distance * (portrait ? 1.1 : 0.9);
    } else {
      const center = sectors.find((s) => s.id === sector)!.center;
      const siblings = hosts.filter(
        (h) =>
          (mode === "custom" ? (assignments[h.id] ?? h.sector) : h.sector) ===
          sector,
      );
      const order = siblings.findIndex((h) => h.id === host.id);
      const angle = order * 2.4 - 0.5;
      const offset = siblings.length > 1 ? 2.1 : 0;
      x = center.x + Math.cos(angle) * offset;
      z = center.z + Math.sin(angle) * offset;
    }
    const scale =
      sizeBasis === "capacity"
        ? 1.6 + Math.log2(1 + host.ramGiB / 8) * 0.47
        : sizeBasis === "services"
          ? 1.4 + Math.sqrt(host.services.length) * 0.54
          : 2.65;
    const aspect =
      host.profile === "storage"
        ? 1.34
        : host.profile === "compute"
          ? 0.9
          : 1.1;
    const radius = (scale * (mode === "hosts" ? 1 : 0.7)) / Math.sqrt(aspect);
    const angle = index * 0.9 + 0.3;
    const footprint = radius * Math.max(1, aspect) * 1.75;
    // Place only the arriving item. Appending a host preserves existing landmarks.
    const seed = { x, z };
    for (
      let attempt = 0;
      footprints.some(
        (p) => Math.hypot(x - p.x, z - p.z) < footprint + p.radius,
      );
      attempt++
    ) {
      const a = (attempt + 1) * 2.399963;
      const distance = Math.sqrt(attempt + 1) * 1.1;
      x = seed.x + Math.cos(a) * distance;
      z = seed.z + Math.sin(a) * distance;
    }
    footprints.push({ x, z, radius: footprint });
    wells.push({
      id: host.id,
      label: host.name,
      kind: "host",
      hostId: host.id,
      sector,
      x,
      z,
      radius,
      depth: radius * (host.profile === "compute" ? 1.5 : 1.15),
      aspect,
      angle,
      elevation: host.profile === "storage" ? 1.2 : 1.8,
      profile:
        host.profile === "compute"
          ? 1.2
          : host.profile === "storage"
            ? 0.82
            : 1,
      attention: host.attention,
    });
    host.services.forEach((service, serviceIndex) => {
      const angle = (serviceIndex / host.services.length) * Math.PI * 2 + 0.6;
      const distance = radius * 1.25;
      const localX = Math.cos(angle) * distance * aspect;
      const localZ = Math.sin(angle) * distance;
      wells.push({
        id: `${host.id}/${service}`,
        label: service,
        kind: "service",
        hostId: host.id,
        sector,
        x:
          x +
          localX * Math.cos(index * 0.9 + 0.3) -
          localZ * Math.sin(index * 0.9 + 0.3),
        z:
          z +
          localX * Math.sin(index * 0.9 + 0.3) +
          localZ * Math.cos(index * 0.9 + 0.3),
        radius: mode === "hosts" ? 0.51 : 0.34,
        depth: 0.58,
        aspect: 1,
        angle: 0,
        elevation: 0.08,
        profile: 1,
        attention: false,
      });
    });
  });
  return wells;
}

// Same height function is used by the GPU, DOM anchors, and event trajectories.
export function surfaceHeight(
  x: number,
  z: number,
  wells: Well[],
  time = 0,
  ambient = 0,
): number {
  let height =
    Math.sin(x * 0.14 + z * 0.11) * 0.55 + Math.cos(z * 0.18 - x * 0.09) * 0.35;
  height +=
    Math.sin(Math.hypot(x, z) * 0.7 - time * 0.35) *
    Math.cos(x * 0.12 + z * 0.09) *
    0.055 *
    ambient;
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
  }
  return height;
}
