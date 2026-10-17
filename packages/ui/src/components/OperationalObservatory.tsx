"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type {
  InfrastructureOverview,
  ObservatorySceneDto as ObservatoryScene,
} from "@commandry/contracts";
import {
  ObservatoryCanonicalViews,
  type ObservatoryViewsClient,
} from "./ObservatoryCanonicalViews";
import { FloatingSurface } from "./FloatingSurface";
import {
  ObservatoryWorkDock,
  type ObservatoryWorkDockProps,
} from "./ObservatoryWorkDock";
import {
  ObservatoryProviderFeed,
  type ObservatoryProviderFeedClient,
} from "./ObservatoryProviderFeed";
import {
  ObservatoryReviewControls,
  type ObservatoryReviewClient,
} from "./ObservatoryReviewControls";
import {
  ObservatoryOperationalEvidence,
  type ObservatoryEvidenceClient,
} from "./ObservatoryOperationalEvidence";
import {
  mapOperationalEvents,
  operationalAttention,
  operationalMembers,
  OperationalLayout,
  OperationalRecordedActivity,
} from "../gravity/operational-layout";
import type {
  OperationalRepresentation,
  OperationalSummary,
} from "../gravity/operational-layout";
import {
  authorizeObservatoryQuery,
  defaultObservatoryPreferences,
  legacyObservatoryStorageKey,
  normalizeObservatorySectors,
  observatoryGroupings,
  observatoryPresentation,
  observatoryStorageKey,
  readObservatoryPreferences,
} from "../gravity/observatory-preferences";
import type {
  ObservatoryPreferences,
  ObservatoryQuery,
  ObservatorySector,
} from "../gravity/observatory-preferences";
import type {
  Anchor,
  ObservatoryRenderer,
  RendererSettings,
} from "../gravity/renderer";
import type { CameraMode } from "../gravity/model";
import "./operational-observatory.css";

export type OperationalObservatoryProps = {
  scene: ObservatoryScene;
  snapshot: InfrastructureOverview;
  selectedId: string | null;
  onSelect: (resourceId: string) => void;
  onProject: (projectId: string) => void;
  onQueryChange: (query: ObservatoryQuery) => void;
  initialSearch?: string;
  viewsClient?: ObservatoryViewsClient;
  evidenceClient?: ObservatoryEvidenceClient;
  workClient?: ObservatoryWorkDockProps["loadPage"];
  workProjectIds?: string[] | undefined;
  providerFeedClient?: ObservatoryProviderFeedClient;
  reviewClient?: ObservatoryReviewClient;
  onReviewed?: () => void;
  scopeProjectId?: string | null;
  paused?: boolean;
  delayed?: boolean;
  compact?: boolean;
  dark?: boolean;
  /** Coordinator integration: call the main renderer's focusSubject(id, options).
   * Null means overview; restore means return to the prior main-camera pose.
   * settings.focus controls only the optional lens and is never main focus.
   */
  onCameraFocus?: (
    renderer: ObservatoryRenderer,
    representationId: string | null,
    options: { immediate: boolean; restore: boolean; refit?: boolean },
  ) => void;
};
type HistoryEntry = {
  focusId: string | null;
  resourceId: string | null;
  query: ObservatoryQuery;
  camera: CameraMode;
};
const kindNames: Record<OperationalRepresentation["kind"], string> = {
  host: "Host",
  service: "Service",
  deployment: "Deployment",
  provider: "Provider",
  repository: "Repository",
  collection: "Collection",
  project: "Project",
  reference: "Shared reference",
};
const kindMarks: Record<OperationalRepresentation["kind"], string> = {
  host: "H",
  service: "S",
  deployment: "D",
  provider: "P",
  repository: "R",
  collection: "C",
  project: "G",
  reference: "Ref",
};
const words = (value: string) => value.replaceAll("_", " ");
function safeEvidence(value: string): string | null {
  if (/^\/(?!\/)/.test(value)) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
function Evidence({ values }: { values: readonly string[] }) {
  return (
    <ul className="cmd-op-evidence">
      {[...new Set(values)].map((value) => {
        const href = safeEvidence(value);
        return (
          <li key={value}>
            {href ? (
              <a
                href={href}
                target={href.startsWith("https:") ? "_blank" : undefined}
                rel="noreferrer"
              >
                Source evidence
              </a>
            ) : (
              <code>{value}</code>
            )}
          </li>
        );
      })}
    </ul>
  );
}
function StateCounts({ summary }: { summary: OperationalSummary }) {
  return (
    <>
      <p className="cmd-op-counts">
        {summary.availability.passing} passing / {summary.availability.failing}{" "}
        failing / {summary.availability.degraded} degraded /{" "}
        {summary.availability.unknown} unknown /{" "}
        {summary.availability.maintenance} maintenance
      </p>
      <p>
        {summary.coverage.monitored} of {summary.coverage.eligible} eligible
        checks observed.{" "}
        {summary.coverage.state === "not_monitored"
          ? "Not monitored"
          : summary.coverage.state === "incomplete"
            ? "Coverage incomplete"
            : "Observed coverage complete"}
        .
      </p>
    </>
  );
}
function Facet({
  label,
  value,
}: {
  label: string;
  value: { counts: Record<string, number>; signalIds: string[] };
}) {
  const states = Object.entries(value.counts).filter(([, count]) => count > 0);
  return (
    <div className="cmd-op-facet">
      <h4>{label}</h4>
      <p>
        {states.length
          ? states
              .map(([state, count]) => `${count} ${words(state)}`)
              .join(" / ")
          : "No qualifying observation"}
      </p>
    </div>
  );
}
function pathTo(scene: ObservatoryScene, id: string): string[] {
  const nodes = new Map(scene.representations.map((node) => [node.id, node]));
  const path: string[] = [],
    seen = new Set<string>();
  let current: string | null = id;
  while (current && nodes.has(current) && !seen.has(current)) {
    seen.add(current);
    path.unshift(current);
    current = nodes.get(current)!.parentRepresentationId;
  }
  return path;
}
function OutlineNode({
  id,
  scene,
  byId,
  expanded,
  selected,
  activate,
  toggle,
}: {
  id: string;
  scene: ObservatoryScene;
  byId: Map<string, OperationalRepresentation>;
  expanded: Set<string>;
  selected: string | null;
  activate: (id: string) => void;
  toggle: (id: string) => void;
}) {
  const node = byId.get(id);
  if (!node) return null;
  const children = scene.membershipIndex.children[id] ?? [];
  return (
    <li
      data-representation-id={node.id}
      data-resource-id={node.resourceId ?? undefined}
      data-reference={node.referenceTo ?? undefined}
    >
      <div
        className="cmd-op-outline-row"
        data-attention={operationalAttention(node.summary)}
      >
        {children.length > 0 ? (
          <button
            type="button"
            className="cmd-op-expand"
            aria-label={`${expanded.has(id) ? "Collapse" : "Expand"} ${node.label}`}
            aria-expanded={expanded.has(id)}
            onClick={() => toggle(id)}
          >
            {expanded.has(id) ? "-" : "+"}
          </button>
        ) : (
          <span className="cmd-op-expand" aria-hidden="true">
            .
          </span>
        )}
        <button
          type="button"
          aria-pressed={selected === id}
          onClick={() => activate(id)}
        >
          <span
            className="cmd-op-kind"
            data-kind={node.kind}
            aria-hidden="true"
          >
            {kindMarks[node.kind]}
          </span>
          <span>
            {node.label}
            <small>
              {kindNames[node.kind]} / {node.memberCount} unique{" "}
              {node.memberCount === 1 ? "resource" : "resources"}
              {node.referenceTo ? " / alias of canonical resource" : ""}
            </small>
          </span>
        </button>
        {operationalAttention(node.summary) !== "neutral" && (
          <span className="cmd-op-status">
            {operationalAttention(node.summary) === "impact"
              ? "Confirmed impact"
              : "Potential exposure"}
          </span>
        )}
      </div>
      {children.length > 0 && expanded.has(id) && (
        <ul>
          {children.map((child) => (
            <OutlineNode
              key={child}
              id={child}
              scene={scene}
              byId={byId}
              expanded={expanded}
              selected={selected}
              activate={activate}
              toggle={toggle}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/** A scope change remounts transient history, selection and event baselines so
 * previous authorized names cannot survive in the new scene's local UI cache.
 */
export function OperationalObservatory(props: OperationalObservatoryProps) {
  return (
    <OperationalObservatoryView key={props.scene.scopeDigest} {...props} />
  );
}
function OperationalObservatoryView({
  scene,
  snapshot,
  selectedId,
  onSelect,
  onProject,
  onQueryChange,
  onCameraFocus,
  initialSearch = "",
  viewsClient,
  evidenceClient,
  providerFeedClient,
  reviewClient,
  onReviewed,
  workClient,
  workProjectIds,
  scopeProjectId = null,
  paused = false,
  delayed = false,
  compact = false,
  dark = false,
}: OperationalObservatoryProps) {
  const reviewResources = useMemo(() => {
    const canonical = new Set(scene.membershipIndex.resourceIds);
    const records = snapshot.items.filter((item) => canonical.has(item.id));
    return records.length === canonical.size &&
      new Set(records.map((item) => item.id)).size === canonical.size
      ? records.map((item) => ({
          id: item.id,
          name: item.name,
          kind: item.kind,
        }))
      : null;
  }, [scene.membershipIndex.resourceIds, snapshot.items]);
  const [preferences, setPreferences] = useState(defaultObservatoryPreferences);
  const [initialResourceIds] = useState(
    () => new Set(scene.membershipIndex.resourceIds),
  );
  const [loaded, setLoaded] = useState(false),
    [systemDark, setSystemDark] = useState(false),
    [systemReduced, setSystemReduced] = useState(false);
  const [camera, setCamera] = useState<CameraMode>("composed"),
    [reading, setReading] = useState(false);
  const initialExpanded = scene.representations
    .filter((node) =>
      (scene.membershipIndex.children[node.id] ?? []).some((child) =>
        scene.visibleRepresentationIds.includes(child),
      ),
    )
    .map((node) => node.id);
  const [query, setQuery] = useState<ObservatoryQuery>({
    grouping: scene.grouping,
    environment: null,
    expandedRepresentationIds: initialExpanded,
    search: initialSearch,
    sectors: [],
    viewRevision: scene.viewRevision,
  });
  const initialSelection = selectedId
    ? (scene.representations.find(
        (node) => node.resourceId === selectedId && !node.referenceTo,
      )?.id ?? null)
    : null;
  const [focusId, setFocusId] = useState<string | null>(initialSelection);
  const [focusSequence, setFocusSequence] = useState(0);
  const lastExternalSelection = useRef(selectedId);
  const [appearanceOpen, setAppearanceOpen] = useState(false),
    [viewName, setViewName] = useState(""),
    [sectorName, setSectorName] = useState("");
  const [sectorResourceId, setSectorResourceId] = useState(""),
    [sectorGrouping, setSectorGrouping] =
      useState<ObservatorySector["grouping"]>("hosts");
  const [error, setError] = useState<string | null>(null),
    [ready, setReady] = useState(false),
    [anchors, setAnchors] = useState<Anchor[]>([]);
  const [layout] = useState(() => new OperationalLayout()),
    [activity] = useState(() => new OperationalRecordedActivity());
  const history = useRef<HistoryEntry[]>([]),
    beforeSearch = useRef<HistoryEntry | null>(null),
    revision = useRef(0);
  const canvas = useRef<HTMLDivElement>(null),
    renderer = useRef<ObservatoryRenderer | null>(null),
    lens = useRef<HTMLDivElement>(null);
  const elements = useRef(new Map<string, HTMLButtonElement>()),
    anchorPositions = useRef(new Map<string, Anchor>());
  const restoreCamera = useRef(false);
  const lastCameraRequest = useRef<{
    id: string | null;
    sequence: number;
    family: string;
    restored: boolean;
  } | null>(null);
  const projection = useMemo(() => {
    try {
      return { value: layout.project(scene, preferences), error: null };
    } catch (cause) {
      return {
        value: null,
        error:
          cause instanceof Error
            ? cause.message
            : "The projected scene is unavailable",
      };
    }
  }, [scene, preferences, layout]);
  const nodes = useMemo(
    () => new Map(scene.representations.map((node) => [node.id, node])),
    [scene],
  );
  const selected = focusId ? (nodes.get(focusId) ?? null) : null;
  const focusedMembers = useMemo(
    () =>
      selected
        ? operationalMembers(scene, selected.id)
        : new Set(scene.membershipIndex.resourceIds),
    [scene, selected],
  );
  const reduced = systemReduced || preferences.reducedMotion;
  const stopped = paused || preferences.paused;
  const theme =
    preferences.theme === "system"
      ? systemDark || dark
        ? "midnight"
        : "porcelain"
      : preferences.theme;
  const motion = !reduced && !stopped && !reading;
  const pending =
    query.viewRevision !== scene.viewRevision ||
    query.grouping !== scene.grouping;
  const settings = useMemo<RendererSettings>(
    () => ({
      theme,
      palette: projection.value?.palette ?? {
        attention: "#ca812e",
        unhealthy: "#bd4b51",
        reporting: "#4e9d9a",
      },
      motion,
      cameraMode:
        (reduced || stopped || reading) &&
        (camera === "orbit" || camera === "tour")
          ? "manual"
          : camera,
      ambient: preferences.ambient && motion,
      selected: selected?.id ?? null,
      focus: preferences.lens && !!selected,
      activity: {
        source: activity,
        running: !stopped && !delayed && !pending && !reading,
        follow: false,
        trace: null,
      },
    }),
    [
      theme,
      projection,
      motion,
      reduced,
      stopped,
      reading,
      camera,
      preferences.ambient,
      preferences.lens,
      selected,
      activity,
      delayed,
      pending,
    ],
  );
  const current = useRef({ projection: projection.value, settings });
  useEffect(() => {
    current.current = { projection: projection.value, settings };
  }, [projection, settings]);

  function changePreferences(patch: Partial<ObservatoryPreferences>) {
    setPreferences((old) => ({ ...old, ...patch }));
  }
  function emit(next: ObservatoryQuery, nextCamera: CameraMode = "manual") {
    const safe = authorizeObservatoryQuery(
      {
        ...next,
        viewRevision: `local:${Date.now().toString(36)}:${++revision.current}`,
      },
      scene,
    );
    setQuery(safe);
    setCamera(nextCamera);
    onQueryChange(safe);
  }
  function entry(): HistoryEntry {
    return { focusId, resourceId: selected?.resourceId ?? null, query, camera };
  }
  function activate(id: string) {
    const node = nodes.get(id);
    if (!node) return;
    if (focusId !== id) history.current.push(entry());
    restoreCamera.current = false;
    setFocusSequence((value) => value + 1);
    setFocusId(id);
    setCamera("manual");
    if (node.resourceId) onSelect(node.resourceId);
    const expanded = new Set(query.expandedRepresentationIds);
    for (const parent of pathTo(scene, id))
      if ((scene.membershipIndex.children[parent] ?? []).length)
        expanded.add(parent);
    if (
      [...expanded].some(
        (item) => !query.expandedRepresentationIds.includes(item),
      )
    )
      emit({ ...query, expandedRepresentationIds: [...expanded] });
  }
  function restore(previous: HistoryEntry | undefined) {
    restoreCamera.current = true;
    setFocusSequence((value) => value + 1);
    const id =
      previous?.focusId && nodes.has(previous.focusId)
        ? previous.focusId
        : null;
    setFocusId(id);
    setCamera(previous?.camera ?? "composed");
    if (
      previous?.resourceId &&
      scene.membershipIndex.resourceIds.includes(previous.resourceId)
    )
      onSelect(previous.resourceId);
    if (previous)
      emit(authorizeObservatoryQuery(previous.query, scene), previous.camera);
  }
  function back() {
    restore(history.current.pop());
  }
  function search(value: string) {
    if (value && !query.search) beforeSearch.current = entry();
    if (!value && query.search) {
      const previous = beforeSearch.current;
      beforeSearch.current = null;
      if (previous) {
        restore(previous);
        return;
      }
    }
    emit({ ...query, search: value });
  }
  function toggle(id: string) {
    const expanded = new Set(query.expandedRepresentationIds);
    if (expanded.has(id)) expanded.delete(id);
    else expanded.add(id);
    emit({ ...query, expandedRepresentationIds: [...expanded] });
  }
  const actions = useRef({ activate, onCameraFocus });
  useEffect(() => {
    actions.current = { activate, onCameraFocus };
  });

  useEffect(() => {
    let active = true;
    const darkMedia = matchMedia("(prefers-color-scheme: dark)"),
      reduceMedia = matchMedia("(prefers-reduced-motion: reduce)");
    const media = () => {
      setSystemDark(darkMedia.matches);
      setSystemReduced(reduceMedia.matches);
    };
    darkMedia.addEventListener("change", media);
    reduceMedia.addEventListener("change", media);
    void Promise.resolve().then(() => {
      if (!active) return;
      media();
      let saved = defaultObservatoryPreferences();
      try {
        saved = readObservatoryPreferences(
          localStorage.getItem(observatoryStorageKey),
          localStorage.getItem(legacyObservatoryStorageKey),
        );
      } catch {
        /* Settings remain usable without device storage. */
      }
      const sectors = normalizeObservatorySectors(
        saved.sectors,
        initialResourceIds,
      );
      setPreferences({ ...saved, sectors });
      setLoaded(true);
    });
    return () => {
      active = false;
      darkMedia.removeEventListener("change", media);
      reduceMedia.removeEventListener("change", media);
    };
  }, [scene.scopeDigest, initialResourceIds]);
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(observatoryStorageKey, JSON.stringify(preferences));
    } catch {
      /* This visit still retains display choices. */
    }
  }, [preferences, loaded]);
  useEffect(() => {
    if (lastExternalSelection.current === selectedId) return;
    lastExternalSelection.current = selectedId;
    const node = selectedId
      ? scene.representations.find(
          (item) => item.resourceId === selectedId && !item.referenceTo,
        )
      : undefined;
    void Promise.resolve().then(() => {
      setFocusSequence((value) => value + 1);
      setFocusId((previous) => {
        const currentNode = nodes.get(previous ?? "");
        return node && currentNode?.resourceId === selectedId
          ? previous
          : (node?.id ?? null);
      });
    });
  }, [selectedId, nodes, scene.representations]);
  useEffect(() => {
    if (!projection.value) return;
    activity.setProjection(projection.value);
    activity.synchronize(
      { events: mapOperationalEvents(snapshot, projection.value) },
      motion && !stopped && !delayed && !pending && !reading,
    );
    renderer.current?.refreshActivity();
  }, [
    activity,
    snapshot,
    projection,
    motion,
    stopped,
    delayed,
    pending,
    reading,
  ]);
  useEffect(() => {
    if (!loaded || !canvas.current || !current.current.projection) return;
    let disposed = false,
      instance: ObservatoryRenderer | null = null;
    void import("../gravity/renderer")
      .then(({ ObservatoryRenderer: Renderer }) => {
        if (disposed || !canvas.current || !current.current.projection) return;
        try {
          instance = new Renderer(canvas.current, current.current.settings, {
            anchors(next) {
              anchorPositions.current = new Map(
                next.map((anchor) => [anchor.id, anchor]),
              );
              for (const anchor of next) {
                const element = elements.current.get(anchor.id);
                if (element) placeAnchor(element, anchor);
              }
              setAnchors((previous) =>
                previous.length === next.length &&
                previous.every(
                  (anchor, index) =>
                    anchor.id === next[index]?.id &&
                    anchor.label === next[index]?.label,
                )
                  ? previous
                  : next,
              );
            },
            stats() {},
            select(id) {
              actions.current.activate(id.replace(/^lens-/, ""));
            },
            interrupted() {
              setCamera("manual");
              setReading(false);
            },
            unavailable(message) {
              setError(message);
            },
            viewport() {},
            lens(amount) {
              const element = lens.current;
              if (element) {
                const viewport = (
                  instance as
                    | (ObservatoryRenderer & {
                        lensViewport?: () => {
                          x: number;
                          y: number;
                          radius: number;
                        };
                      })
                    | null
                )?.lensViewport?.();
                if (viewport) {
                  element.style.left = `${viewport.x}px`;
                  element.style.top = `${viewport.y}px`;
                  element.style.width = `${viewport.radius * 2}px`;
                }
                element.style.opacity = String(amount);
                element.style.visibility = amount > 0.01 ? "visible" : "hidden";
              }
            },
            activity() {},
            visibility(visible) {
              activity.setVisible(visible);
            },
          });
          renderer.current = instance;
          instance.update(
            current.current.projection.wells,
            current.current.settings,
          );
          setReady(true);
        } catch {
          instance?.dispose();
          renderer.current = null;
          setError(
            "Terrain is unavailable. The complete outline, search and evidence remain usable.",
          );
        }
      })
      .catch(() => {
        if (!disposed)
          setError(
            "Terrain could not load. Use the complete outline and resource details.",
          );
      });
    return () => {
      disposed = true;
      instance?.dispose();
      renderer.current = null;
    };
  }, [loaded, activity]);
  useEffect(() => {
    const instance = renderer.current;
    if (!instance || !projection.value) return;
    try {
      instance.update(projection.value.wells, settings);
    } catch {
      instance.dispose();
      renderer.current = null;
      void Promise.resolve().then(() =>
        setError(
          "Terrain could not display this projection. Every authorized resource remains available below.",
        ),
      );
    }
  }, [projection, settings]);
  const focusedVisible = scene.visibleRepresentationIds.includes(focusId ?? "");
  const focusFamily = useMemo(() => {
    if (!focusId) return "";
    const pending = [focusId],
      visited = new Set<string>(),
      visible = new Set(scene.visibleRepresentationIds),
      family: string[] = [];
    while (pending.length) {
      const id = pending.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);
      if (visible.has(id)) family.push(id);
      pending.push(...(scene.membershipIndex.children[id] ?? []));
    }
    return family.sort().join("|");
  }, [scene, focusId]);
  useEffect(() => {
    const instance = renderer.current;
    const projected = current.current.projection;
    if (!instance || !ready || !projected) return;
    const node = focusId ? projected.byId.get(focusId) : null;
    const subject = node
      ? projected.wells.some((well) => well.id === node.id)
        ? node.id
        : node.resourceId
          ? (projected.visibleSubjectForResource.get(node.resourceId) ?? null)
          : null
      : null;
    const previous = lastCameraRequest.current;
    const refit =
      previous?.id === subject &&
      previous.sequence === focusSequence &&
      previous.family !== focusFamily;
    if (refit && previous.restored) {
      previous.family = focusFamily;
      return;
    }
    const restoring = restoreCamera.current;
    actions.current.onCameraFocus?.(instance, subject, {
      immediate: !current.current.settings.motion,
      restore: restoring,
      refit,
    });
    lastCameraRequest.current = {
      id: subject,
      sequence: focusSequence,
      family: focusFamily,
      restored: restoring,
    };
    restoreCamera.current = false;
  }, [focusId, focusSequence, ready, reduced, focusedVisible, focusFamily]);

  const expanded = new Set(query.expandedRepresentationIds);
  const summary = selected?.summary ?? scene.summary;
  const exposed = scene.providerExposures.filter((item) =>
    focusedMembers.has(item.resourceId),
  );
  const resources = scene.representations
    .filter((node) => node.resourceId && !node.referenceTo)
    .sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
  const work = scene.signals.filter(
    (signal) =>
      signal.facet === "work" &&
      signal.freshness === "fresh" &&
      !["unknown", "complete"].includes(signal.state),
  );
  const environments = [
    ...new Set(
      scene.signals.flatMap((signal) =>
        signal.environment ? [signal.environment] : [],
      ),
    ),
  ].sort();
  const breadcrumbs = selected ? pathTo(scene, selected.id) : [];
  const views = preferences.views.filter(
    (view) => view.scopeDigest === scene.scopeDigest,
  );
  const visibleSectors = normalizeObservatorySectors(
    preferences.sectors,
    new Set(scene.membershipIndex.resourceIds),
  );
  const style = {
    "--op-text-scale": preferences.textScale,
    colorScheme: theme === "midnight" ? "dark" : "light",
  } as CSSProperties;
  const surfaceStyle = {
    colorScheme: theme === "midnight" ? "dark" : "light",
    "--cmd-surface": theme === "midnight" ? "#101e29" : "#faf9f5",
    "--cmd-text": theme === "midnight" ? "#dce8ec" : "#243d49",
    "--cmd-border": theme === "midnight" ? "#3c5362" : "#b6c6cc",
  } as CSSProperties;
  return (
    <section
      className={`cmd-operational-observatory${preferences.tv ? " cmd-op-tv" : ""}${compact ? " cmd-op-compact" : ""}`}
      data-theme={theme}
      data-reading={reading}
      data-grouping={scene.grouping}
      data-view-revision={scene.viewRevision}
      data-projection-revision={scene.projectionRevision}
      data-pending={pending}
      style={style}
      aria-label="Operational Observatory"
      onKeyDown={(event) => {
        if (event.key !== "Escape" || event.defaultPrevented) return;
        if (query.search) {
          event.preventDefault();
          event.stopPropagation();
          search("");
        } else if (focusId) {
          event.preventDefault();
          event.stopPropagation();
          back();
        }
      }}
    >
      <header className="cmd-op-toolbar">
        <div className="cmd-op-heading">
          <span className="cmd-op-eyebrow">Operational landscape</span>
          <h2>Observatory</h2>
          <span>
            {scene.population.canonicalResourceCount} unique resources /{" "}
            {scene.visibleRepresentationIds.length} active representations
          </span>
        </div>
        <label>
          View
          <select
            aria-label="Observatory grouping"
            value={query.grouping}
            onChange={(event) => {
              const grouping = event.target
                .value as ObservatoryQuery["grouping"];
              changePreferences({ grouping });
              emit({
                ...query,
                grouping,
                expandedRepresentationIds: [],
                sectors: preferences.sectors,
              });
            }}
          >
            {observatoryGroupings.map((grouping) => (
              <option key={grouping} value={grouping}>
                {grouping[0]!.toUpperCase() + grouping.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Environment
          <select
            value={query.environment ?? ""}
            onChange={(event) =>
              emit({ ...query, environment: event.target.value || null })
            }
          >
            <option value="">All authorized environments</option>
            {environments.map((environment) => (
              <option key={environment}>{environment}</option>
            ))}
          </select>
        </label>
        <form
          role="search"
          className="cmd-op-search"
          onSubmit={(event) => event.preventDefault()}
        >
          <label>
            Find any resource
            <input
              type="search"
              aria-label="Search complete Observatory inventory"
              placeholder="Name or canonical ID"
              value={query.search}
              onFocus={() => {
                setReading(true);
                setCamera("manual");
              }}
              onChange={(event) => search(event.target.value)}
            />
          </label>
          {query.search && (
            <button type="button" onClick={() => search("")}>
              Clear search
            </button>
          )}
        </form>
        <button
          type="button"
          disabled={paused}
          aria-pressed={stopped}
          onClick={() => {
            setCamera("manual");
            changePreferences({ paused: !preferences.paused });
          }}
        >
          {paused ? "Updates paused" : stopped ? "Resume scene" : "Pause scene"}
        </button>
        <FloatingSurface
          trigger={<button type="button">Appearance and views</button>}
          title="Observatory appearance and local views"
          open={appearanceOpen}
          onOpenChange={(next) => {
            setAppearanceOpen(next);
            setReading(next);
            setCamera("manual");
          }}
          width={390}
          style={surfaceStyle}
        >
          <form
            className="cmd-op-settings"
            onSubmit={(event) => event.preventDefault()}
          >
            <p>
              Presentation settings and local named views are saved on this
              device. Account views below are private and available across your
              signed-in devices. They do not edit inventory, mappings or access.
            </p>
            <label>
              Surface theme
              <select
                value={preferences.theme}
                onChange={(event) =>
                  changePreferences({
                    theme: event.target
                      .value as ObservatoryPreferences["theme"],
                  })
                }
              >
                <option value="system">System theme</option>
                <option value="porcelain">Porcelain</option>
                <option value="midnight">Midnight</option>
              </select>
            </label>
            <label>
              Identity palette
              <select
                value={preferences.palette}
                onChange={(event) =>
                  changePreferences({
                    palette: event.target
                      .value as ObservatoryPreferences["palette"],
                  })
                }
              >
                <option value="semantic">Quiet mineral</option>
                <option value="ocean">Ocean</option>
                <option value="earth">Earth</option>
              </select>
            </label>
            <label>
              Size basis
              <select
                value={preferences.size}
                onChange={(event) =>
                  changePreferences({
                    size: event.target.value as ObservatoryPreferences["size"],
                  })
                }
              >
                <option value="structural">Structural membership</option>
                <option value="uniform">Uniform size</option>
                <option value="total-ram">
                  Observed total RAM, where known
                </option>
              </select>
            </label>
            <label>
              Camera
              <select
                value={camera}
                onChange={(event) => {
                  const next = event.target.value as CameraMode;
                  setReading(false);
                  setAppearanceOpen(false);
                  setCamera(next);
                  changePreferences({ camera: next });
                }}
              >
                <option value="composed">Still composed overview</option>
                <option value="manual">Manual orbit</option>
                <option value="orbit" disabled={reduced || stopped}>
                  Slow orbit
                </option>
                <option value="tour" disabled={reduced || stopped}>
                  Guided host tour
                </option>
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={preferences.ambient}
                onChange={(event) =>
                  changePreferences({ ambient: event.target.checked })
                }
              />{" "}
              Ambient ground and sky
            </label>
            <label>
              <input
                type="checkbox"
                checked={preferences.reducedMotion}
                onChange={(event) => {
                  changePreferences({ reducedMotion: event.target.checked });
                  setCamera("composed");
                }}
              />{" "}
              Reduced motion
            </label>
            <label>
              <input
                type="checkbox"
                checked={preferences.lens}
                onChange={(event) =>
                  changePreferences({ lens: event.target.checked })
                }
              />{" "}
              Optional selected-subject lens
            </label>
            <label>
              <input
                type="checkbox"
                checked={preferences.tv}
                onChange={(event) =>
                  changePreferences({ tv: event.target.checked })
                }
              />{" "}
              TV reading layout
            </label>
            <label>
              Text size
              <select
                value={preferences.textScale}
                onChange={(event) =>
                  changePreferences({
                    textScale: Number(event.target.value) as 1 | 1.25 | 1.5,
                  })
                }
              >
                <option value={1}>Standard</option>
                <option value={1.25}>Large</option>
                <option value={1.5}>Extra large</option>
              </select>
            </label>
            <fieldset>
              <legend>Custom authorized sectors</legend>
              <p>
                Sectors change grouping only. Physical containment stays
                canonical.
              </p>
              <label>
                Sector name
                <input
                  value={sectorName}
                  onChange={(event) => setSectorName(event.target.value)}
                />
              </label>
              <label>
                Resource
                <select
                  value={sectorResourceId}
                  onChange={(event) => setSectorResourceId(event.target.value)}
                >
                  <option value="">Select authorized resource</option>
                  {resources.map((node) => (
                    <option key={node.id} value={node.resourceId!}>
                      {node.label} / {kindNames[node.kind]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Group this sector by
                <select
                  value={sectorGrouping}
                  onChange={(event) =>
                    setSectorGrouping(
                      event.target.value as ObservatorySector["grouping"],
                    )
                  }
                >
                  {observatoryGroupings
                    .filter((grouping) => grouping !== "custom")
                    .map((grouping) => (
                      <option key={grouping}>{grouping}</option>
                    ))}
                </select>
              </label>
              <button
                type="button"
                disabled={!sectorName.trim() || !sectorResourceId}
                onClick={() => {
                  const label = sectorName.trim(),
                    id = `local-sector:${encodeURIComponent(label)}`;
                  const previous = preferences.sectors.find(
                    (sector) => sector.id === id,
                  );
                  const sectors = normalizeObservatorySectors(
                    [
                      ...preferences.sectors.filter(
                        (sector) => sector.id !== id,
                      ),
                      {
                        id,
                        label,
                        grouping: sectorGrouping,
                        resourceIds: [
                          ...(previous?.resourceIds ?? []),
                          sectorResourceId,
                        ],
                      },
                    ],
                    new Set(scene.membershipIndex.resourceIds),
                  );
                  changePreferences({ sectors });
                  emit({ ...query, grouping: "custom", sectors });
                }}
              >
                Add resource to sector
              </button>
              {visibleSectors.map((sector) => (
                <div key={sector.id}>
                  <span>
                    {sector.label} / {sector.resourceIds.length} members /{" "}
                    {sector.grouping}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const sectors = preferences.sectors.filter(
                        (item) => item.id !== sector.id,
                      );
                      changePreferences({ sectors });
                      emit({ ...query, sectors });
                    }}
                  >
                    Remove {sector.label}
                  </button>
                </div>
              ))}
            </fieldset>
            <fieldset>
              <legend>Named views on this device</legend>
              <label>
                View name
                <input
                  value={viewName}
                  onChange={(event) => setViewName(event.target.value)}
                />
              </label>
              <button
                type="button"
                disabled={!viewName.trim()}
                onClick={() => {
                  const oldViews = preferences.views;
                  const display = observatoryPresentation(preferences);
                  const id = `local-view:${encodeURIComponent(viewName.trim())}`;
                  changePreferences({
                    views: [
                      ...oldViews.filter(
                        (view) =>
                          view.id !== id ||
                          view.scopeDigest !== scene.scopeDigest,
                      ),
                      {
                        id,
                        name: viewName.trim(),
                        scopeDigest: scene.scopeDigest,
                        presentation: display,
                        query: authorizeObservatoryQuery(query, scene),
                      },
                    ],
                  });
                  setViewName("");
                }}
              >
                Save current local view
              </button>
              {views.map((view) => (
                <div key={view.id}>
                  <button
                    type="button"
                    onClick={() => {
                      changePreferences(view.presentation);
                      emit(
                        authorizeObservatoryQuery(view.query, scene),
                        view.presentation.camera,
                      );
                    }}
                  >
                    {view.name}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      changePreferences({
                        views: preferences.views.filter(
                          (item) => item !== view,
                        ),
                      })
                    }
                  >
                    Remove {view.name}
                  </button>
                </div>
              ))}
            </fieldset>
            <ObservatoryCanonicalViews
              key={scopeProjectId ?? "global"}
              client={viewsClient}
              projectId={scopeProjectId}
              configuration={{
                schemaVersion: 2,
                grouping: query.grouping,
                environment: query.environment,
                sectors: query.sectors,
                palette: preferences.colors,
                palettePreset: preferences.palette,
                sizeBasis:
                  preferences.size === "total-ram"
                    ? "ram"
                    : preferences.size === "uniform"
                      ? "uniform"
                      : "services",
                camera,
                lens: preferences.lens,
                theme: preferences.theme,
                labels: true,
                tv: preferences.tv,
                motion: !preferences.reducedMotion,
                ambient: preferences.ambient,
                textScale: preferences.textScale,
                paused: preferences.paused,
                reducedMotion: preferences.reducedMotion,
              }}
              onApply={(configuration) => {
                changePreferences({
                  grouping: configuration.grouping,
                  sectors: configuration.sectors,
                  colors: configuration.palette,
                  palette: configuration.palettePreset,
                  size:
                    configuration.sizeBasis === "ram"
                      ? "total-ram"
                      : configuration.sizeBasis === "uniform"
                        ? "uniform"
                        : "structural",
                  camera: configuration.camera,
                  lens: configuration.lens,
                  theme: configuration.theme,
                  tv: configuration.tv,
                  ambient: configuration.ambient,
                  textScale: configuration.textScale,
                  paused: configuration.paused,
                  reducedMotion:
                    configuration.reducedMotion || !configuration.motion,
                });
                emit(
                  authorizeObservatoryQuery(
                    {
                      ...query,
                      grouping: configuration.grouping,
                      environment: configuration.environment,
                      sectors: configuration.sectors,
                      expandedRepresentationIds: [],
                      search: "",
                      viewRevision: String(Date.now()),
                    },
                    scene,
                  ),
                  configuration.camera,
                );
              }}
            />
            <button
              type="button"
              onClick={() => {
                setPreferences(defaultObservatoryPreferences());
                setCamera("composed");
                emit(
                  {
                    ...query,
                    grouping: "operational",
                    sectors: [],
                    expandedRepresentationIds: [],
                    search: "",
                  },
                  "composed",
                );
              }}
            >
              Reset local presentation
            </button>
          </form>
        </FloatingSurface>
      </header>
      {(pending || delayed) && (
        <p className="cmd-op-notice" role="status">
          {pending
            ? "Updating view. Showing the last complete authorized scene."
            : "Delayed recorded view. Source observation times remain attached to their evidence."}
        </p>
      )}
      <div className="cmd-op-attention" aria-label="Operational attention">
        <span
          data-attention={
            scene.summary.availability.confirmedImpact ? "impact" : "neutral"
          }
        >
          {scene.summary.incidentIds.length} distinct recorded incidents
        </span>
        <span
          data-attention={
            scene.providerExposures.some(
              (item) => item.classification === "potential_exposure",
            )
              ? "exposure"
              : "neutral"
          }
        >
          {
            new Set(
              scene.providerExposures
                .filter((item) => item.classification === "potential_exposure")
                .map((item) => item.noticeId),
            ).size
          }{" "}
          potentially relevant provider notices
        </span>
        <span>
          {scene.summary.coverage.unmonitored} eligible checks unmonitored /{" "}
          {scene.summary.coverage.stale} stale
        </span>
      </div>
      <div className="cmd-op-workspace">
        <div className="cmd-op-landscape">
          <div
            className="cmd-op-stage"
            aria-label="Projected operational landscape"
            onPointerDown={() => {
              setReading(false);
              setCamera("manual");
            }}
          >
            <div className="cmd-op-stage-caption" data-gravity-label-inset>
              <span>
                {selected
                  ? kindNames[selected.kind]
                  : "Complete authorized landscape"}
              </span>
              <strong>
                {selected?.label ?? "A still view of what you operate"}
              </strong>
              <small>
                {selected
                  ? `${selected.memberCount} unique resources represented`
                  : "Select a group to expand and inspect"}
              </small>
            </div>
            <div ref={canvas} className="cmd-op-canvas" />
            <div
              className="cmd-op-labels"
              aria-hidden={!!error || !!projection.error}
            >
              {anchors.map((anchor) => {
                const node = nodes.get(anchor.id.replace(/^lens-/, ""));
                if (!node) return null;
                return (
                  <button
                    key={anchor.id}
                    type="button"
                    data-kind={node.kind}
                    data-attention={operationalAttention(node.summary)}
                    className="cmd-op-label"
                    ref={(element) => {
                      if (!element) {
                        elements.current.delete(anchor.id);
                        return;
                      }
                      elements.current.set(anchor.id, element);
                      placeAnchor(
                        element,
                        anchorPositions.current.get(anchor.id) ?? anchor,
                      );
                      renderer.current?.measureAnchor(
                        anchor.id,
                        element.offsetWidth,
                        element.offsetHeight,
                      );
                    }}
                    aria-label={`Inspect ${node.label}, ${kindNames[node.kind]}, ${node.memberCount} unique resources`}
                    onClick={() => activate(node.id)}
                  >
                    <span className="cmd-op-kind" aria-hidden="true">
                      {kindMarks[node.kind]}
                    </span>
                    <span>
                      <strong>{node.label}</strong>
                      <small>
                        {kindNames[node.kind]} / {node.memberCount}
                        {node.referenceTo ? " / reference" : ""}
                        {operationalAttention(node.summary) === "impact"
                          ? " / confirmed impact"
                          : operationalAttention(node.summary) === "exposure"
                            ? " / potential exposure"
                            : ""}
                      </small>
                    </span>
                  </button>
                );
              })}
            </div>
            {preferences.lens && selected && !error && (
              <div ref={lens} className="cmd-op-lens" aria-hidden="true">
                <span>{selected.label}</span>
              </div>
            )}
            {(!ready || error || projection.error) && (
              <p role="status" className="cmd-op-terrain-status">
                {error ??
                  projection.error ??
                  "Loading shared terrain. The complete outline is ready below."}
              </p>
            )}
            <div className="cmd-op-stage-actions">
              <button
                type="button"
                onClick={() => {
                  setFocusId(null);
                  setCamera("composed");
                  renderer.current?.preset("overview");
                }}
              >
                Overview
              </button>
              <button
                type="button"
                disabled={reduced || stopped}
                onClick={() => {
                  setReading(false);
                  setCamera(
                    camera === "tour" || camera === "orbit"
                      ? "manual"
                      : preferences.camera === "orbit"
                        ? "orbit"
                        : "tour",
                  );
                }}
              >
                {camera === "tour" || camera === "orbit"
                  ? "Stop presentation"
                  : "Start presentation"}
              </button>
            </div>
          </div>
          <p className="cmd-op-legend">
            H Host / D Deployment / S Service / P Provider / R Repository / C
            Collection / Ref Shared reference. Counts are unique within a group;
            references do not add to the global total. Source freshness is
            separate from service availability.
          </p>
          {query.search && (
            <section
              className="cmd-op-search-results"
              aria-label="Complete inventory search results"
            >
              <h3>Search results ({scene.searchResults.length})</h3>
              {pending ? (
                <p role="status">Waiting for the complete server search.</p>
              ) : scene.searchResults.length ? (
                <ul>
                  {scene.searchResults.map((result) => (
                    <li key={result.resourceId}>
                      <button
                        type="button"
                        onClick={() => activate(result.representationId)}
                      >
                        {nodes.get(result.representationId)?.label ??
                          result.resourceId}
                        <small>
                          {result.path
                            .map((id) => nodes.get(id)?.label)
                            .filter(Boolean)
                            .join(" / ")}
                        </small>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No authorized matches in this complete population.</p>
              )}
            </section>
          )}
          <details
            className="cmd-op-outline"
            open={!compact || !!error || !!projection.error}
          >
            <summary>
              Complete resource outline /{" "}
              {scene.population.canonicalResourceCount} unique resources
            </summary>
            <p>
              Expand collections or search for any canonical resource. Grouping
              does not rewrite physical containment.
            </p>
            <ul>
              {scene.rootRepresentationIds.map((id) => (
                <OutlineNode
                  key={id}
                  id={id}
                  scene={scene}
                  byId={nodes}
                  expanded={expanded}
                  selected={focusId}
                  activate={activate}
                  toggle={toggle}
                />
              ))}
            </ul>
            {scene.population.canonicalResourceCount === 0 && (
              <p>No authorized resources in this view.</p>
            )}
          </details>
        </div>
        <aside
          className="cmd-op-inspector"
          aria-label="Observatory inspector"
          onFocusCapture={() => {
            setReading(true);
            setCamera("manual");
          }}
        >
          <div className="cmd-op-inspector-heading">
            <div>
              <span className="cmd-op-eyebrow">
                {selected ? kindNames[selected.kind] : "Whole landscape"}
              </span>
              <h3>{selected?.label ?? "Coverage and evidence"}</h3>
            </div>
            {selected && (
              <button type="button" onClick={back}>
                Back
              </button>
            )}
          </div>
          {selected && (
            <nav aria-label="Observatory breadcrumbs">
              <button type="button" onClick={() => restore(undefined)}>
                Overview
              </button>
              {breadcrumbs.map((id) => (
                <button
                  type="button"
                  key={id}
                  aria-current={id === selected.id ? "location" : undefined}
                  onClick={() => activate(id)}
                >
                  {nodes.get(id)?.label}
                </button>
              ))}
            </nav>
          )}
          {selected?.referenceTo && (
            <p className="cmd-op-notice">
              Shared reference to one canonical resource. It does not increase
              the unique population.
              <button
                type="button"
                onClick={() => activate(selected.referenceTo!)}
              >
                Inspect canonical context
              </button>
            </p>
          )}
          <section
            className="cmd-op-availability"
            data-attention={operationalAttention(summary)}
          >
            <h4>Availability and monitoring coverage</h4>
            <StateCounts summary={summary} />
            <p>
              Required: {summary.availability.required.passing} passing,{" "}
              {summary.availability.required.failing} failing,{" "}
              {summary.availability.required.unknown} unknown. Optional:{" "}
              {summary.availability.optional.failing} failing.
            </p>
            <p>
              {summary.availability.confirmedImpact
                ? "Confirmed local impact on a required check."
                : "No confirmed required local impact in the available evidence."}
            </p>
          </section>
          <div className="cmd-op-facets">
            <Facet label="Telemetry freshness" value={summary.telemetry} />
            <Facet label="Capacity" value={summary.capacity} />
            <Facet
              label="Lifecycle and maintenance"
              value={summary.lifecycle}
            />
            <Facet label="Security observations" value={summary.security} />
            <Facet label="Provider relevance" value={summary.provider} />
            <Facet label="Work and runtime" value={summary.work} />
          </div>
          <p className="cmd-op-stamp">
            Evaluated {scene.evaluatedAt}. Read {scene.readStartedAt} to{" "}
            {scene.readCompletedAt}. These read times are not measurement times.
          </p>
          {selected && (
            <>
              <dl>
                <dt>Canonical identity</dt>
                <dd>
                  <code>{selected.resourceId ?? selected.aggregateId}</code>
                </dd>
                <dt>Unique members</dt>
                <dd>{selected.memberCount}</dd>
                {selected.resourceId && (
                  <>
                    <dt>Physical containment</dt>
                    <dd>
                      {(() => {
                        const containment = scene.containment.find(
                          (item) => item.resourceId === selected.resourceId,
                        );
                        const parent = resources.find(
                          (item) =>
                            item.resourceId === containment?.parentResourceId,
                        );
                        return (
                          parent?.label ??
                          (containment?.state === "missing"
                            ? "Parent unavailable in authorized scope"
                            : containment?.state === "cycle"
                              ? "Containment cycle recorded"
                              : "Root resource")
                        );
                      })()}
                    </dd>
                  </>
                )}
              </dl>
              <div className="cmd-op-projects">
                {selected.projects.map((project) => (
                  <button
                    type="button"
                    key={project.id}
                    onClick={() => onProject(project.id)}
                  >
                    Open project {project.name}
                  </button>
                ))}
              </div>
            </>
          )}
          {preferences.size === "total-ram" &&
          projection.value?.ramUnavailableIds.length ? (
            <p>
              Some hosts have no explicit total-byte RAM observation. Their
              structural size is retained; unknown RAM is never zero.
            </p>
          ) : null}
          {selected?.resourceId && evidenceClient && (
            <ObservatoryOperationalEvidence
              key={`${scene.scopeDigest}:${selected.resourceId}`}
              resourceId={selected.resourceId}
              scopeKey={scene.scopeDigest}
              repository={selected.kind === "repository"}
              loadEvidence={evidenceClient}
            />
          )}
          {selected?.resourceId &&
            reviewClient &&
            onReviewed &&
            (reviewResources &&
            workProjectIds !== undefined &&
            reviewResources.some((item) => item.id === selected.resourceId) ? (
              <ObservatoryReviewControls
                key={`${scene.scopeDigest}:${selected.resourceId}`}
                resource={reviewResources.find(
                  (item) => item.id === selected.resourceId,
                )!}
                resources={reviewResources}
                projectIds={workProjectIds}
                scopeKey={scene.scopeDigest}
                selectedProjectId={scopeProjectId}
                loadCatalogue={reviewClient.loadCatalogue}
                review={reviewClient.review}
                onReviewed={onReviewed}
              />
            ) : (
              <p role="status">
                Complete canonical review choices are unavailable. Refresh the
                inventory and project catalogue.
              </p>
            ))}
          <details>
            <summary>Observation evidence</summary>
            {scene.signals
              .filter((signal) => focusedMembers.has(signal.resourceId))
              .map((signal) => (
                <article key={signal.id}>
                  <strong>
                    {words(signal.facet)}: {words(signal.state)}
                  </strong>
                  <p>
                    {words(signal.freshness)} /{" "}
                    {signal.sourceQualification === "last_known"
                      ? "retained evidence; current source coverage is unavailable / "
                      : ""}
                    observed {signal.observedAt} / source {signal.sourceId}
                    {signal.environment ? ` / ${signal.environment}` : ""}
                  </p>
                  <Evidence values={signal.evidenceRefs} />
                </article>
              ))}
            {scene.sourceObservations
              .filter((source) => focusedMembers.has(source.resourceId))
              .map((source) => (
                <article key={`${source.resourceId}:${source.sourceId}`}>
                  <strong>
                    Source {source.sourceId}: {words(source.state)}
                  </strong>
                  <p>
                    Observed {source.observedAt ?? "Never observed"}
                    {source.error ? ` / ${source.error}` : ""}
                  </p>
                  <Evidence values={source.evidenceRefs} />
                </article>
              ))}
            {scene.capacityObservations
              .filter((metric) => focusedMembers.has(metric.resourceId))
              .map((metric) => (
                <article
                  key={`${metric.resourceId}:${metric.name}:${metric.evidenceRef}`}
                >
                  <strong>
                    {metric.name}: {metric.value.toLocaleString()} {metric.unit}
                  </strong>
                  <p>Observed {metric.observedAt}</p>
                  <Evidence values={[metric.evidenceRef]} />
                </article>
              ))}
          </details>
          <details>
            <summary>Provider notices and relevance ({exposed.length})</summary>
            {exposed.length ? (
              exposed.map((exposure) => (
                <article
                  key={`${exposure.noticeId}:${exposure.resourceId}:${exposure.dependencyId}`}
                  data-attention={
                    exposure.classification === "confirmed_local_impact"
                      ? "impact"
                      : exposure.classification === "potential_exposure"
                        ? "exposure"
                        : "neutral"
                  }
                >
                  <strong>{words(exposure.classification)}</strong>
                  <p>
                    Provider severity {exposure.severity}; relevance{" "}
                    {exposure.relevance}; confidence {exposure.confidence};
                    local impact {exposure.localImpact}; causation{" "}
                    {exposure.causation}. {exposure.freshness},{" "}
                    {exposure.status}, observed {exposure.observedAt}.
                  </p>
                  <Evidence values={exposure.evidenceRefs} />
                </article>
              ))
            ) : (
              <p>
                No provider relevance evidence in this authorized context.
                Missing mappings do not prove absence of exposure.
              </p>
            )}
          </details>
          <details>
            <summary>Recorded events</summary>
            {snapshot.events
              .filter(
                (event) =>
                  event.resourceId && focusedMembers.has(event.resourceId),
              )
              .map((event) => (
                <article key={event.id}>
                  <strong>{event.summary}</strong>
                  <p>
                    {event.sourceLabel} / {event.occurredAt}
                  </p>
                  <Evidence values={[event.evidenceHref]} />
                </article>
              ))}
          </details>
        </aside>
      </div>
      <footer className="cmd-op-work-dock" aria-label="Recorded active work">
        <strong>Recorded work</strong>
        {work.length ? (
          work.map((signal) => {
            const node = resources.find(
              (item) => item.resourceId === signal.resourceId,
            );
            return (
              <button
                type="button"
                key={signal.id}
                onClick={() => node && activate(node.id)}
              >
                {node?.label ?? "Authorized resource"} / {words(signal.state)}
                <small>Observed {signal.observedAt}</small>
              </button>
            );
          })
        ) : (
          <span>
            No qualifying active work observation. Missing runtime coverage is
            not an idle-agent signal.
          </span>
        )}
      </footer>
      <details className="cmd-op-canonical-work">
        <summary>Canonical project Work</summary>
        {workClient && workProjectIds !== undefined ? (
          <ObservatoryWorkDock
            projectIds={workProjectIds}
            selectedProjectId={scopeProjectId}
            loadPage={workClient}
            paused={paused}
          />
        ) : (
          <p role="status">Canonical Work unavailable in this view.</p>
        )}
      </details>
      {providerFeedClient && (
        <ObservatoryProviderFeed
          scopeKey={scene.scopeDigest}
          loadPage={providerFeedClient}
          paused={paused}
        />
      )}
    </section>
  );
}
function placeAnchor(element: HTMLButtonElement, anchor: Anchor) {
  element.style.transform = `translate3d(${anchor.x}px,${anchor.y}px,0) translate(-50%,-100%)`;
  element.style.opacity = String(anchor.opacity);
  element.style.visibility =
    anchor.opacity < 0.002 || !anchor.visible ? "hidden" : "visible";
  element.tabIndex = anchor.opacity < 0.002 || !anchor.visible ? -1 : 0;
}
