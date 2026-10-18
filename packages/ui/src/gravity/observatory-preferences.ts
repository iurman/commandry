import { resourceIcon } from "./resource-icons";

export const observatoryStorageKey = "commandry.infrastructure.observatory.v2";
export const legacyObservatoryStorageKey =
  "commandry.infrastructure.gravity.v1";
export const observatoryGroupings = [
  "operational",
  "hosts",
  "projects",
  "providers",
  "inventory",
  "custom",
] as const;
export type ObservatoryGrouping = (typeof observatoryGroupings)[number];
export type ObservatorySector = {
  id: string;
  label: string;
  resourceIds: string[];
  grouping: Exclude<ObservatoryGrouping, "custom">;
};
/** "members" shows every nested member the server reveals; "groups" collapses
 * the terrain to root groups plus explicit expansions. */
export type ObservatoryReveal = "members" | "groups";
export type ObservatoryQuery = {
  grouping: ObservatoryGrouping;
  environment: string | null;
  expandedRepresentationIds: string[];
  reveal: ObservatoryReveal;
  search: string;
  sectors: ObservatorySector[];
  viewRevision: string;
};
export type ObservatoryPresentation = {
  grouping: ObservatoryGrouping;
  reveal: ObservatoryReveal;
  size: "structural" | "total-ram" | "uniform";
  theme: "system" | "porcelain" | "midnight";
  palette: "semantic" | "ocean" | "earth";
  colors: Record<string, string>;
  /** Canonical resource ID -> chosen icon. Absent means automatic. */
  icons: Record<string, string>;
  camera: "composed" | "orbit" | "tour" | "manual";
  ambient: boolean;
  lens: boolean;
  textScale: 1 | 1.25 | 1.5;
  tv: boolean;
  paused: boolean;
  reducedMotion: boolean;
  sectors: ObservatorySector[];
};
export type ObservatoryLocalView = {
  id: string;
  name: string;
  scopeDigest: string;
  presentation: ObservatoryPresentation;
  query: ObservatoryQuery;
};
export type ObservatoryPreferences = ObservatoryPresentation & {
  version: 2;
  views: ObservatoryLocalView[];
};
export function defaultObservatoryPreferences(): ObservatoryPreferences {
  return {
    version: 2,
    grouping: "operational",
    reveal: "members",
    size: "structural",
    theme: "system",
    palette: "semantic",
    colors: {},
    icons: {},
    camera: "composed",
    ambient: false,
    lens: false,
    textScale: 1,
    tv: false,
    paused: false,
    reducedMotion: false,
    sectors: [],
    views: [],
  };
}
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const text = (value: unknown, fallback = "") =>
  typeof value === "string" ? value.trim() : fallback;
const safeKey = (value: string) =>
  !!value && !["__proto__", "constructor", "prototype"].includes(value);
export function normalizeObservatorySectors(
  value: unknown,
  authorizedIds?: ReadonlySet<string>,
): ObservatorySector[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: ObservatorySector[] = [];
  for (const item of value) {
    const row = object(item),
      id = text(row.id),
      label = text(row.label);
    if (
      !safeKey(id) ||
      !label ||
      seen.has(id) ||
      !observatoryGroupings.includes(row.grouping as ObservatoryGrouping) ||
      row.grouping === "custom"
    )
      continue;
    const resourceIds = Array.isArray(row.resourceIds)
      ? [
          ...new Set(
            row.resourceIds.filter(
              (id): id is string =>
                typeof id === "string" &&
                safeKey(id) &&
                (!authorizedIds || authorizedIds.has(id)),
            ),
          ),
        ].sort()
      : [];
    if (authorizedIds && !resourceIds.length) continue;
    seen.add(id);
    result.push({
      id,
      label,
      resourceIds,
      grouping: row.grouping as ObservatorySector["grouping"],
    });
  }
  return result.sort((a, b) => a.id.localeCompare(b.id));
}
export function observatoryPresentation(
  value: unknown,
): ObservatoryPresentation {
  const saved = object(value),
    defaults = defaultObservatoryPreferences();
  const colors = Object.fromEntries(
    Object.entries(object(saved.colors)).filter(
      ([id, value]) =>
        safeKey(id) &&
        typeof value === "string" &&
        /^#[0-9a-f]{6}$/i.test(value),
    ),
  );
  return {
    grouping: observatoryGroupings.includes(
      saved.grouping as ObservatoryGrouping,
    )
      ? (saved.grouping as ObservatoryGrouping)
      : defaults.grouping,
    reveal: saved.reveal === "groups" ? "groups" : "members",
    size:
      saved.size === "total-ram"
        ? "total-ram"
        : saved.size === "uniform"
          ? "uniform"
          : "structural",
    theme: ["system", "porcelain", "midnight"].includes(String(saved.theme))
      ? (saved.theme as ObservatoryPresentation["theme"])
      : "system",
    palette: ["semantic", "ocean", "earth"].includes(String(saved.palette))
      ? (saved.palette as ObservatoryPresentation["palette"])
      : "semantic",
    colors: colors as Record<string, string>,
    icons: Object.fromEntries(
      Object.entries(object(saved.icons)).filter(
        ([id, value]) =>
          safeKey(id) && typeof value === "string" && !!resourceIcon(value),
      ),
    ) as Record<string, string>,
    camera: ["composed", "orbit", "tour", "manual"].includes(
      String(saved.camera),
    )
      ? (saved.camera as ObservatoryPresentation["camera"])
      : "composed",
    ambient: saved.ambient === true,
    lens: saved.lens === true,
    textScale:
      saved.textScale === 1.25 || saved.textScale === 1.5 ? saved.textScale : 1,
    tv: saved.tv === true,
    paused: saved.paused === true,
    reducedMotion: saved.reducedMotion === true,
    sectors: normalizeObservatorySectors(saved.sectors),
  };
}
function query(
  value: unknown,
  display: ObservatoryPresentation,
): ObservatoryQuery {
  const saved = object(value);
  return {
    grouping: observatoryGroupings.includes(
      saved.grouping as ObservatoryGrouping,
    )
      ? (saved.grouping as ObservatoryGrouping)
      : display.grouping,
    environment: text(saved.environment) || null,
    expandedRepresentationIds: Array.isArray(saved.expandedRepresentationIds)
      ? [
          ...new Set(
            saved.expandedRepresentationIds.filter(
              (id): id is string => typeof id === "string" && safeKey(id),
            ),
          ),
        ].sort()
      : [],
    reveal:
      saved.reveal === "groups" || saved.reveal === "members"
        ? saved.reveal
        : display.reveal,
    search: typeof saved.search === "string" ? saved.search : "",
    sectors: normalizeObservatorySectors(saved.sectors ?? display.sectors),
    viewRevision: text(saved.viewRevision, "local:1") || "local:1",
  };
}
/** Display settings are device-local, never a canonical mapping or permission grant.
 * Corrupt v2 data resets; only an absent v2 key permits the v1 migration.
 */
export function readObservatoryPreferences(
  raw: string | null,
  legacyRaw: string | null = null,
): ObservatoryPreferences {
  try {
    if (raw !== null) {
      const saved = object(JSON.parse(raw));
      if (saved.version !== 2) return defaultObservatoryPreferences();
      const display = observatoryPresentation(saved),
        views: ObservatoryLocalView[] = [],
        ids = new Set<string>();
      for (const input of Array.isArray(saved.views) ? saved.views : []) {
        const view = object(input),
          id = text(view.id),
          name = text(view.name),
          scopeDigest = text(view.scopeDigest);
        if (!safeKey(id) || !name || !scopeDigest || ids.has(id)) continue;
        const settings = observatoryPresentation(view.presentation);
        ids.add(id);
        views.push({
          id,
          name,
          scopeDigest,
          presentation: settings,
          query: query(view.query, settings),
        });
      }
      return { ...display, version: 2, views };
    }
    const old = object(JSON.parse(legacyRaw ?? "null"));
    if (old.version !== 1) return defaultObservatoryPreferences();
    const byLabel = new Map<string, string[]>();
    for (const [resourceId, value] of Object.entries(object(old.assignments))) {
      const label = text(value);
      if (!safeKey(resourceId) || !label) continue;
      byLabel.set(label, [...(byLabel.get(label) ?? []), resourceId]);
    }
    return {
      ...defaultObservatoryPreferences(),
      grouping: ["hosts", "projects", "custom"].includes(String(old.grouping))
        ? (old.grouping as ObservatoryGrouping)
        : "operational",
      theme: observatoryPresentation(old).theme,
      colors: observatoryPresentation(old).colors,
      sectors: [...byLabel]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([label, resourceIds]) => ({
          id: `legacy:${encodeURIComponent(label)}`,
          label,
          resourceIds: resourceIds.sort(),
          grouping: "hosts",
        })),
    };
  } catch {
    return defaultObservatoryPreferences();
  }
}
/** Remove hidden IDs and private empty sectors before a local view is reused. */
export function authorizeObservatoryQuery(
  value: ObservatoryQuery,
  scene: {
    membershipIndex: { resourceIds: readonly string[] };
    representations: readonly { id: string }[];
    viewRevision: string;
  },
): ObservatoryQuery {
  const authorizedIds = new Set(scene.membershipIndex.resourceIds),
    representations = new Set(scene.representations.map((node) => node.id));
  return {
    ...value,
    expandedRepresentationIds: [...new Set(value.expandedRepresentationIds)]
      .filter((id) => representations.has(id))
      .sort(),
    sectors: normalizeObservatorySectors(value.sectors, authorizedIds),
  };
}
