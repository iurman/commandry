// Authored, fictional records for the public site's illustrative examples.
// Nothing here is read from Commandry's database or the owner's inventory.
// Every count shown on the page is derived from these arrays.

export type RecordKind =
  | "check"
  | "service"
  | "host"
  | "project"
  | "repository"
  | "capture"
  | "runbook"
  | "work"
  | "brief";

export type WorldRecord = {
  id: string;
  kind: RecordKind;
  name: string;
  short: string;
  kindLabel: string;
  summary: string;
  changed: string;
};

export type Relation = {
  id: string;
  from: string;
  to: string;
  label: string;
};

export type Point = { x: number; y: number };

export const records: readonly WorldRecord[] = [
  {
    id: "check",
    kind: "check",
    name: "HTTPS check",
    short: "HTTPS check",
    kindLabel: "Check",
    summary:
      "A native check that requests lantern-api over HTTPS every five minutes and reads the certificate it presents.",
    changed:
      "09:12 - certificate valid for 6 more days, below its 14-day threshold.",
  },
  {
    id: "service",
    kind: "service",
    name: "lantern-api",
    short: "lantern-api",
    kindLabel: "Service",
    summary:
      "The HTTPS API behind the Lantern reader. It is the resource the check observes.",
    changed: "Moved into attention when the certificate crossed its threshold.",
  },
  {
    id: "host",
    kind: "host",
    name: "atlas",
    short: "atlas",
    kindLabel: "Host",
    summary:
      "A home server running Debian. lantern-api is one of the services it hosts.",
    changed: "No change. Its own checks are passing.",
  },
  {
    id: "project",
    kind: "project",
    name: "Lantern",
    short: "Lantern",
    kindLabel: "Project",
    summary:
      "A self-hosted reading archive. The project ties the service, its source, its notes and its work together.",
    changed: "Gained one signal and one linked next action.",
  },
  {
    id: "repository",
    kind: "repository",
    name: "lantern/reader",
    short: "lantern/reader",
    kindLabel: "Repository",
    summary:
      "Source for the reader and its API. The repository stays on its forge; Commandry links to it.",
    changed: "No change. Cited as evidence in the brief.",
  },
  {
    id: "capture",
    kind: "capture",
    name: "Renewal note",
    short: "Renewal note",
    kindLabel: "Capture",
    summary:
      'Captured in March, kept exactly as written: "Cert renewal is manual since the DNS move. Use the runbook, not certbot."',
    changed:
      "Recalled because it is linked to the project the signal landed in.",
  },
  {
    id: "runbook",
    kind: "runbook",
    name: "Certificate runbook",
    short: "Runbook",
    kindLabel: "Knowledge",
    summary:
      "The renewal procedure: issue, install, reload, verify. Five steps, last used in March.",
    changed: "Recalled as the procedure for the next action.",
  },
  {
    id: "work",
    kind: "work",
    name: "Renew certificate",
    short: "Renew cert",
    kindLabel: "Work",
    summary:
      "Renew the lantern-api certificate before November 13. Primary project: Lantern. Related: the signal, the note and the runbook.",
    changed: "Linked as the next action, carrying the reasons it exists.",
  },
  {
    id: "brief",
    kind: "brief",
    name: "Agent brief",
    short: "Brief",
    kindLabel: "Brief",
    summary:
      "A bounded context for an agent: one objective, cited sources, what it may read and propose, and where a person reviews.",
    changed: "Assembled from the work item and its evidence.",
  },
];

export const relations: readonly Relation[] = [
  { id: "observes", from: "check", to: "service", label: "observes" },
  { id: "runs-on", from: "service", to: "host", label: "runs on" },
  { id: "belongs", from: "service", to: "project", label: "belongs to" },
  { id: "source", from: "repository", to: "project", label: "source for" },
  { id: "captured", from: "capture", to: "project", label: "captured for" },
  { id: "documents", from: "runbook", to: "project", label: "documents" },
  { id: "next", from: "project", to: "work", label: "next action" },
  { id: "scoped", from: "work", to: "brief", label: "scoped into" },
];

export type Packet = { edge: string; reverse?: boolean; delay: number };

export type Step = {
  id: string;
  title: string;
  time: string;
  body: string;
  focus: readonly string[];
  edges: readonly string[];
  packets: readonly Packet[];
  reveals: readonly string[];
};

export const steps: readonly Step[] = [
  {
    id: "observe",
    title: "Observe",
    time: "09:12",
    body: "An HTTPS check on lantern-api reads a certificate with six days left.",
    focus: ["check", "service"],
    edges: ["observes"],
    packets: [{ edge: "observes", delay: 200 }],
    reveals: [],
  },
  {
    id: "relate",
    title: "Relate",
    time: "09:12",
    body: "The service already runs on atlas and belongs to Lantern, so the signal lands in a project instead of a dashboard.",
    focus: ["service", "host", "project"],
    edges: ["runs-on", "belongs"],
    packets: [
      { edge: "runs-on", delay: 150 },
      { edge: "belongs", delay: 450 },
    ],
    reveals: [],
  },
  {
    id: "recall",
    title: "Recall",
    time: "09:12",
    body: "The project brings back a March note, in its original words, and the runbook it points to.",
    focus: ["project", "capture", "runbook"],
    edges: ["captured", "documents"],
    packets: [
      { edge: "captured", reverse: true, delay: 150 },
      { edge: "documents", reverse: true, delay: 450 },
    ],
    reveals: [],
  },
  {
    id: "plan",
    title: "Plan",
    time: "09:13",
    body: "A next action is linked: renew the certificate before November 13, with the signal, note and runbook attached.",
    focus: ["project", "work"],
    edges: ["next"],
    packets: [{ edge: "next", delay: 200 }],
    reveals: ["work"],
  },
  {
    id: "brief",
    title: "Brief",
    time: "09:13",
    body: "The work becomes a bounded brief: one objective, three cited sources, a read-and-propose scope, and a review point.",
    focus: ["work", "brief", "repository", "runbook", "capture"],
    edges: ["scoped", "source"],
    packets: [
      { edge: "source", delay: 100 },
      { edge: "scoped", delay: 500 },
    ],
    reveals: ["work", "brief"],
  },
];

// Two composed layouts share one set of records. Coordinates are in the
// viewBox units of each layout.
export const layouts = {
  wide: {
    width: 760,
    height: 500,
    points: {
      check: { x: 92, y: 78 },
      service: { x: 262, y: 138 },
      host: { x: 118, y: 318 },
      project: { x: 420, y: 262 },
      repository: { x: 300, y: 430 },
      capture: { x: 588, y: 92 },
      runbook: { x: 668, y: 244 },
      work: { x: 532, y: 420 },
      brief: { x: 690, y: 420 },
    },
  },
  tall: {
    width: 360,
    height: 600,
    points: {
      check: { x: 74, y: 52 },
      service: { x: 250, y: 92 },
      host: { x: 74, y: 196 },
      project: { x: 186, y: 300 },
      repository: { x: 70, y: 412 },
      capture: { x: 290, y: 206 },
      runbook: { x: 294, y: 404 },
      work: { x: 110, y: 528 },
      brief: { x: 268, y: 528 },
    },
  },
} as const satisfies Record<
  string,
  { width: number; height: number; points: Record<string, Point> }
>;

export type LayoutName = keyof typeof layouts;

export function recordById(id: string): WorldRecord {
  const record = records.find((candidate) => candidate.id === id);
  if (!record) throw new Error(`Unknown record ${id}`);
  return record;
}

export function relationById(id: string): Relation {
  const relation = relations.find((candidate) => candidate.id === id);
  if (!relation) throw new Error(`Unknown relation ${id}`);
  return relation;
}

export function relationsOf(id: string): Relation[] {
  return relations.filter(
    (relation) => relation.from === id || relation.to === id,
  );
}

export function edgeGeometry(
  layout: LayoutName,
  relation: Relation,
): { d: string; mid: Point } {
  const points: Record<string, Point> = layouts[layout].points;
  const a = points[relation.from];
  const b = points[relation.to];
  if (!a || !b) throw new Error(`Unplaced relation ${relation.id}`);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  // A gentle S-curve that leaves and arrives along the dominant axis.
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const k = (horizontal ? dx : dy) * 0.45;
  const c1 = horizontal ? { x: a.x + k, y: a.y } : { x: a.x, y: a.y + k };
  const c2 = horizontal ? { x: b.x - k, y: b.y } : { x: b.x, y: b.y - k };
  return {
    d: `M ${a.x} ${a.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${b.x} ${b.y}`,
    mid: {
      x: (a.x + 3 * c1.x + 3 * c2.x + b.x) / 8,
      y: (a.y + 3 * c1.y + 3 * c2.y + b.y) / 8,
    },
  };
}

const counted = (kinds: readonly RecordKind[]) =>
  records.filter((record) => kinds.includes(record.kind)).length;

export const exampleCounts = {
  records: records.length,
  relations: relations.length,
  resources: counted(["service", "host", "repository"]),
  knowledge: counted(["capture", "runbook"]),
  signals: 1,
  steps: steps.length,
};

// The lens study re-arranges the same records. Positions are percentages of
// the stage; `focus` records are the subject of that lens.
export type Lens = {
  id: string;
  label: string;
  title: string;
  body: string;
  focus: readonly string[];
  tags: Readonly<Record<string, string>>;
  positions: Readonly<Record<string, Point>>;
};

export const lensRecords = [
  "project",
  "service",
  "host",
  "repository",
  "capture",
  "runbook",
  "work",
] as const;

export const lenses: readonly Lens[] = [
  {
    id: "project",
    label: "Project",
    title: "A project is the anchor, not a folder.",
    body: "Lantern holds typed relations to the service it runs, the source it ships from, the notes about it and the work in front of it. Nothing is copied in; each record keeps its own home.",
    focus: ["project"],
    tags: {
      service: "runs",
      host: "via lantern-api",
      repository: "source",
      capture: "note",
      runbook: "procedure",
      work: "next action",
    },
    positions: {
      project: { x: 50, y: 48 },
      service: { x: 22, y: 20 },
      host: { x: 12, y: 58 },
      repository: { x: 26, y: 86 },
      capture: { x: 76, y: 18 },
      runbook: { x: 88, y: 56 },
      work: { x: 72, y: 86 },
    },
  },
  {
    id: "work",
    label: "Work",
    title: "Work carries the reason it exists.",
    body: 'A work item has one primary project and any number of related records. Opening "Renew certificate" shows the signal that raised it and the knowledge needed to do it.',
    focus: ["work"],
    tags: {
      project: "primary project",
      service: "raised by signal",
      runbook: "how to",
      capture: "why manual",
      repository: "context",
      host: "not related",
    },
    positions: {
      work: { x: 50, y: 48 },
      project: { x: 50, y: 14 },
      service: { x: 18, y: 32 },
      runbook: { x: 82, y: 34 },
      capture: { x: 82, y: 68 },
      repository: { x: 18, y: 68 },
      host: { x: 50, y: 88 },
    },
  },
  {
    id: "knowledge",
    label: "Knowledge",
    title: "Captures keep their original words.",
    body: "A note goes in as written, with no filing decision first. Any classification is added beside the original, never in place of it, and the note stays linked to what it is about.",
    focus: ["capture", "runbook"],
    tags: {
      project: "about",
      work: "cited by",
      service: "mentions",
      repository: "unrelated",
      host: "unrelated",
    },
    positions: {
      capture: { x: 36, y: 44 },
      runbook: { x: 64, y: 44 },
      project: { x: 50, y: 14 },
      work: { x: 50, y: 82 },
      service: { x: 14, y: 76 },
      repository: { x: 86, y: 80 },
      host: { x: 10, y: 22 },
    },
  },
  {
    id: "infrastructure",
    label: "Infrastructure",
    title: "Systems arrive with their context.",
    body: "Hosts and services form a hierarchy with observed checks. A resource without a check reads as unknown, never as healthy, and every observation keeps the time it was made.",
    focus: ["host", "service"],
    tags: {
      project: "owner project",
      repository: "deploys from",
      work: "open action",
      capture: "related note",
      runbook: "procedure",
    },
    positions: {
      host: { x: 50, y: 22 },
      service: { x: 50, y: 54 },
      project: { x: 16, y: 54 },
      repository: { x: 84, y: 54 },
      work: { x: 30, y: 86 },
      runbook: { x: 70, y: 86 },
      capture: { x: 88, y: 18 },
    },
  },
];

// Observatory-style check strip. "unknown" resources have no check and never
// receive a probe dot.
export type CheckedResource = {
  id: string;
  name: string;
  kind: string;
  state: "passing" | "attention" | "unknown";
  reading: string;
};

export const checkedResources: readonly CheckedResource[] = [
  {
    id: "atlas",
    name: "atlas",
    kind: "Host",
    state: "passing",
    reading: "Collector reported 2 min ago",
  },
  {
    id: "lantern-api",
    name: "lantern-api",
    kind: "Service",
    state: "attention",
    reading: "HTTPS 200, certificate 6 days left",
  },
  {
    id: "reader-web",
    name: "reader-web",
    kind: "Service",
    state: "passing",
    reading: "HTTPS 200 in 84 ms",
  },
  {
    id: "edge-dns",
    name: "edge DNS",
    kind: "Zone",
    state: "passing",
    reading: "TCP 53 open in 12 ms",
  },
  {
    id: "backup-target",
    name: "backup target",
    kind: "Storage",
    state: "unknown",
    reading: "No check configured",
  },
];
