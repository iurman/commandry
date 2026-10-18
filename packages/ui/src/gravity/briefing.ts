import type {
  InfrastructureOverview,
  ObservatorySceneDto as ObservatoryScene,
} from "@commandry/contracts";
import {
  operationalAttention,
  operationalMembers,
  type OperationalRepresentation,
  type OperationalSummary,
} from "./operational-layout";

export type BriefingTone = "impact" | "exposure" | "notice";
export type BriefingIssue = {
  /** Representation to inspect. */
  id: string;
  label: string;
  text: string;
  tone: BriefingTone;
};
export type BriefingItem = {
  id: string;
  label: string;
  kind: OperationalRepresentation["kind"];
  note?: string;
  tone?: BriefingTone;
};
export type BriefingGroup = { title: string; items: BriefingItem[] };
export type BriefingActivity = {
  id: string;
  /** Representation the event belongs to. */
  subjectId: string;
  label: string;
  summary: string;
  occurredAt: string;
  age: string;
};
export type ObservatoryBriefing = {
  subjectId: string | null;
  title: string;
  headline: string;
  facts: string[];
  issues: BriefingIssue[];
  groups: BriefingGroup[];
  activity: BriefingActivity[];
};

const plural: Record<OperationalRepresentation["kind"], [string, string]> = {
  host: ["host", "hosts"],
  service: ["service", "services"],
  deployment: ["deployment", "deployments"],
  provider: ["provider", "providers"],
  repository: ["repository", "repositories"],
  collection: ["collection", "collections"],
  project: ["project", "projects"],
  reference: ["shared reference", "shared references"],
};
const kindOrder: OperationalRepresentation["kind"][] = [
  "host",
  "service",
  "deployment",
  "provider",
  "repository",
  "collection",
  "project",
  "reference",
];
const count = (n: number, kind: OperationalRepresentation["kind"]) =>
  `${n} ${plural[kind][n === 1 ? 0 : 1]}`;
const resources = (n: number) =>
  `${n} unique ${n === 1 ? "resource" : "resources"}`;
const words = (value: string) => value.replaceAll("_", " ");
const toneRank: Record<BriefingTone, number> = {
  impact: 0,
  exposure: 1,
  notice: 2,
};
const capital = (value: string) => value[0]!.toUpperCase() + value.slice(1);

/** "3 reporting, 1 error" from facet counts, largest first. */
function states(counts: Record<string, number>, only?: readonly string[]) {
  return Object.entries(counts)
    .filter(([state, n]) => n > 0 && (!only || only.includes(state)))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([state, n]) => `${n} ${words(state)}`)
    .join(", ");
}

/** What the evidence supports, one sentence per facet with something to say.
 * Missing observations are stated as missing, never as healthy. */
function facts(summary: OperationalSummary): string[] {
  const { availability: a, coverage } = summary;
  const result: string[] = [];
  if (coverage.eligible === 0) result.push("No availability checks apply.");
  else if (coverage.monitored === 0)
    result.push(
      `No availability checks observed; ${coverage.eligible} eligible ${coverage.eligible === 1 ? "check is" : "checks are"} unmonitored.`,
    );
  else {
    // Unmonitored checks count as unknown availability; name them once.
    const unknown = a.unknown - coverage.unmonitored;
    const extra = [
      a.failing && `${a.failing} failing`,
      a.degraded && `${a.degraded} degraded`,
      unknown > 0 && `${unknown} unknown`,
      a.maintenance && `${a.maintenance} in maintenance`,
    ].filter(Boolean);
    result.push(
      `${a.passing} of ${coverage.monitored} observed ${coverage.monitored === 1 ? "check" : "checks"} passing${extra.length ? `; ${extra.join(", ")}` : ""}.` +
        (coverage.unmonitored
          ? ` ${coverage.unmonitored} eligible unmonitored.`
          : ""),
    );
  }
  const telemetry = states(summary.telemetry.counts);
  result.push(
    telemetry ? `Telemetry: ${telemetry}.` : "No telemetry observations.",
  );
  const capacity = states(summary.capacity.counts, ["critical", "pressure"]);
  if (capacity) result.push(`Capacity: ${capacity}.`);
  const security = states(summary.security.counts, [
    "confirmed_incident",
    "findings",
  ]);
  if (security) result.push(`Security: ${security}.`);
  const provider = states(summary.provider.counts, [
    "confirmed_local_impact",
    "potential_exposure",
    "advisory",
  ]);
  if (provider) result.push(`Provider notices: ${provider}.`);
  const work = states(summary.work.counts, [
    "running",
    "waiting_approval",
    "review",
    "queued",
    "failed",
  ]);
  if (work) result.push(`Work: ${work}.`);
  return result;
}

/** Each resource's own reasons for attention, most severe first. */
function resourceIssues(summary: OperationalSummary) {
  const result: { text: string; tone: BriefingTone }[] = [];
  const { availability: a } = summary;
  if (a.required.failing)
    result.push({ text: "Required check failing", tone: "impact" });
  if ((summary.security.counts.confirmed_incident ?? 0) > 0)
    result.push({ text: "Confirmed security incident", tone: "impact" });
  if ((summary.provider.counts.confirmed_local_impact ?? 0) > 0)
    result.push({ text: "Confirmed provider impact", tone: "impact" });
  if ((summary.provider.counts.potential_exposure ?? 0) > 0)
    result.push({ text: "Potential provider exposure", tone: "exposure" });
  if (a.optional.failing + a.unspecified.failing)
    result.push({ text: "Check failing", tone: "notice" });
  if (a.degraded) result.push({ text: "Check degraded", tone: "notice" });
  if ((summary.capacity.counts.critical ?? 0) > 0)
    result.push({ text: "Capacity critical", tone: "notice" });
  else if ((summary.capacity.counts.pressure ?? 0) > 0)
    result.push({ text: "Capacity under pressure", tone: "notice" });
  if ((summary.security.counts.findings ?? 0) > 0)
    result.push({ text: "Security findings reported", tone: "notice" });
  if ((summary.telemetry.counts.error ?? 0) > 0)
    result.push({ text: "Telemetry source error", tone: "notice" });
  if ((summary.work.counts.failed ?? 0) > 0)
    result.push({ text: "Work failed", tone: "notice" });
  return result;
}

const toneOf = (summary: OperationalSummary): BriefingTone | undefined => {
  const attention = operationalAttention(summary);
  if (attention !== "neutral") return attention;
  return resourceIssues(summary).length ? "notice" : undefined;
};

/** Hours, minutes or days before `now`. */
export function briefingAge(at: string, now: string) {
  const minutes = Math.max(0, (Date.parse(now) - Date.parse(at)) / 60000);
  if (!Number.isFinite(minutes)) return "";
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${Math.round(minutes)} min ago`;
  if (minutes < 48 * 60) return `${Math.round(minutes / 60)} h ago`;
  return `${Math.round(minutes / 1440)} d ago`;
}

/** A presentation briefing for one representation, or for the whole
 * landscape. It restates the scene's evaluated summaries, reviewed relations
 * and recorded events; it adds no evidence of its own. An unmapped
 * repository is named as unmapped, never as undeployed or idle. */
export function observatoryBriefing(
  scene: ObservatoryScene,
  events: InfrastructureOverview["events"],
  subjectId: string | null,
  primaryGroupIds: readonly string[] = [],
  activityLimit = 3,
): ObservatoryBriefing {
  const nodes = new Map(scene.representations.map((node) => [node.id, node]));
  const subject = subjectId ? nodes.get(subjectId) : undefined;
  const canonical = new Map(
    scene.representations
      .filter((node) => node.resourceId && !node.referenceTo)
      .map((node) => [node.resourceId!, node]),
  );
  const members = subject
    ? operationalMembers(scene, subject.id)
    : new Set(scene.membershipIndex.resourceIds);
  const summary = subject?.summary ?? scene.summary;
  const item = (node: OperationalRepresentation, note?: string) => {
    const tone = toneOf(node.summary);
    return {
      id: node.id,
      label: node.label,
      kind: node.kind,
      ...(note ? { note } : {}),
      ...(tone ? { tone } : {}),
    } satisfies BriefingItem;
  };
  const byAttention = (a: BriefingItem, b: BriefingItem) =>
    (a.tone ? toneRank[a.tone] : 3) - (b.tone ? toneRank[b.tone] : 3) ||
    a.label.localeCompare(b.label) ||
    a.id.localeCompare(b.id);

  const issues: BriefingIssue[] = [];
  for (const resourceId of members) {
    const node = canonical.get(resourceId);
    if (!node) continue;
    for (const issue of resourceIssues(node.summary))
      issues.push({ id: node.id, label: node.label, ...issue });
  }
  // A group's summary includes its members, so name an issue only on the
  // deepest resource that carries it.
  const within = new Map<string, Set<string>>();
  const descendants = (id: string) => {
    if (!within.has(id)) within.set(id, operationalMembers(scene, id));
    return within.get(id)!;
  };
  const owned = issues.filter(
    (issue) =>
      !issues.some(
        (other) =>
          other !== issue &&
          other.text === issue.text &&
          descendants(issue.id).has(nodes.get(other.id)!.resourceId!),
      ),
  );
  issues.splice(0, issues.length, ...owned);
  issues.sort(
    (a, b) =>
      toneRank[a.tone] - toneRank[b.tone] ||
      a.label.localeCompare(b.label) ||
      a.text.localeCompare(b.text),
  );

  const groups: BriefingGroup[] = [];
  const children = subject
    ? (scene.membershipIndex.children[subject.id] ?? [])
        .map((id) => nodes.get(id))
        .filter((node) => node !== undefined)
    : primaryGroupIds
        .map((id) => nodes.get(id))
        .filter((node) => node !== undefined);
  const repositoryMembers = [...members]
    .map((id) => canonical.get(id))
    .filter((node) => node !== undefined);
  let headline: string;
  if (!subject) {
    headline = `${children.length} primary ${children.length === 1 ? "group" : "groups"}, ${resources(scene.population.canonicalResourceCount)}.`;
    if (children.length)
      groups.push({
        title: "Primary groups",
        items: children.map((node) => item(node, resources(node.memberCount))),
      });
  } else if (
    subject.kind === "collection" &&
    repositoryMembers.length > 0 &&
    repositoryMembers.every((node) => node.kind === "repository")
  ) {
    // Repositories: reviewed deployments first, then project links, then
    // each nested collection with every name.
    const deployments = new Map<string, string[]>();
    for (const relation of scene.relations) {
      if (relation.type !== "deploys" || !members.has(relation.sourceId))
        continue;
      const target = canonical.get(relation.targetId);
      deployments.set(relation.sourceId, [
        ...(deployments.get(relation.sourceId) ?? []),
        target?.label ?? "an authorized deployment",
      ]);
    }
    const listed = new Set<string>();
    const deployed = repositoryMembers
      .filter((node) => deployments.has(node.resourceId!))
      .map((node) => {
        listed.add(node.id);
        return item(
          node,
          `deploys ${[...new Set(deployments.get(node.resourceId!))].sort().join(", ")}`,
        );
      })
      .sort(byAttention);
    if (deployed.length)
      groups.push({ title: "Deployed (reviewed relation)", items: deployed });
    const direct = children
      .filter((node) => node.kind === "repository" && !listed.has(node.id))
      .map((node) => {
        listed.add(node.id);
        return item(
          node,
          node.projects.map((project) => project.name).join(", ") || undefined,
        );
      })
      .sort(byAttention);
    if (direct.length)
      groups.push({ title: "Project repositories", items: direct });
    for (const nested of children.filter(
      (node) => node.kind !== "repository",
    )) {
      const items = [...operationalMembers(scene, nested.id)]
        .map((id) => canonical.get(id))
        .filter((node) => node !== undefined && !listed.has(node.id))
        .map((node) => {
          listed.add(node!.id);
          return item(node!);
        })
        .sort(byAttention);
      if (items.length) groups.push({ title: nested.label, items });
    }
    const unmapped = repositoryMembers.filter(
      (node) => !node.projects.length,
    ).length;
    const linked = repositoryMembers.length - unmapped;
    headline = `${count(repositoryMembers.length, "repository")}: ${[
      deployed.length && `${deployed.length} with a reviewed deployment`,
      !unmapped
        ? "all linked to projects"
        : !linked
          ? "all unmapped"
          : `${linked} linked to projects, ${unmapped} unmapped`,
    ]
      .filter(Boolean)
      .join(", ")}.`;
  } else {
    const byKind = new Map<OperationalRepresentation["kind"], BriefingItem[]>();
    for (const node of children)
      byKind.set(node.kind, [
        ...(byKind.get(node.kind) ?? []),
        item(
          node,
          node.memberCount > 1 ? resources(node.memberCount) : undefined,
        ),
      ]);
    for (const kind of kindOrder) {
      const items = byKind.get(kind);
      if (items)
        groups.push({
          title: capital(plural[kind][1]),
          items: items.sort(byAttention),
        });
    }
    headline = `${resources(subject.memberCount)}${
      children.length
        ? `: ${kindOrder
            .filter((kind) => byKind.has(kind))
            .map((kind) => count(byKind.get(kind)!.length, kind))
            .join(", ")} directly inside`
        : ""
    }.`;
  }

  const activity = events
    .filter((event) => event.resourceId && members.has(event.resourceId))
    .sort(
      (a, b) =>
        b.occurredAt.localeCompare(a.occurredAt) || a.id.localeCompare(b.id),
    )
    .slice(0, activityLimit)
    .flatMap((event) => {
      const node = canonical.get(event.resourceId!);
      return node
        ? [
            {
              id: event.id,
              subjectId: node.id,
              label: node.label,
              summary: event.summary,
              occurredAt: event.occurredAt,
              age: briefingAge(event.occurredAt, scene.evaluatedAt),
            },
          ]
        : [];
    });

  return {
    subjectId: subject?.id ?? null,
    title: subject?.label ?? "Complete authorized landscape",
    headline,
    facts: facts(summary),
    issues,
    groups,
    activity,
  };
}
