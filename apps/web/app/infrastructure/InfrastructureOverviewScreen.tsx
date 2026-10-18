"use client";

import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
const OperationalObservatory = dynamic(
  () => import("@commandry/ui").then((module) => module.OperationalObservatory),
  { ssr: false, loading: () => <p role="status">Loading Gravity view...</p> },
);

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type {
  InfrastructureOverview,
  InfrastructureResource,
  ObservatorySceneReadResult,
} from "@commandry/contracts";
import {
  AppShell,
  Button,
  InfrastructureMap,
  infrastructureTelemetryLabels,
  isInfrastructureHost,
  type ObservatoryQuery,
} from "@commandry/ui";
import {
  apiJson,
  type PageResponse,
  type ProjectRecord,
} from "../projects/api";
import { observatoryViewsClient } from "./observatory-views-client";
import { createObservatoryProviderFeedClient } from "./observatory-provider-client";
import { createObservatoryReviewClient } from "./observatory-review-client";
import {
  createObservatoryLogoClient,
  observatoryLogoUrl,
} from "./observatory-logo-client";
import {
  loadObservatoryWorkPage,
  loadCompleteObservatoryWorkProjects,
} from "./observatory-work-client";
import { loadInfrastructureScene } from "../../lib/load-infrastructure-scene";

const needsAttention = (item: InfrastructureResource) =>
  ["error", "stale", "future"].includes(item.telemetry);
const time = (value: string) => new Date(value).toLocaleString();
const label = (item: InfrastructureResource) =>
  infrastructureTelemetryLabels[item.telemetry];

function Capacity({ resource }: { resource: InfrastructureResource }) {
  return (
    <div className="cmd-network-capacity">
      {[
        ["host_memory_used", "Memory"],
        ["host_disk_used", "Disk"],
      ].map(([name, title]) => {
        const metric = resource.metrics.find((item) => item.name === name);
        return (
          <div key={name}>
            <span>{title}</span>
            <strong>{metric ? `${metric.value}%` : "Not observed"}</strong>
            {metric && (
              <meter
                min={0}
                max={100}
                value={metric.value}
                aria-label={`${title} used for ${resource.name}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function InfrastructureOverviewScreen({
  wallboard = false,
  initialProjectId = "",
  initialQuery = "",
}: {
  wallboard?: boolean;
  initialProjectId?: string;
  initialQuery?: string;
}) {
  const router = useRouter();
  const [scope, setScope] = useState({
    projectId: initialProjectId,
    q: initialQuery,
    cursor: "",
  });
  const [history, setHistory] = useState<string[]>([]);
  const [search, setSearch] = useState(initialQuery);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [projectError, setProjectError] = useState(false);
  const [projectReadEpoch, setProjectReadEpoch] = useState<number | null>(null);
  const [projectErrorEpoch, setProjectErrorEpoch] = useState<number | null>(
    null,
  );
  const [data, setData] = useState<InfrastructureOverview | null>(null);
  const [observatory, setObservatory] =
    useState<ObservatorySceneReadResult | null>(null);
  const [sceneError, setSceneError] = useState<string | null>(null);
  const [sceneQuery, setSceneQuery] = useState<ObservatoryQuery>({
    grouping: "operational",
    environment: null,
    expandedRepresentationIds: [],
    reveal: "members",
    search: initialQuery,
    sectors: [],
    viewRevision: "1",
  });
  const sceneReadScope = useRef("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<{
    loaded: number;
    total: number;
  } | null>(null);
  const [epoch, setEpoch] = useState(0);
  const projectsReady = projectReadEpoch === epoch && !projectError;
  const projectsLoading =
    projectReadEpoch !== epoch && projectErrorEpoch !== epoch;
  const [paused, setPaused] = useState(false);
  // A resumed scene must not consume its baseline using an older overview.
  const activityReadGeneration = useRef(0);
  const [activityBaselinePending, setActivityBaselinePending] = useState(false);
  const startActivityBaseline = useCallback(() => {
    activityReadGeneration.current += 1;
    setActivityBaselinePending(true);
  }, []);
  const wasDocumentHidden = useRef(false);
  const documentHidden = useCallback(() => {
    const hidden = document.hidden;
    if (hidden && !wasDocumentHidden.current) startActivityBaseline();
    wasDocumentHidden.current = hidden;
    return hidden;
  }, [startActivityBaseline]);
  const [view, setView] = useState<"gravity" | "map" | "list">("gravity");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectionRevision, setSelectionRevision] = useState(0);
  const [follow, setFollow] = useState(false);
  const [tv, setTv] = useState(wallboard);
  const [rotatePages, setRotatePages] = useState(false);
  const [arrivals, setArrivals] = useState<string[]>([]);
  const previousEvents = useRef<Set<string> | null>(null);
  const evidenceClient = useCallback(
    async (
      resourceId: string,
      facet: "availability" | "pull_requests" | "security" | "inventory",
    ) =>
      apiJson<unknown>("/api/v1/infrastructure/observatory/operational", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...sceneQuery,
          ...(scope.projectId ? { projectId: scope.projectId } : {}),
          resourceId,
          facet,
          ...(facet === "pull_requests"
            ? { includePullRequestChecks: true }
            : {}),
        }),
      }),
    [sceneQuery, scope.projectId, epoch],
  );
  const providerFeedClient = useMemo(
    () =>
      createObservatoryProviderFeedClient({
        schemaVersion: 1,
        ...sceneQuery,
        ...(scope.projectId ? { projectId: scope.projectId } : {}),
      }),
    [sceneQuery, scope.projectId],
  );
  const reviewClient = useMemo(
    () =>
      createObservatoryReviewClient({
        schemaVersion: 1,
        ...sceneQuery,
        ...(scope.projectId ? { projectId: scope.projectId } : {}),
      }),
    [sceneQuery, scope.projectId],
  );
  // The logo catalogue depends only on project scope, not search or expansion.
  const logoReviewClient = useMemo(
    () =>
      createObservatoryLogoClient({
        schemaVersion: 1,
        ...(scope.projectId ? { projectId: scope.projectId } : {}),
      }),
    [scope.projectId],
  );
  const logoUrl = useMemo(
    () => observatoryLogoUrl(scope.projectId || undefined),
    [scope.projectId],
  );
  const onReviewed = useCallback(() => setEpoch((value) => value + 1), []);
  const [fullscreenError, setFullscreenError] = useState<string | null>(null);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      try {
        const saved = localStorage.getItem("commandry.infrastructure.tv.v1");
        if (saved !== null) setTv(saved === "true");
      } catch {
        /* Device storage can be unavailable. */
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const items = await loadCompleteObservatoryWorkProjects(
          async (cursor) => {
            const params = new URLSearchParams({ limit: "100" });
            if (cursor) params.set("cursor", cursor);
            return apiJson<PageResponse<ProjectRecord>>(
              `/api/v1/projects?${params}`,
              { signal: controller.signal },
            );
          },
        );
        if (!controller.signal.aborted) {
          setProjects(items);
          setProjectError(false);
          setProjectReadEpoch(epoch);
        }
      } catch {
        if (!controller.signal.aborted) {
          setProjectError(true);
          setProjectErrorEpoch(epoch);
        }
      }
    })();
    return () => controller.abort();
  }, [epoch]);

  useEffect(() => {
    const onVisibility = () => {
      documentHidden();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [documentHidden]);

  useEffect(() => {
    if (paused) return;
    const controller = new AbortController();
    let inFlight = false;
    async function refresh() {
      if (documentHidden() || inFlight) return;
      inFlight = true;
      const readGeneration = activityReadGeneration.current;
      try {
        const fetchPage = (cursor: string | null, signal: AbortSignal) => {
          const params = new URLSearchParams({
            limit: view === "gravity" ? "50" : wallboard ? "6" : "12",
          });
          if (scope.projectId) params.set("projectId", scope.projectId);
          if (scope.q && view !== "gravity") params.set("q", scope.q);
          if (cursor) params.set("cursor", cursor);
          return apiJson<InfrastructureOverview>(
            `/api/v1/infrastructure/overview?${params}`,
            { signal },
          );
        };
        const snapshot =
          view === "gravity"
            ? await loadInfrastructureScene(
                fetchPage,
                controller.signal,
                setProgress,
              )
            : await fetchPage(scope.cursor || null, controller.signal);
        if (controller.signal.aborted) return;
        const seen = previousEvents.current;
        setArrivals(
          seen
            ? snapshot.events
                .filter(
                  (event) =>
                    !seen.has(event.id) &&
                    Date.now() - Date.parse(event.occurredAt) >= 0 &&
                    Date.now() - Date.parse(event.occurredAt) < 60000,
                )
                .flatMap((event) =>
                  event.resourceId ? [event.resourceId] : [],
                )
            : [],
        );
        previousEvents.current = new Set(
          snapshot.events.map((event) => event.id),
        );
        setData(snapshot);
        if (readGeneration === activityReadGeneration.current)
          setActivityBaselinePending(false);
        setError(null);
        if (follow) {
          const attention = snapshot.items.filter(needsAttention);
          if (attention.length)
            setSelectedId(
              (current) =>
                attention[
                  (attention.findIndex((item) => item.id === current) + 1) %
                    attention.length
                ]!.id,
            );
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          startActivityBaseline();
          setError(cause instanceof Error ? cause.message : "Refresh failed");
        }
      } finally {
        inFlight = false;
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15_000);
    const onVisible = () => {
      if (!documentHidden()) void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [
    scope,
    epoch,
    paused,
    follow,
    wallboard,
    view,
    documentHidden,
    startActivityBaseline,
  ]);

  useEffect(() => {
    if (view !== "gravity" || paused) return;
    const controller = new AbortController();
    const readScope = JSON.stringify([scope.projectId, sceneQuery.environment]);
    let inFlight = false;
    async function refreshScene() {
      if (documentHidden() || inFlight) return;
      inFlight = true;
      if (sceneReadScope.current !== readScope) {
        sceneReadScope.current = readScope;
        setObservatory(null);
      }
      try {
        const result = await apiJson<ObservatorySceneReadResult>(
          "/api/v1/infrastructure/observatory/scene",
          {
            method: "POST",
            body: JSON.stringify({
              ...sceneQuery,
              ...(scope.projectId ? { projectId: scope.projectId } : {}),
            }),
            signal: controller.signal,
          },
        );
        if (!controller.signal.aborted) {
          setObservatory(result);
          setSceneError(null);
        }
      } catch {
        if (!controller.signal.aborted) {
          startActivityBaseline();
          setSceneError(
            "Operational projection is unavailable. The last scene is delayed; refresh to retry.",
          );
        }
      } finally {
        inFlight = false;
      }
    }
    void refreshScene();
    const timer = setInterval(() => void refreshScene(), 15000);
    const visible = () => {
      if (!documentHidden()) void refreshScene();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [
    view,
    paused,
    scope.projectId,
    sceneQuery,
    epoch,
    documentHidden,
    startActivityBaseline,
  ]);

  useEffect(() => {
    if (!wallboard) return;
    const onKey = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        !event.defaultPrevented &&
        !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLSelectElement)
      )
        router.push("/infrastructure");
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [wallboard, router]);

  const nextCursor = data?.nextCursor;
  const hasSnapshot = data !== null;
  useEffect(() => {
    if (
      view === "gravity" ||
      !wallboard ||
      !rotatePages ||
      paused ||
      error ||
      !hasSnapshot
    )
      return;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      previousEvents.current = null;
      setHistory((current) => (nextCursor ? [...current, scope.cursor] : []));
      setData(null);
      setLoading(true);
      setSelectedId(null);
      setScope((current) => ({ ...current, cursor: nextCursor ?? "" }));
    }, 30000);
    return () => clearInterval(timer);
  }, [
    wallboard,
    rotatePages,
    paused,
    error,
    nextCursor,
    scope.cursor,
    hasSnapshot,
    view,
  ]);

  function changeScope(projectId: string, q = scope.q) {
    previousEvents.current = null;
    setRotatePages(false);
    setData(null);
    startActivityBaseline();
    setObservatory(null);
    setSceneError(null);
    setProgress(null);
    setError(null);
    setLoading(true);
    setPaused(false);
    setSelectedId(null);
    setHistory([]);
    setScope({ projectId, q, cursor: "" });
  }
  function changeView(next: typeof view) {
    if (next === view) return;
    changeScope(scope.projectId);
    setView(next);
  }
  function searchResources(event: FormEvent) {
    event.preventDefault();
    changeScope(scope.projectId, search.trim());
  }
  function rememberSelection(id: string) {
    setRotatePages(false);
    setFollow(false);
    setSelectedId(id);
  }
  function select(id: string) {
    rememberSelection(id);
    setSelectionRevision((current) => current + 1);
  }
  function nextPage(cursor: string, previous = false) {
    previousEvents.current = null;
    setRotatePages(false);
    setHistory((current) =>
      previous ? current.slice(0, -1) : [...current, scope.cursor],
    );
    setData(null);
    setError(null);
    setLoading(true);
    setPaused(false);
    setSelectedId(null);
    setScope((current) => ({ ...current, cursor }));
  }
  function toggleTv() {
    setTv((current) => {
      try {
        localStorage.setItem(
          "commandry.infrastructure.tv.v1",
          String(!current),
        );
      } catch {
        /* Current visit still works. */
      }
      return !current;
    });
  }
  async function fullscreen() {
    try {
      if (!container.current?.requestFullscreen)
        throw new Error(
          "Native fullscreen is unavailable. The wallboard still fills this window.",
        );
      if (document.fullscreenElement === container.current)
        await document.exitFullscreen();
      else await container.current.requestFullscreen();
      setFullscreenError(null);
    } catch {
      setFullscreenError(
        "Fullscreen could not open. The wallboard still fills this window.",
      );
    }
  }
  const selected = data?.items.find((item) => item.id === selectedId) ?? null;
  const attention = data?.items.filter(needsAttention) ?? [];
  const scopeParams = new URLSearchParams();
  if (scope.projectId) scopeParams.set("projectId", scope.projectId);
  if (scope.q) scopeParams.set("q", scope.q);
  const scopedSuffix = scopeParams.size ? `?${scopeParams}` : "";
  const content = (
    <div
      ref={container}
      className={`cmd-network-console ${wallboard ? "cmd-network-wallboard" : ""} ${tv ? "cmd-network-tv" : ""}`}
    >
      <header className="cmd-network-header">
        <div>
          <p className="cmd-eyebrow">Commandry / Infrastructure</p>
          <h1>Infrastructure overview</h1>
          <p className="cmd-network-subtitle">
            Your projects. The machines behind them.
          </p>
        </div>
        <div className="cmd-network-controls">
          <span
            className="cmd-network-refresh"
            data-delayed={!!error || paused}
          >
            {paused
              ? "Paused"
              : error
                ? "Refresh delayed"
                : loading
                  ? "Connecting"
                  : "15 second refresh"}
          </span>
          <Button
            onClick={() => {
              setPaused(false);
              setEpoch((current) => current + 1);
            }}
          >
            Refresh now
          </Button>
          <Button
            aria-pressed={paused}
            onClick={() => {
              if (!paused) startActivityBaseline();
              setPaused(!paused);
            }}
          >
            {paused ? "Resume updates" : "Pause updates"}
          </Button>
          {wallboard ? (
            <>
              <Button aria-pressed={tv} onClick={toggleTv}>
                TV style
              </Button>
              {view !== "gravity" && (
                <Button
                  aria-pressed={rotatePages}
                  onClick={() => {
                    setRotatePages((current) => !current);
                    setFollow(false);
                  }}
                >
                  Rotate pages (30s)
                </Button>
              )}
              <Button onClick={() => void fullscreen()}>Fullscreen</Button>
              <a
                className="cmd-button cmd-button-secondary"
                href={`/infrastructure${scopedSuffix}`}
              >
                Exit wallboard
              </a>
            </>
          ) : (
            <a
              className="cmd-button cmd-button-primary"
              href={`/infrastructure/wallboard${scopedSuffix}`}
            >
              Open wallboard
            </a>
          )}
        </div>
      </header>
      {fullscreenError && <p role="status">{fullscreenError}</p>}
      {sceneError && <p role="alert">{sceneError}</p>}
      <div className="cmd-network-vitals" aria-label="Infrastructure summary">
        <div>
          <span>Resources in scope</span>
          <strong>{data?.total ?? "--"}</strong>
        </div>
        <div>
          <span>Reporting in view</span>
          <strong>
            {data?.items.filter((item) => item.telemetry === "reporting")
              .length ?? "--"}
          </strong>
        </div>
        <div>
          <span>Resources need attention</span>
          <strong>{data ? attention.length : "--"}</strong>
        </div>
        <div>
          <span>Unobserved in view</span>
          <strong>
            {data?.items.filter(
              (item) =>
                item.telemetry === "unknown" || item.telemetry === "disabled",
            ).length ?? "--"}
          </strong>
        </div>
      </div>
      <div className="cmd-network-toolbar">
        {view !== "gravity" && (
          <form onSubmit={searchResources} className="cmd-network-search">
            <label htmlFor="infrastructure-search">Find a resource</label>
            <div>
              <input
                id="infrastructure-search"
                placeholder="Search names or kinds"
                maxLength={160}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <Button type="submit">Search</Button>
            </div>
          </form>
        )}
        <label className="cmd-network-project-filter">
          Project
          <select
            aria-label="Infrastructure project"
            value={scope.projectId}
            onChange={(event) => changeScope(event.target.value)}
          >
            <option value="">All projects and unlinked resources</option>
            {scope.projectId &&
              !projects.some((project) => project.id === scope.projectId) && (
                <option value={scope.projectId}>Selected project</option>
              )}
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <div
          className="cmd-network-controls"
          role="group"
          aria-label="Infrastructure view"
        >
          <Button
            aria-pressed={view === "gravity"}
            onClick={() => changeView("gravity")}
          >
            Gravity
          </Button>
          <Button
            aria-pressed={view === "map"}
            onClick={() => changeView("map")}
          >
            Topology
          </Button>
          <Button
            aria-pressed={view === "list"}
            onClick={() => changeView("list")}
          >
            List
          </Button>
        </div>
      </div>
      {projectsLoading && (
        <p role="status">
          Loading complete project catalogue. Canonical Work is unavailable
          until this read completes.
        </p>
      )}
      {projectError && projectErrorEpoch === epoch && (
        <p role="status">
          Project filters are unavailable. Refresh now to retry. Resource search
          remains available. Canonical Work is unavailable.
        </p>
      )}
      {error && (
        <div className="cmd-network-warning" role="alert">
          <strong>
            {data
              ? "Refresh delayed. Showing the last successful snapshot."
              : "Overview unavailable."}
          </strong>{" "}
          {error}{" "}
          <Button
            onClick={() => {
              setPaused(false);
              setEpoch((current) => current + 1);
            }}
          >
            Retry overview
          </Button>
        </div>
      )}
      {data && (
        <div className="cmd-network-snapshot">
          <span>
            {view === "gravity"
              ? `${data.items.length} of ${data.total} matching resources / one complete scene`
              : `${data.items.length} of ${data.total} matching resources / page ${history.length + 1}`}
          </span>
          <span>
            {view === "gravity" ? "Read beginning " : "Snapshot "}
            <time dateTime={data.readAt}>{time(data.readAt)}</time>
            {paused || error ? " / Not updating" : ""}
          </span>
        </div>
      )}
      {attention.length > 0 && (
        <div className="cmd-network-warning">
          <strong>
            {attention.length} resources have source issues in this view.
          </strong>{" "}
          {attention.map((item) => (
            <button key={item.id} onClick={() => select(item.id)} type="button">
              {item.name}: {label(item)}
            </button>
          ))}
        </div>
      )}
      {loading && (
        <p role="status">
          {view === "gravity" && progress
            ? `Loading complete scene: ${progress.loaded} of ${progress.total} resources...`
            : "Loading infrastructure..."}
        </p>
      )}
      {data?.total === 0 && (
        <div className="cmd-network-empty">
          <h2>
            {scope.q || scope.projectId
              ? "No matching resources"
              : "Your infrastructure starts here"}
          </h2>
          <p>
            {scope.q || scope.projectId
              ? "Try another name, kind, or project."
              : "Add your servers and services, then connect a source for observations."}
          </p>
          <a href="/infrastructure/inventory">Open resource inventory</a>
        </div>
      )}
      {data && data.total > 0 && data.items.length === 0 && (
        <p>
          This page is empty after an inventory change. Use Previous page or
          clear the scope.
        </p>
      )}
      {data && (view === "gravity" || data.items.length > 0) && (
        <div className="cmd-network-workspace" data-view={view}>
          <section
            className="cmd-network-main"
            aria-label={
              view === "gravity"
                ? "Gravity Observatory"
                : view === "map"
                  ? "Resource topology"
                  : "Resource list"
            }
          >
            {view !== "gravity" && (
              <div className="cmd-network-section-heading">
                <h2>
                  {view === "map"
                    ? "The infrastructure map"
                    : "All resources in view"}
                </h2>
                <Button
                  aria-pressed={follow}
                  onClick={() => setFollow((current) => !current)}
                >
                  Follow attention
                </Button>
              </div>
            )}
            {view === "gravity" ? (
              observatory ? (
                <OperationalObservatory
                  scene={observatory.scene}
                  snapshot={data}
                  compact={wallboard}
                  dark={tv}
                  selectedId={selectedId}
                  selectionRevision={selectionRevision}
                  onSelect={rememberSelection}
                  onProject={(id) => changeScope(id)}
                  onQueryChange={setSceneQuery}
                  onCameraFocus={(renderer, id, options) => {
                    renderer.focusSubject(id, options);
                  }}
                  initialSearch={initialQuery}
                  initialQuery={sceneQuery}
                  viewsClient={observatoryViewsClient}
                  workClient={loadObservatoryWorkPage}
                  workProjectIds={
                    projectsReady
                      ? projects.map((project) => project.id)
                      : undefined
                  }
                  evidenceClient={evidenceClient}
                  providerFeedClient={providerFeedClient}
                  reviewClient={reviewClient}
                  logoReviewClient={logoReviewClient}
                  logoUrl={logoUrl}
                  onReviewed={onReviewed}
                  scopeProjectId={scope.projectId || null}
                  paused={paused}
                  delayed={!!error || !!sceneError || activityBaselinePending}
                />
              ) : (
                <div role="status">
                  {sceneError ??
                    "Preparing the complete operational landscape..."}
                </div>
              )
            ) : view === "map" ? (
              <InfrastructureMap
                resources={data.items}
                compact={wallboard}
                arrivingResourceIds={paused || error ? [] : arrivals}
                edges={data.edges}
                selectedId={selected?.id ?? null}
                onSelect={select}
                onProject={(id) => changeScope(id)}
              />
            ) : (
              <ul className="cmd-network-list">
                {data.items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      aria-pressed={selected?.id === item.id}
                      onClick={() => select(item.id)}
                    >
                      <span>
                        <strong>{item.name}</strong>
                        <small>
                          {item.kind} /{" "}
                          {item.projects
                            .map((project) => project.name)
                            .join(", ") || "No project link"}
                        </small>
                      </span>
                      <span data-telemetry={item.telemetry}>{label(item)}</span>
                      <span>Health unknown</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="cmd-network-truth">
              {view === "gravity"
                ? "Availability, source freshness, monitoring coverage, security, provider exposure and Work retain independent evidence."
                : "Reporting describes source freshness. Service availability is not inferred from telemetry."}{" "}
              Lines show recorded relationships, not live network traffic.
            </p>
          </section>
          {view !== "gravity" && (
            <aside
              className="cmd-network-inspector"
              aria-label="Resource inspector and recent events"
            >
              {selected && (
                <section aria-label={`Selected resource ${selected.name}`}>
                  <p className="cmd-eyebrow">
                    {isInfrastructureHost(selected.kind)
                      ? "Host / Compute"
                      : "Resource / Service"}
                  </p>
                  <h2>{selected.name}</h2>
                  <p
                    className="cmd-network-source-state"
                    data-telemetry={selected.telemetry}
                  >
                    {label(selected)}
                  </p>
                  <p>Service health: unknown</p>
                  {selected.childCount !== undefined && (
                    <p>Child resources: {selected.childCount}</p>
                  )}
                  <Capacity resource={selected} />
                  {selected.metrics
                    .filter(
                      (metric) =>
                        !["host_memory_used", "host_disk_used"].includes(
                          metric.name,
                        ),
                    )
                    .map((metric) => (
                      <p key={`${metric.name}:${metric.evidenceHref}`}>
                        {metric.name === "host_uptime"
                          ? "Host uptime"
                          : "Load (1 minute)"}
                        :{" "}
                        {metric.unit === "milli_load"
                          ? metric.value / 1000
                          : `${metric.value} ${metric.unit}`}
                      </p>
                    ))}
                  {selected.sources.length === 0 && (
                    <p>No real source is connected. Health remains unknown.</p>
                  )}
                  {selected.sources.map((source) => (
                    <div className="cmd-network-source" key={source.id}>
                      <strong>{source.name}</strong>
                      <span>
                        {source.kind} /{" "}
                        {source.enabled ? "Enabled" : "Disabled"}
                      </span>
                      <span>
                        Freshness window: {source.freshnessWindowMinutes}{" "}
                        minutes
                      </span>
                      <span>
                        {source.observedAt ? (
                          <>
                            Observed{" "}
                            <time dateTime={source.observedAt}>
                              {time(source.observedAt)}
                            </time>
                          </>
                        ) : (
                          "No observation received"
                        )}
                      </span>
                      {source.error && (
                        <span>
                          Source reported an error. Inspect the integration for
                          details.
                        </span>
                      )}
                    </div>
                  ))}
                  {selected.metrics.length > 0 && (
                    <details>
                      <summary>Measurement evidence</summary>
                      {selected.metrics.map((metric) => (
                        <p key={`${metric.name}:${metric.evidenceHref}`}>
                          <a href={metric.evidenceHref}>
                            {metric.name}: {metric.value} {metric.unit}
                          </a>
                          <br />
                          <time dateTime={metric.sampledAt}>
                            {time(metric.sampledAt)}
                          </time>
                        </p>
                      ))}
                    </details>
                  )}
                  <div className="cmd-network-inspector-links">
                    <a href={`/resources/${selected.id}`}>
                      Open resource and relationships
                    </a>
                    <a href={`/resources/${selected.id}#dependency-impact`}>
                      Inspect dependency impact
                    </a>
                    {selected.projects.map((project) => (
                      <a key={project.id} href={`/projects/${project.id}`}>
                        {project.name}
                      </a>
                    ))}
                  </div>
                  <details>
                    <summary>Relationships in this snapshot</summary>
                    {data.edges
                      .filter(
                        (edge) =>
                          edge.from === selected.id || edge.to === selected.id,
                      )
                      .map((edge) => {
                        const otherId =
                          edge.from === selected.id ? edge.to : edge.from;
                        const other = data.items.find(
                          (item) => item.id === otherId,
                        );
                        return (
                          <p key={edge.id}>
                            {edge.from === selected.id
                              ? edge.type
                              : edge.type === "contains"
                                ? "contained by"
                                : "required by"}
                            :{" "}
                            <a href={`/resources/${otherId}`}>
                              {other?.name ?? "Resource outside this page"}
                            </a>
                          </p>
                        );
                      })}
                  </details>
                </section>
              )}
              <section
                className="cmd-network-activity"
                aria-label="Recent infrastructure events"
              >
                <div className="cmd-network-section-heading">
                  <h2>Recent events</h2>
                  <span>Latest 8 / this page</span>
                </div>
                {data.events.length === 0 ? (
                  <p>No real events recorded for resources in this view.</p>
                ) : (
                  <ol>
                    {data.events.map((event) => (
                      <li key={event.id}>
                        <a href={event.evidenceHref}>{event.summary}</a>
                        <span>{event.sourceLabel}</span>
                        <time dateTime={event.occurredAt}>
                          {time(event.occurredAt)}
                        </time>
                      </li>
                    ))}
                  </ol>
                )}
                <a
                  href={
                    scope.projectId
                      ? `/activity?projectId=${scope.projectId}`
                      : "/activity"
                  }
                >
                  Browse event history
                </a>
              </section>
            </aside>
          )}
        </div>
      )}
      <footer className="cmd-network-footer">
        {view !== "gravity" && (
          <div className="cmd-network-controls">
            <Button
              disabled={history.length === 0 || loading}
              onClick={() => nextPage(history.at(-1) ?? "", true)}
            >
              Previous page
            </Button>
            <Button
              disabled={!data?.nextCursor || loading}
              onClick={() => data?.nextCursor && nextPage(data.nextCursor)}
            >
              Next page
            </Button>
          </div>
        )}
        <nav aria-label="Infrastructure tools">
          <a href="/infrastructure/inventory">Manage inventory</a>
          <a href="/integrations">Manage sources</a>
          <a href="/attention-signals">Review signals</a>
          <a href="/systems">
            Browse operated systems and their supporting resources
          </a>
          <a href="/infrastructure/recovery">
            Review local recovery evidence and production gates
          </a>
        </nav>
      </footer>
    </div>
  );
  return wallboard ? (
    content
  ) : (
    <AppShell current="Infrastructure">{content}</AppShell>
  );
}
