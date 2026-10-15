"use client";

import { useRouter } from "next/navigation";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type {
  InfrastructureOverview,
  InfrastructureResource,
} from "@commandry/contracts";
import {
  AppShell,
  Button,
  InfrastructureMap,
  infrastructureTelemetryLabels,
  isInfrastructureHost,
} from "@commandry/ui";
import {
  apiJson,
  type PageResponse,
  type ProjectRecord,
} from "../projects/api";

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
  const [data, setData] = useState<InfrastructureOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [epoch, setEpoch] = useState(0);
  const [paused, setPaused] = useState(false);
  const [view, setView] = useState<"map" | "list">("map");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [follow, setFollow] = useState(false);
  const [tv, setTv] = useState(wallboard);
  const [rotatePages, setRotatePages] = useState(false);
  const [arrivals, setArrivals] = useState<string[]>([]);
  const previousEvents = useRef<Set<string> | null>(null);
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
        let cursor: string | null = null;
        const items: ProjectRecord[] = [];
        do {
          const params = new URLSearchParams({ limit: "100" });
          if (cursor) params.set("cursor", cursor);
          const page = await apiJson<PageResponse<ProjectRecord>>(
            `/api/v1/projects?${params}`,
            { signal: controller.signal },
          );
          items.push(...page.items);
          cursor = page.nextCursor;
        } while (cursor && !controller.signal.aborted);
        if (!controller.signal.aborted) {
          setProjects(items);
          setProjectError(false);
        }
      } catch {
        if (!controller.signal.aborted) setProjectError(true);
      }
    })();
    return () => controller.abort();
  }, [epoch]);

  useEffect(() => {
    if (paused) return;
    const controller = new AbortController();
    let inFlight = false;
    async function refresh() {
      if (inFlight || document.hidden) return;
      inFlight = true;
      try {
        const params = new URLSearchParams({ limit: wallboard ? "6" : "12" });
        if (scope.projectId) params.set("projectId", scope.projectId);
        if (scope.q) params.set("q", scope.q);
        if (scope.cursor) params.set("cursor", scope.cursor);
        const snapshot = await apiJson<InfrastructureOverview>(
          `/api/v1/infrastructure/overview?${params}`,
          { signal: controller.signal },
        );
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
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : "Refresh failed");
      } finally {
        inFlight = false;
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15_000);
    const onVisible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [scope, epoch, paused, follow, wallboard]);

  useEffect(() => {
    if (!wallboard) return;
    const onKey = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
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
    if (!wallboard || !rotatePages || paused || error || !hasSnapshot) return;
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
  ]);

  function changeScope(projectId: string, q = scope.q) {
    previousEvents.current = null;
    setRotatePages(false);
    setData(null);
    setError(null);
    setLoading(true);
    setPaused(false);
    setSelectedId(null);
    setHistory([]);
    setScope({ projectId, q, cursor: "" });
  }
  function searchResources(event: FormEvent) {
    event.preventDefault();
    changeScope(scope.projectId, search.trim());
  }
  function select(id: string) {
    setRotatePages(false);
    setFollow(false);
    setSelectedId(id);
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
  const selected =
    data?.items.find((item) => item.id === selectedId) ??
    data?.items[0] ??
    null;
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
            onClick={() => setPaused((current) => !current)}
          >
            {paused ? "Resume updates" : "Pause updates"}
          </Button>
          {wallboard ? (
            <>
              <Button aria-pressed={tv} onClick={toggleTv}>
                TV style
              </Button>
              <Button
                aria-pressed={rotatePages}
                onClick={() => {
                  setRotatePages((current) => !current);
                  setFollow(false);
                }}
              >
                Rotate pages (30s)
              </Button>
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
          <Button aria-pressed={view === "map"} onClick={() => setView("map")}>
            Map
          </Button>
          <Button
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
          >
            List
          </Button>
        </div>
      </div>
      {projectError && (
        <p role="status">
          Project filters are unavailable. Refresh now to retry. Resource search
          remains available.
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
            {data.items.length} of {data.total} matching resources / page{" "}
            {history.length + 1}
          </span>
          <span>
            Snapshot <time dateTime={data.readAt}>{time(data.readAt)}</time>
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
      {loading && <p role="status">Loading infrastructure...</p>}
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
      {data && data.items.length > 0 && (
        <div className="cmd-network-workspace">
          <section
            className="cmd-network-main"
            aria-label={view === "map" ? "Resource topology" : "Resource list"}
          >
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
            {view === "map" ? (
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
              Reporting describes source freshness. Service availability is not
              yet observed. Lines show recorded relationships, not live network
              traffic.
            </p>
          </section>
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
                      {source.kind} / {source.enabled ? "Enabled" : "Disabled"}
                    </span>
                    <span>
                      Freshness window: {source.freshnessWindowMinutes} minutes
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
        </div>
      )}
      <footer className="cmd-network-footer">
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
