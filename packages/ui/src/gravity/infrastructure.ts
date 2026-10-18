import type { InfrastructureResource } from "@commandry/contracts";
import type { Palette, Well } from "./model";
import type { ActivitySnapshot, ActivitySource } from "./activity-types";

export type GravityGrouping = "hosts" | "projects" | "custom";
export type GravityPreferences = {
  grouping: GravityGrouping;
  size: "children" | "uniform";
  theme: "system" | "porcelain" | "midnight";
  camera: "composed" | "orbit" | "tour";
  ambient: boolean;
  assignments: Record<string, string>;
  colors: Record<string, string>;
};
export const gravityDefaults: GravityPreferences = {
  grouping: "hosts",
  size: "children",
  theme: "system",
  camera: "composed",
  ambient: true,
  assignments: {},
  colors: {},
};
const hash = (text: string) =>
  [...text].reduce(
    (value, letter) => (value * 31 + letter.charCodeAt(0)) >>> 0,
    7,
  );
export function readGravityPreferences(raw: string | null): GravityPreferences {
  try {
    const saved = JSON.parse(raw ?? "null");
    if (!saved || saved.version !== 1) return gravityDefaults;
    return {
      grouping: ["hosts", "projects", "custom"].includes(saved.grouping)
        ? saved.grouping
        : "hosts",
      size: saved.size === "uniform" ? "uniform" : "children",
      theme: ["system", "porcelain", "midnight"].includes(saved.theme)
        ? saved.theme
        : "system",
      camera: ["composed", "orbit", "tour"].includes(saved.camera)
        ? saved.camera
        : "composed",
      ambient: saved.ambient !== false,
      assignments: Object.fromEntries(
        Object.entries(saved.assignments ?? {}).filter(
          ([id, value]) =>
            id.length <= 120 && typeof value === "string" && value.length <= 60,
        ),
      ) as Record<string, string>,
      colors: Object.fromEntries(
        Object.entries(saved.colors ?? {}).filter(
          ([id, value]) =>
            id.length <= 120 &&
            typeof value === "string" &&
            /^#[0-9a-f]{6}$/i.test(value),
        ),
      ) as Record<string, string>,
    };
  } catch {
    return gravityDefaults;
  }
}
export class InfrastructureLayout {
  private positions = new Map<
    string,
    { x: number; z: number; sector: string }
  >();
  private signature = "";
  project(
    resources: InfrastructureResource[],
    preferences: GravityPreferences,
    portrait = false,
  ) {
    const signature = JSON.stringify([
      preferences.grouping,
      preferences.size,
      preferences.assignments,
      portrait,
    ]);
    if (signature !== this.signature) {
      this.positions.clear();
      this.signature = signature;
    }
    return projectInfrastructure(
      resources,
      preferences,
      portrait,
      this.positions,
    );
  }
}
export function projectInfrastructure(
  resources: InfrastructureResource[],
  preferences: GravityPreferences,
  portrait = false,
  positions = new Map<string, { x: number; z: number; sector: string }>(),
) {
  const ordered = [...resources].sort((a, b) => a.id.localeCompare(b.id));
  const byId = new Map(ordered.map((item) => [item.id, item]));
  const groups = new Map<string, string>();
  const groupFor = (item: InfrastructureResource) => {
    const project = [...item.projects].sort((a, b) =>
      a.id.localeCompare(b.id),
    )[0];
    const custom = preferences.assignments[item.id]?.trim();
    const id =
      preferences.grouping === "custom" && custom
        ? `custom:${custom}`
        : (project?.id ?? "unlinked");
    groups.set(
      id,
      preferences.grouping === "custom" && custom
        ? custom
        : (project?.name ?? "Unlinked resources"),
    );
    return id;
  };
  const sectors = new Map(ordered.map((item) => [item.id, groupFor(item)]));
  const parentFor = (item: InfrastructureResource) => {
    let parent = item.parentResourceId;
    if (!parent || !byId.has(parent) || parent === item.id) return null;
    const seen = new Set([item.id]);
    for (
      let next: string | null = parent;
      next && byId.has(next);
      next = byId.get(next)!.parentResourceId
    ) {
      if (seen.has(next)) return null;
      seen.add(next);
    }
    if (
      preferences.grouping !== "hosts" &&
      sectors.get(parent) !== sectors.get(item.id)
    )
      parent = null;
    return parent;
  };
  const roots = ordered
    .filter((item) => !parentFor(item))
    .sort(
      (a, b) =>
        Number(positions.has(b.id)) - Number(positions.has(a.id)) ||
        a.id.localeCompare(b.id),
    );
  const groupIds = [
    ...new Set(roots.map((item) => sectors.get(item.id)!)),
  ].sort();
  const palette: Palette = {
    attention: preferences.colors.attention ?? "#e9a04b",
    reporting: preferences.colors.reporting ?? "#68c5b6",
    unhealthy: preferences.colors.unhealthy ?? "#e16f76",
  };
  for (const [id] of groups)
    palette[id] =
      preferences.colors[id] ??
      ["#438bce", "#a08ac5", "#55aaa7", "#bc956d", "#81a3c1", "#b48da3"][
        hash(id) % 6
      ]!;
  const wells: Well[] = [];
  const footprints: { x: number; z: number; radius: number }[] = [];
  const placed = new Map<string, Well>();
  roots.forEach((item, index) => {
    const sector = sectors.get(item.id)!;
    const variation = (hash(item.id) % 997) / 997;
    const sectorIndex = groupIds.indexOf(sector);
    const siblings = roots.filter((root) => sectors.get(root.id) === sector);
    const position =
      preferences.grouping === "hosts"
        ? index
        : siblings.findIndex((root) => root.id === item.id);
    const angle = position * 2.399963 + 0.55 + variation * 0.55;
    const distance =
      preferences.grouping !== "hosts" && siblings.length === 1
        ? 0
        : 5.4 * Math.sqrt(position + 1) * (0.94 + variation * 0.12);
    const groupAngle = sectorIndex * 2.399963 + 0.4;
    const groupDistance =
      preferences.grouping === "hosts" || groupIds.length === 1
        ? 0
        : 16 * Math.sqrt(sectorIndex + 1);
    let x =
      Math.cos(angle) * distance * (portrait ? 0.85 : 1.1) +
      Math.cos(groupAngle) * groupDistance;
    let z =
      Math.sin(angle) * distance * (portrait ? 1.1 : 0.9) +
      Math.sin(groupAngle) * groupDistance;
    const count =
      item.childCount ??
      ordered.filter((child) => child.parentResourceId === item.id).length;
    const scale =
      preferences.size === "uniform"
        ? 2.6
        : 1.8 + Math.sqrt(Math.min(count, 100)) * 0.38;
    const aspect = /storage|database|nas/i.test(item.kind) ? 1.3 : 1;
    const radius = scale / Math.sqrt(aspect);
    const footprint = radius * Math.max(1, aspect) * 1.75;
    const previous = positions.get(item.id);
    if (previous?.sector === sector) {
      x = previous.x;
      z = previous.z;
    }
    const seed = { x, z };
    for (
      let attempt = 0;
      footprints.some(
        (p) => Math.hypot(x - p.x, z - p.z) < p.radius + footprint,
      );
      attempt++
    ) {
      const bearing = (attempt + 1) * 2.399963;
      const distance = Math.sqrt(attempt + 1) * 1.1;
      x = seed.x + Math.cos(bearing) * distance;
      z = seed.z + Math.sin(bearing) * distance;
    }
    footprints.push({ x, z, radius: footprint });
    positions.set(item.id, { x, z, sector });
    const well: Well = {
      id: item.id,
      label: item.name,
      kind: "host",
      hostId: null,
      sector,
      x,
      z,
      radius,
      aspect,
      angle: variation * 3,
      depth: radius * 1.35,
      elevation: 1.5,
      profile: aspect > 1 ? 0.85 : 1.15,
      attention: ["stale", "error", "future"].includes(item.telemetry),
    };
    wells.push(well);
    placed.set(item.id, well);
  });
  const add = (item: InfrastructureResource): Well => {
    const existing = placed.get(item.id);
    if (existing) return existing;
    const parentId = parentFor(item)!;
    const parent = add(byId.get(parentId)!);
    const siblings = ordered.filter((child) => parentFor(child) === parentId);
    const angle =
      (siblings.findIndex((child) => child.id === item.id) / siblings.length) *
        Math.PI *
        2 +
      parent.angle;
    const radius = Math.max(0.18, parent.radius * 0.23);
    const well: Well = {
      id: item.id,
      label: item.name,
      kind: "service",
      hostId: parentId,
      sector: sectors.get(item.id)!,
      x: parent.x + Math.cos(angle) * parent.radius * parent.aspect * 1.25,
      z: parent.z + Math.sin(angle) * parent.radius * 1.25,
      radius,
      aspect: 1,
      angle: 0,
      depth: radius * 1.1,
      elevation: 0.08,
      profile: 1,
      attention: ["stale", "error", "future"].includes(item.telemetry),
    };
    wells.push(well);
    placed.set(item.id, well);
    return well;
  };
  for (const item of ordered) add(item);
  if (preferences.grouping !== "hosts")
    for (const id of groupIds) {
      const members = wells.filter(
        (well) => well.kind === "host" && well.sector === id,
      );
      const x = members.reduce((n, w) => n + w.x, 0) / members.length,
        z = members.reduce((n, w) => n + w.z, 0) / members.length;
      const radius = Math.max(
        ...members.map((w) => Math.hypot(w.x - x, w.z - z) + w.radius * 1.5),
      );
      wells.unshift({
        id: `sector:${id}`,
        label: groups.get(id)!,
        kind: "project",
        hostId: null,
        sector: id,
        x,
        z,
        radius,
        aspect: 1,
        angle: 0,
        depth: 0.3,
        elevation: 0.25,
        profile: 0.9,
        attention: false,
      });
    }
  for (const id of positions.keys()) if (!byId.has(id)) positions.delete(id);
  return { wells, palette, groups };
}

// A real observation has a subject, not an invented request destination.
export class RecordedInfrastructureActivity implements ActivitySource {
  private time = 0;
  private seen: Map<string, number> | null = null;
  private events: ActivitySnapshot["events"] = [];
  private enabled = true;
  private visible = true;
  setVisible(visible: boolean) {
    if (visible === this.visible) return;
    this.visible = visible;
    this.enabled = false;
    this.events = [];
  }
  active() {
    return this.events.length > 0;
  }
  snapshot(): ActivitySnapshot {
    return { time: this.time, transfers: [], events: this.events };
  }
  advance(seconds: number) {
    this.time += seconds;
    this.events = this.events.filter((event) => this.time - event.at < 1.4);
  }
  synchronize(
    snapshot: {
      events: {
        id: string;
        resourceId: string | null;
        summary: string;
        occurredAt: string;
      }[];
    },
    animate: boolean,
    now = Date.now(),
  ) {
    const baseline = !this.seen || !this.enabled || !animate || !this.visible;
    this.enabled = animate && this.visible;
    const seen = this.seen ?? new Map<string, number>();
    for (const event of snapshot.events) {
      const age = now - Date.parse(event.occurredAt);
      if (
        !baseline &&
        !seen.has(event.id) &&
        event.resourceId &&
        age >= 0 &&
        age < 60_000
      )
        this.events.push({
          id: event.id,
          at: this.time,
          correlationId: event.id,
          from: event.resourceId,
          to: event.resourceId,
          kind: "observation",
          outcome: "ok",
          summary: event.summary,
          effect: "arrival",
        });
      seen.set(event.id, Date.parse(event.occurredAt));
    }
    for (const [id, at] of seen) if (now - at > 120_000) seen.delete(id);
    this.seen = seen;
    if (!this.enabled) this.events = [];
  }
}
