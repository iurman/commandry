export type ViewMode = "hosts" | "projects" | "custom";
export type SurfaceTheme = "porcelain" | "midnight";
export type SectorId = "commandry" | "work" | "home";
export type Point = { x: number; z: number };
export type Palette = Record<SectorId, string> & {
  attention: string;
  reporting: string;
};
export type Host = {
  id: string;
  name: string;
  sector: SectorId;
  memory: number;
  disk: number;
  load: number;
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
    attention: false,
    services: ["API", "Actions", "Queue", "Metrics"],
  },
  {
    id: "maia",
    name: "Maia",
    sector: "home",
    memory: 47,
    disk: 58,
    load: 0.4,
    attention: false,
    services: ["NAS", "DNS", "Home Assistant", "Proxy"],
  },
  {
    id: "titan",
    name: "Titan",
    sector: "work",
    memory: 86,
    disk: 63,
    load: 2.1,
    attention: true,
    services: ["Builder", "Registry", "Runner", "Cache"],
  },
];
export const arrivalHost: Host = {
  id: "atlas",
  name: "Atlas",
  sector: "commandry",
  memory: 18,
  disk: 12,
  load: 0.2,
  attention: false,
  services: ["Build agent", "Artifacts"],
};

export function projectWells(
  hosts: Host[],
  mode: ViewMode,
  assignments: Record<string, SectorId>,
): Well[] {
  const wells: Well[] = [];
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
      const positions = [
        { x: -7, z: 3.4 },
        { x: -4.4, z: -5.6 },
        { x: 5.3, z: -5.5 },
        { x: 6, z: 3.8 },
      ];
      const base = positions[index];
      x = base?.x ?? -0.5 + Math.cos(index * 2.4) * 3;
      z = base?.z ?? 10 + Math.sin(index * 2.4) * 1.5;
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
    const radius = mode === "hosts" ? 2.65 : 1.65;
    wells.push({
      id: host.id,
      label: host.name,
      kind: "host",
      hostId: host.id,
      sector,
      x,
      z,
      radius,
      depth: mode === "hosts" ? 2.8 : 2,
      attention: host.attention,
    });
    host.services.forEach((service, serviceIndex) => {
      const angle = (serviceIndex / host.services.length) * Math.PI * 2 + 0.6;
      const distance = radius * 1.12;
      wells.push({
        id: `${host.id}/${service}`,
        label: service,
        kind: "service",
        hostId: host.id,
        sector,
        x: x + Math.cos(angle) * distance,
        z: z + Math.sin(angle) * distance,
        radius: mode === "hosts" ? 0.51 : 0.34,
        depth: 0.58,
        attention: false,
      });
    });
  });
  return wells;
}

// Same height function is used by the GPU, DOM anchors, and event trajectories.
export function surfaceHeight(x: number, z: number, wells: Well[]): number {
  let height =
    Math.sin(x * 0.32 + z * 0.17) * 0.035 +
    Math.cos(z * 0.42 - x * 0.12) * 0.02;
  for (const well of wells) {
    const r2 = ((x - well.x) ** 2 + (z - well.z) ** 2) / well.radius ** 2;
    height -= well.depth * Math.exp(-r2 * 1.5);
    height +=
      0.13 *
      well.radius *
      Math.exp(-((Math.sqrt(r2) - 1.05) ** 2) * 12) *
      Math.min(1, well.depth);
  }
  return height;
}
