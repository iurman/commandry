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
    const keyFor = (node: OperationalRepresentation) =>
      `${scene.grouping}|${node.layoutKey}|${node.parentRepresentationId ? byId.get(node.parentRepresentationId)!.layoutKey : "root"}`;
    const positions = new Map<string, Well>(),
      ramUnavailableIds: string[] = [];
    const roots = ordered.filter((node) => !node.parentRepresentationId);
    const occupied = roots.flatMap((node) => {
      const slot = this.slots.get(keyFor(node));
      return slot ? [{ id: node.id, ...slot }] : [];
    });
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
      const memberIds = members.get(node.id)!;
      const operationalChildren = [...memberIds].filter((id) =>
        ["host", "service", "deployment"].includes(
          canonical.get(id)?.kind ?? "",
        ),
      ).length;
      let radius =
        1.65 +
        Math.log2(
          1 +
            (node.kind === "collection" ||
            node.kind === "project" ||
            node.kind === "provider"
              ? memberIds.size
              : Math.max(0, operationalChildren - 1)),
        ) *
          0.36;
      if (node.kind === "repository" || node.kind === "reference")
        radius = 1.05;
      if (
        options.size === "total-ram" &&
        node.kind === "host" &&
        node.resourceId
      ) {
        const total = observedTotalRam(scene, node.resourceId);
        if (total === null) ramUnavailableIds.push(node.id);
        else radius = 1.7 + Math.log2(1 + total / 1073741824) * 0.3;
      }
      if (options.size === "uniform") radius = 1.65;
      radius = Math.min(5.4, radius);
      if (parent)
        radius = Math.max(0.18, Math.min(radius * 0.42, parent.radius * 0.38));
      const key = keyFor(node),
        seed = hash(node.layoutKey),
        existing = this.slots.get(key);
      let x = existing?.x ?? 0,
        z = existing?.z ?? 0;
      if (!existing) {
        const angle = ((seed % 65536) / 65536) * Math.PI * 2;
        if (parent) {
          const siblings =
            scene.membershipIndex.children[node.parentRepresentationId!] ?? [];
          const index = [...siblings]
            .sort((a, b) =>
              byId.get(a)!.layoutKey.localeCompare(byId.get(b)!.layoutKey),
            )
            .indexOf(node.id);
          const distance =
            parent.radius * 1.2 + Math.sqrt(index + 1) * radius * 2.5;
          x = Math.cos(angle + index * 2.399963) * distance;
          z = Math.sin(angle + index * 2.399963) * distance;
        } else {
          let attempt = 0;
          do {
            const distance = Math.sqrt(attempt + (seed % 5)) * 12;
            x = Math.cos(angle + attempt * 2.399963) * distance;
            z = Math.sin(angle + attempt * 2.399963) * distance;
            attempt++;
          } while (
            occupied.some((point) => Math.hypot(x - point.x, z - point.z) < 18)
          );
          occupied.push({ id: node.id, x, z });
        }
        this.slots.set(key, { x, z });
      }
      const kind: Well["kind"] =
        node.kind === "host"
          ? "host"
          : node.kind === "service" || node.kind === "deployment"
            ? "service"
            : "project";
      const attention = operationalAttention(node.summary);
      positions.set(node.id, {
        id: node.id,
        label: node.label,
        kind,
        hostId: node.parentRepresentationId,
        sector: root,
        x: x + (parent?.x ?? 0),
        z: z + (parent?.z ?? 0),
        radius,
        aspect: node.kind === "deployment" ? 1.25 : 1,
        angle: 0,
        depth:
          node.kind === "host"
            ? radius * 1.15
            : node.kind === "service" || node.kind === "deployment"
              ? radius * 0.7
              : node.kind === "repository" || node.kind === "reference"
                ? 0.03
                : 0.18,
        elevation: node.kind === "host" ? 0.8 : 0.08,
        profile: 1,
        attention: attention !== "neutral",
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
