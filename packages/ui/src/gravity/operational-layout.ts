import type {
  InfrastructureOverview,
  ObservatorySceneDto as ObservatoryScene,
} from "@commandry/contracts";
import type { Palette, Well } from "./model";
import type { ObservatoryPresentation } from "./observatory-preferences";
import { RecordedInfrastructureActivity } from "./infrastructure";

export type OperationalRepresentation =
  ObservatoryScene["representations"][number];
export type OperationalSummary = OperationalRepresentation["summary"];
export type OperationalLayoutResult = {
  wells: Well[];
  palette: Palette;
  positions: Map<string, Well>;
  byId: Map<string, OperationalRepresentation>;
  canonical: Map<string, OperationalRepresentation>;
  members: Map<string, Set<string>>;
  visibleSubjectForResource: Map<string, string>;
  representedResourceIds: string[];
  ramUnavailableIds: string[];
};
const hash = (value: string) => {
  let result = 2166136261;
  for (const letter of value)
    result = Math.imul(result ^ letter.charCodeAt(0), 16777619) >>> 0;
  return result;
};
/** Aggregate membership includes aliases once, but aliases never add canonical IDs. */
export function operationalMembers(
  scene: ObservatoryScene,
  representationId: string,
): Set<string> {
  const byId = new Map(scene.representations.map((node) => [node.id, node]));
  const pending = [representationId],
    visited = new Set<string>(),
    members = new Set<string>();
  while (pending.length) {
    const id = pending.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    for (const resourceId of scene.membershipIndex.directMembers[id] ?? [])
      members.add(resourceId);
    const reference = byId.get(id)?.referenceTo;
    if (reference)
      for (const resourceId of scene.membershipIndex.directMembers[reference] ??
        [])
        members.add(resourceId);
    pending.push(...(scene.membershipIndex.children[id] ?? []));
  }
  return members;
}
export function operationalAttention(
  summary: OperationalSummary,
): "impact" | "exposure" | "neutral" {
  if (
    summary.availability.confirmedImpact ||
    (summary.security.counts.confirmed_incident ?? 0) > 0 ||
    (summary.provider.counts.confirmed_local_impact ?? 0) > 0
  )
    return "impact";
  if ((summary.provider.counts.potential_exposure ?? 0) > 0) return "exposure";
  return "neutral";
}
/** Capacity is a sizing lens only for explicitly named total RAM in byte units.
 * Percentages, used/free RAM and missing observations never imply total capacity.
 */
export function observedTotalRam(
  scene: ObservatoryScene,
  resourceId: string,
): number | null {
  const observations = scene.capacityObservations
    .filter(
      (item) =>
        item.resourceId === resourceId &&
        /^(?:(?:memory|ram)[._ -]total(?:[._ -]bytes)?|host_memory_total(?:_bytes)?)$/i.test(
          item.name,
        ) &&
        /^(bytes|byte|B)$/.test(item.unit) &&
        Number.isFinite(item.value) &&
        item.value > 0 &&
        Date.parse(item.observedAt) <= Date.parse(scene.evaluatedAt),
    )
    .sort(
      (a, b) =>
        b.observedAt.localeCompare(a.observedAt) ||
        a.evidenceRef.localeCompare(b.evidenceRef),
    );
  return observations[0]?.value ?? null;
}

const operationalKinds = new Set(["host", "service", "deployment"]);
/** Aggregates are pools: their basin encloses every packed member. */
const poolKinds = new Set(["collection", "project"]);
// Members may sit on the pool floor up to this fraction of its radius; the
// steep profile keeps the wall and rim outside that floor.
const poolFloor = 0.84;
const poolProfile = 2.4;
const TAU = Math.PI * 2;

/** Intrinsic basin radius before any members are arranged around or inside it. */
function coreRadius(
  node: OperationalRepresentation,
  level: number,
  operationalDescendants: number,
  members: number,
  ram: number | null,
  size: ObservatoryPresentation["size"],
) {
  const root = level === 0;
  let radius: number;
  if (size === "uniform") radius = root ? 1.45 : 0.6;
  else if (node.kind === "host")
    radius =
      ram !== null
        ? (1.7 + Math.log2(1 + ram / 1073741824) * 0.3) * (root ? 1 : 0.5)
        : root
          ? 1.3 + Math.log2(1 + operationalDescendants) * 0.38
          : 0.75 + Math.log2(1 + operationalDescendants) * 0.25;
  else if (node.kind === "service" || node.kind === "deployment")
    radius = root ? 1 : 0.5;
  else if (node.kind === "repository" || node.kind === "reference")
    radius = root ? 0.9 : 0.46;
  else if (node.kind === "provider")
    radius = (1.4 + Math.log2(1 + members) * 0.2) * (root ? 1 : 0.5);
  else radius = root ? 1.2 : 0.6;
  // Deep containment converges instead of reserving unbounded space.
  const shrink = level <= 1 ? 1 : level === 2 ? 0.8 : 0.64 * 0.6 ** (level - 3);
  return Math.max(
    level <= 3 ? 0.18 : 0.02,
    Math.min(root ? 3.6 : 1.8, radius) * shrink,
  );
}

/** Members on concentric rings around a hub. A ring's members share one
 * distance and equal angular slots, so every member is evenly spaced around its
 * parent. Larger members fill the inner rings; each ring keeps layout order.
 * Without a hub (a pool with no dominant member) the centre stays open and a
 * small population forms a single ring. Offsets face +x as "outward": the
 * inward direction always falls between two slots, so a nested cluster never
 * puts a member on the tether from its own parent.
 */
function rings(
  hub: number,
  members: { id: string; extent: number }[],
  order: (a: string, b: string) => number,
) {
  const largest = Math.max(0, ...members.map((member) => member.extent));
  const gap = 0.3 + Math.max(hub, largest) * 0.12;
  const offsets = new Map<string, { x: number; z: number }>();
  const sorted = [...members].sort(
    (a, b) => b.extent - a.extent || order(a.id, b.id),
  );
  let inner = hub > 0 ? hub * 1.16 + gap : 0,
    extent = hub * 1.15,
    index = 0,
    ring = 0;
  while (index < sorted.length) {
    const remaining = sorted.length - index;
    const size = sorted[index]!.extent;
    // Equal slots must each hold the ring's largest member with clearance.
    const spread = (count: number) =>
      count < 2 ? 0 : (size + gap / 2) / Math.sin(Math.PI / count);
    let count: number, distance: number;
    if (inner === 0) {
      // An open centre: up to eight members share one ring, more start a hexagon.
      count = remaining <= 8 ? remaining : 6;
      distance = count < 2 ? 0 : Math.max(size + gap / 2, spread(count));
    } else {
      const base = inner + size;
      if (spread(remaining) <= base * 1.5) {
        // A small remainder widens one ring rather than leaving a sparse orbit.
        count = remaining;
        distance = Math.max(base, spread(count));
      } else {
        count = 1;
        while (count < remaining && spread(count + 1) <= base) count++;
        distance = base;
      }
    }
    const placed = sorted
      .slice(index, index + count)
      .sort((a, b) => order(a.id, b.id));
    const turn = Math.PI + (Math.PI / count) * (ring % 2 ? 2 : 1);
    placed.forEach((member, slot) => {
      const angle = turn + (slot * Math.PI * 2) / count;
      offsets.set(member.id, {
        x: Math.cos(angle) * distance,
        z: Math.sin(angle) * distance,
      });
    });
    extent = Math.max(extent, distance + size);
    inner = distance + size + gap;
    index += count;
    ring++;
  }
  return { offsets, extent };
}

/** Uniform grid of placed root clusters for clearance queries. */
class SpatialIndex {
  private cells = new Map<string, { x: number; z: number; extent: number }[]>();
  private largest = 0;
  private readonly size = 8;
  add(x: number, z: number, extent: number) {
    const key = `${Math.floor(x / this.size)}:${Math.floor(z / this.size)}`;
    const cell = this.cells.get(key) ?? [];
    cell.push({ x, z, extent });
    this.cells.set(key, cell);
    this.largest = Math.max(this.largest, extent);
  }
  clear(x: number, z: number, extent: number, gap: number) {
    const reach = Math.ceil((extent + this.largest + gap) / this.size);
    const cx = Math.floor(x / this.size),
      cz = Math.floor(z / this.size);
    for (let i = cx - reach; i <= cx + reach; i++)
      for (let j = cz - reach; j <= cz + reach; j++)
        for (const item of this.cells.get(`${i}:${j}`) ?? [])
          if (Math.hypot(x - item.x, z - item.z) < item.extent + extent + gap)
            return false;
    return true;
  }
}

/** The renderer's three Well kinds are geometry vocabulary only. Semantic kinds
 * remain in byId and the DOM. Repositories and collections never become tour hosts.
 */
export class OperationalLayout {
  private scope = "";
  private slots = new Map<string, { x: number; z: number }>();
  project(
    scene: ObservatoryScene,
    options: Pick<ObservatoryPresentation, "size" | "palette" | "colors">,
  ): OperationalLayoutResult {
    if (scene.completeness !== "complete")
      throw new Error("Operational scene is incomplete");
    if (this.scope !== scene.scopeDigest) {
      this.slots.clear();
      this.scope = scene.scopeDigest;
    }
    const byId = new Map(scene.representations.map((node) => [node.id, node]));
    if (byId.size !== scene.representations.length)
      throw new Error("Duplicate representation identity");
    const authorized = new Set(scene.membershipIndex.resourceIds);
    const canonical = new Map(
      scene.representations
        .filter((node) => node.resourceId && !node.referenceTo)
        .map((node) => [node.resourceId!, node]),
    );
    if (
      authorized.size !== scene.population.canonicalResourceCount ||
      canonical.size !== authorized.size ||
      [...canonical.keys()].some((id) => !authorized.has(id))
    )
      throw new Error("Canonical population disagrees with scene");
    const members = new Map(
      scene.representations.map((node) => [
        node.id,
        operationalMembers(scene, node.id),
      ]),
    );
    const visible = new Set(scene.visibleRepresentationIds),
      represented = new Set<string>();
    for (const id of visible) {
      if (!byId.has(id)) throw new Error("Unknown visible representation");
      for (const member of members.get(id)!) represented.add(member);
    }
    if (
      represented.size !== authorized.size ||
      [...represented].some((id) => !authorized.has(id))
    )
      throw new Error("Visible representation membership is incomplete");
    const depth = new Map<string, number>();
    for (const node of scene.representations) {
      const path: string[] = [],
        seen = new Set<string>();
      let current: OperationalRepresentation | undefined = node;
      while (current && !depth.has(current.id)) {
        if (seen.has(current.id))
          throw new Error("Cyclic representation hierarchy");
        seen.add(current.id);
        path.push(current.id);
        if (
          current.parentRepresentationId &&
          !byId.has(current.parentRepresentationId)
        )
          throw new Error("Missing representation parent");
        current = current.parentRepresentationId
          ? byId.get(current.parentRepresentationId)
          : undefined;
      }
      let level = current ? depth.get(current.id)! + 1 : 0;
      for (const id of path.reverse()) depth.set(id, level++);
    }
    const ordered = [...scene.representations].sort(
      (a, b) =>
        depth.get(a.id)! - depth.get(b.id)! ||
        a.layoutKey.localeCompare(b.layoutKey) ||
        a.id.localeCompare(b.id),
    );
    const byLayout = (a: string, b: string) =>
      byId.get(a)!.layoutKey.localeCompare(byId.get(b)!.layoutKey) ||
      a.localeCompare(b);
    const childrenOf = new Map<string, string[]>();
    for (const node of ordered)
      if (node.parentRepresentationId) {
        const siblings = childrenOf.get(node.parentRepresentationId) ?? [];
        siblings.push(node.id);
        childrenOf.set(node.parentRepresentationId, siblings);
      }
    for (const siblings of childrenOf.values()) siblings.sort(byLayout);
    const ramUnavailableIds: string[] = [];
    // Structural geometry uses every representation, visible or not, so expanding
    // or collapsing never moves a basin or changes its size.
    const shapes = new Map<
      string,
      {
        radius: number;
        extent: number;
        offsets: Map<string, { x: number; z: number }>;
      }
    >();
    // Subtree scale relative to its parent's frame; absent means 1.
    const reduction = new Map<string, number>(),
      frame = new Map<string, number>();
    for (const node of [...ordered].reverse()) {
      const memberIds = members.get(node.id)!;
      const operationalDescendants = Math.max(
        0,
        [...memberIds].filter((id) =>
          operationalKinds.has(canonical.get(id)?.kind ?? ""),
        ).length - (operationalKinds.has(node.kind) ? 1 : 0),
      );
      let ram: number | null = null;
      if (
        options.size === "total-ram" &&
        node.kind === "host" &&
        node.resourceId
      ) {
        ram = observedTotalRam(scene, node.resourceId);
        if (ram === null) ramUnavailableIds.push(node.id);
      }
      const core = coreRadius(
        node,
        depth.get(node.id)!,
        operationalDescendants,
        memberIds.size,
        ram,
        options.size,
      );
      const aspect = node.kind === "deployment" ? 1.25 : 1;
      const kids = (childrenOf.get(node.id) ?? []).map((id) => ({
        id,
        extent: shapes.get(id)!.extent,
      }));
      if (!kids.length) {
        shapes.set(node.id, {
          radius: core,
          extent: core * aspect * 1.15,
          offsets: new Map(),
        });
      } else if (poolKinds.has(node.kind)) {
        const sorted = [...kids].sort(
          (a, b) => b.extent - a.extent || byLayout(a.id, b.id),
        );
        const [largest, second] = sorted;
        let offsets: Map<string, { x: number; z: number }>, reach: number;
        if (sorted.length >= 3 && largest!.extent > second!.extent * 1.8) {
          // One dominant member (a nested pool) anchors the floor; the rest
          // ring it evenly.
          const arranged = rings(
            largest!.extent / 1.15,
            sorted.slice(1),
            byLayout,
          );
          offsets = arranged.offsets;
          offsets.set(largest!.id, { x: 0, z: 0 });
          reach = arranged.extent;
        } else {
          const arranged = rings(0, sorted, byLayout);
          offsets = arranged.offsets;
          reach = arranged.extent;
        }
        const radius = Math.max(core, reach / poolFloor);
        shapes.set(node.id, { radius, extent: radius * 1.12, offsets });
      } else {
        // An orbiting cluster is about twice its member's reach, so unbounded
        // nesting would grow geometrically. Members larger than this are drawn
        // as uniformly reduced subtrees.
        const limit = core * aspect * 2.4 + 0.6;
        for (const kid of kids)
          if (kid.extent > limit) {
            reduction.set(kid.id, limit / kid.extent);
            kid.extent = limit;
          }
        const arranged = rings(core * aspect, kids, byLayout);
        shapes.set(node.id, {
          radius: core,
          extent: arranged.extent,
          offsets: arranged.offsets,
        });
      }
    }
    ramUnavailableIds.sort();
    const keyFor = (node: OperationalRepresentation) =>
      `${scene.grouping}|${options.size}|${node.layoutKey}`;
    const roots = ordered.filter((node) => !node.parentRepresentationId);
    // Roots keep their slot for the whole scope. New roots take the nearest free
    // spiral position that clears every placed cluster's complete extent.
    const occupied = new SpatialIndex();
    for (const node of roots) {
      const slot = this.slots.get(keyFor(node));
      if (slot) occupied.add(slot.x, slot.z, shapes.get(node.id)!.extent);
    }
    for (const node of [...roots].sort(
      (a, b) =>
        shapes.get(b.id)!.extent - shapes.get(a.id)!.extent ||
        byLayout(a.id, b.id),
    )) {
      const key = keyFor(node);
      if (this.slots.has(key)) continue;
      const extent = shapes.get(node.id)!.extent;
      const angle = ((hash(node.layoutKey) % 65536) / 65536) * TAU;
      const step = Math.max(1.2, extent * 0.35);
      let x = 0,
        z = 0;
      for (let attempt = 0; ; attempt++) {
        const distance = Math.sqrt(attempt) * step;
        x = Math.cos(angle + attempt * 2.399963) * distance;
        z = Math.sin(angle + attempt * 2.399963) * distance;
        if (occupied.clear(x, z, extent, 2.4)) break;
      }
      occupied.add(x, z, extent);
      this.slots.set(key, { x, z });
    }
    const positions = new Map<string, Well>();
    // Direction each member ring's "outward" slot axis points, per parent.
    const facing = new Map<string, number>();
    const palette: Palette = {
      attention: options.colors.attention ?? "#ca812e",
      unhealthy: options.colors.unhealthy ?? "#bd4b51",
      reporting: options.colors.reporting ?? "#4e9d9a",
    };
    const colors =
      options.palette === "earth"
        ? ["#a98d64", "#6c9182", "#9b7a8b", "#7f95ae"]
        : options.palette === "ocean"
          ? ["#608fad", "#6a9eaa", "#8f88b4", "#6e9c8a"]
          : ["#628faa", "#9b8bae", "#729e98", "#b39a79"];
    for (const node of ordered) {
      const parent = node.parentRepresentationId
        ? positions.get(node.parentRepresentationId)!
        : null;
      const root = parent?.sector ?? node.id;
      palette[root] =
        options.colors[root] ?? colors[hash(root) % colors.length]!;
      const scale =
        (parent ? frame.get(parent.id)! : 1) * (reduction.get(node.id) ?? 1);
      frame.set(node.id, scale);
      const radius = shapes.get(node.id)!.radius * scale;
      const local = parent
        ? shapes.get(parent.id)!.offsets.get(node.id)!
        : this.slots.get(keyFor(node))!;
      const outer = parent ? frame.get(parent.id)! : 1;
      // Member rings face away from the parent's own tether.
      const turn = parent ? facing.get(parent.id)! : 0;
      const offset = {
        x: (local.x * Math.cos(turn) - local.z * Math.sin(turn)) * outer,
        z: (local.x * Math.sin(turn) + local.z * Math.cos(turn)) * outer,
      };
      facing.set(
        node.id,
        Math.hypot(offset.x, offset.z) > 1e-6 && parent
          ? Math.atan2(offset.z, offset.x)
          : ((hash(node.layoutKey) % 3600) / 3600) * TAU,
      );
      const kind: Well["kind"] =
        node.kind === "host"
          ? "host"
          : node.kind === "service" || node.kind === "deployment"
            ? "service"
            : "project";
      const pool = poolKinds.has(node.kind);
      const attention = operationalAttention(node.summary);
      // Every basin is deep enough relative to its radius to read as one
      // concentric shape; pools are broad, flat-floored and shallow.
      positions.set(node.id, {
        id: node.id,
        label: node.label,
        kind,
        hostId: node.parentRepresentationId,
        sector: root,
        x: offset.x + (parent?.x ?? 0),
        z: offset.z + (parent?.z ?? 0),
        radius,
        aspect: node.kind === "deployment" ? 1.25 : 1,
        angle: 0,
        // The rim lip grows with radius * depth, so wide pools stay shallow.
        depth: pool
          ? Math.min(0.45, 2 / radius)
          : node.kind === "host"
            ? radius * 1.15
            : node.kind === "provider"
              ? radius * 0.85
              : node.kind === "repository" || node.kind === "reference"
                ? radius * 0.8
                : radius * 0.7,
        // Only top-level hosts carry a raised mound; nested guests sit on it.
        elevation:
          node.kind === "host"
            ? parent
              ? 0.12
              : Math.min(0.8, radius * 0.35)
            : pool
              ? 0
              : 0.08,
        profile: pool ? poolProfile : 1,
        attention: attention !== "neutral",
        ...(pool ? { pool: true } : {}),
      });
    }
    const visibleSubjectForResource = new Map<string, string>();
    for (const [resourceId, node] of canonical) {
      let current: OperationalRepresentation | undefined = node;
      while (current && !visible.has(current.id))
        current = current.parentRepresentationId
          ? byId.get(current.parentRepresentationId)
          : undefined;
      if (!current)
        throw new Error(
          "Canonical resource has no visible containing representation",
        );
      visibleSubjectForResource.set(resourceId, current.id);
    }
    return {
      wells: ordered
        .filter((node) => visible.has(node.id))
        .map((node) => positions.get(node.id)!),
      palette,
      positions,
      byId,
      canonical,
      members,
      visibleSubjectForResource,
      representedResourceIds: [...represented].sort(),
      ramUnavailableIds,
    };
  }
}

/** Preserve actual event/evidence identities while pulsing the visible subject.
 * There are no inferred destination transfers and no initial-snapshot replay.
 */
export function mapOperationalEvents(
  snapshot: Pick<InfrastructureOverview, "events">,
  projection: Pick<OperationalLayoutResult, "visibleSubjectForResource">,
) {
  return snapshot.events.flatMap((event) => {
    const representationId = event.resourceId
      ? projection.visibleSubjectForResource.get(event.resourceId)
      : null;
    return representationId
      ? [
          {
            ...event,
            canonicalResourceId: event.resourceId!,
            resourceId: representationId,
          },
        ]
      : [];
  });
}

/** Persistent semantic attention is independent of event animation. */
export class OperationalRecordedActivity extends RecordedInfrastructureActivity {
  private attentionLevels = new Map<string, number>();
  setProjection(projection: Pick<OperationalLayoutResult, "byId">) {
    this.attentionLevels = new Map(
      [...projection.byId].map(([id, node]) => [
        id,
        operationalAttention(node.summary) === "impact"
          ? 1
          : operationalAttention(node.summary) === "exposure"
            ? 0.5
            : 0,
      ]),
    );
  }
  attention(id: string) {
    return this.attentionLevels.get(id) ?? 0;
  }
}
