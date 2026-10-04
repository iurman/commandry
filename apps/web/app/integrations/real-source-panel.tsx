"use client";
import { useEffect, useState, type FormEvent } from "react";
import type { RealIntegration } from "@commandry/contracts";
import { Button } from "@commandry/ui";
import {
  apiJson,
  pagePath,
  type PageResponse,
  type ProjectRecord,
  type ProjectResourceLink,
} from "../projects/api";

type Observation = {
  id: string;
  summary: string;
  occurredAt: string;
  evidenceHref: string;
  metrics: { name: string; value: number; unit: string }[];
};
type Props = {
  projects: ProjectRecord[];
  projectId: string;
  onProjectChange: (id: string) => void;
  resourceLinks: ProjectResourceLink[];
  hasMoreProjects: boolean;
  hasMoreResources: boolean;
  loadMoreProjects: () => Promise<void>;
  loadMoreResources: () => Promise<void>;
};
export function RealSourcePanel(props: Props) {
  const [items, setItems] = useState<RealIntegration[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [kind, setKind] =
    useState<RealIntegration["kind"]>("github-repository");
  const [name, setName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [resourceId, setResourceId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [tokens, setTokens] = useState<Record<string, string>>({});
  const [observations, setObservations] = useState<
    Record<string, Observation[]>
  >({});
  const [observationCursors, setObservationCursors] = useState<
    Record<string, string | null>
  >({});
  const links = props.resourceLinks.filter(
    (link) =>
      link.resource.kind ===
      (kind === "github-repository" ? "repository" : "host"),
  );
  const selectedResource = links.some((link) => link.resource.id === resourceId)
    ? resourceId
    : "";
  async function refresh(next?: string) {
    const page = await apiJson<PageResponse<RealIntegration>>(
      pagePath("/api/v1/real-integrations", next),
    );
    setItems((current) =>
      next
        ? [
            ...current,
            ...page.items.filter(
              (item) => !current.some((saved) => saved.id === item.id),
            ),
          ]
        : page.items,
    );
    setCursor(page.nextCursor);
  }
  useEffect(() => {
    let active = true;
    apiJson<PageResponse<RealIntegration>>(
      pagePath("/api/v1/real-integrations"),
    )
      .then((page) => {
        if (active) {
          setItems(page.items);
          setCursor(page.nextCursor);
        }
      })
      .catch((cause) => {
        if (active)
          setError(
            String(
              cause instanceof Error ? cause.message : "Sources unavailable",
            ),
          );
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);
  async function perform(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Source operation failed",
      );
    } finally {
      setBusy(false);
    }
  }
  async function create(event: FormEvent) {
    event.preventDefault();
    await perform(async () => {
      const item = await apiJson<RealIntegration>("/api/v1/real-integrations", {
        method: "POST",
        body: JSON.stringify({
          name,
          kind,
          identifier,
          projectId: props.projectId,
          resourceId: selectedResource,
        }),
      });
      setItems((current) => [item, ...current]);
      setName("");
      setIdentifier("");
    });
  }
  async function history(id: string, next?: string) {
    const page = await apiJson<PageResponse<Observation>>(
      pagePath(`/api/v1/real-integrations/${id}/observations`, next),
    );
    setObservations((current) => ({
      ...current,
      [id]: next ? [...(current[id] ?? []), ...page.items] : page.items,
    }));
    setObservationCursors((current) => ({ ...current, [id]: page.nextCursor }));
  }
  return (
    <section
      aria-labelledby="real-sources-heading"
      className="cmd-workspace-section"
    >
      <h2 id="real-sources-heading">Real sources</h2>
      <p>
        Read public GitHub repository activity or receive telemetry from a
        token-scoped Linux collector. These sources report real evidence.
      </p>
      <p>
        GitHub exposes up to 300 events from the last 30 days and may delay
        activity. Host metrics describe internal capacity, not external
        availability.
      </p>
      {error && (
        <p role="alert" className="cmd-inline-state cmd-error">
          {error}
        </p>
      )}
      <form className="cmd-form" onSubmit={create}>
        <label htmlFor="real-source-name">Real source name</label>
        <input
          id="real-source-name"
          required
          maxLength={160}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <label htmlFor="real-source-kind">Real source category</label>
        <select
          id="real-source-kind"
          value={kind}
          onChange={(event) => {
            setKind(event.target.value as RealIntegration["kind"]);
            setResourceId("");
            setIdentifier("");
          }}
        >
          <option value="github-repository">GitHub repository</option>
          <option value="linux-host">Linux host</option>
        </select>
        <label htmlFor="real-source-project">Real source project</label>
        <select
          id="real-source-project"
          required
          value={props.projectId}
          onChange={(event) => {
            props.onProjectChange(event.target.value);
            setResourceId("");
          }}
        >
          <option value="">Choose a project</option>
          {props.projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
        {props.hasMoreProjects && (
          <Button
            type="button"
            disabled={busy}
            onClick={() => void perform(props.loadMoreProjects)}
          >
            Load more source projects
          </Button>
        )}
        <label htmlFor="real-source-resource">Real source resource</label>
        <select
          id="real-source-resource"
          required
          value={selectedResource}
          onChange={(event) => setResourceId(event.target.value)}
        >
          <option value="">
            Choose a linked{" "}
            {kind === "github-repository" ? "repository" : "host"}
          </option>
          {links.map((link) => (
            <option key={link.id} value={link.resource.id}>
              {link.resource.name}
            </option>
          ))}
        </select>
        {props.hasMoreResources && (
          <Button
            type="button"
            disabled={busy}
            onClick={() => void perform(props.loadMoreResources)}
          >
            Load more source resources
          </Button>
        )}
        <label htmlFor="real-source-identifier">
          {kind === "github-repository"
            ? "GitHub owner/repository"
            : "Exact host name"}
        </label>
        <input
          id="real-source-identifier"
          required
          maxLength={200}
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
          placeholder={
            kind === "github-repository" ? "iurman/commandry" : "electra"
          }
        />
        <Button
          type="submit"
          disabled={busy || !selectedResource || !props.projectId}
        >
          Connect real source
        </Button>
      </form>
      <Button disabled={busy} onClick={() => void perform(() => refresh())}>
        Refresh real sources
      </Button>
      {!loaded && <p role="status">Loading real sources...</p>}
      {loaded && !error && items.length === 0 && (
        <p>No real sources configured.</p>
      )}
      {items.map((item) => (
        <article
          key={item.id}
          className="cmd-record-card"
          aria-label={item.name}
        >
          <h3>{item.name}</h3>
          <p>
            {item.identifier} - {item.enabled ? "Enabled" : "Disabled"} -{" "}
            {item.freshnessState}
          </p>
          <p>
            Last successful{" "}
            {item.kind === "github-repository" ? "poll" : "receipt"}:{" "}
            {item.lastSuccessAt ?? "Never"}. Last source observation:{" "}
            {item.lastObservedAt ?? "Unknown"}.
          </p>
          {item.lastError && (
            <p role="status">
              {item.lastError}. Next attempt:{" "}
              {item.nextAttemptAt ?? "Awaiting collector"}.
            </p>
          )}
          <Button
            disabled={busy}
            onClick={() =>
              void perform(async () => {
                const updated = await apiJson<RealIntegration>(
                  `/api/v1/real-integrations/${item.id}`,
                  {
                    method: "PUT",
                    body: JSON.stringify({ enabled: !item.enabled }),
                  },
                );
                setItems((current) =>
                  current.map((saved) =>
                    saved.id === item.id ? updated : saved,
                  ),
                );
              })
            }
          >
            {item.enabled ? "Disable" : "Enable"} {item.name}
          </Button>
          {item.kind === "linux-host" && (
            <Button
              disabled={busy}
              onClick={() =>
                void perform(async () => {
                  const issued = await apiJson<{ token: string }>(
                    `/api/v1/real-integrations/${item.id}/token`,
                    { method: "POST" },
                  );
                  setTokens((current) => ({
                    ...current,
                    [item.id]: issued.token,
                  }));
                  const updated = await apiJson<RealIntegration>(
                    `/api/v1/real-integrations/${item.id}`,
                  );
                  setItems((current) =>
                    current.map((saved) =>
                      saved.id === item.id ? updated : saved,
                    ),
                  );
                })
              }
            >
              Rotate host token for {item.name}
            </Button>
          )}
          {tokens[item.id] && (
            <div role="status">
              <p>
                Save this token privately in the collector environment. It is
                shown once and replaces the previous token.
              </p>
              <code style={{ overflowWrap: "anywhere" }}>
                {tokens[item.id]}
              </code>
              <Button
                onClick={() =>
                  setTokens((current) => {
                    const next = { ...current };
                    delete next[item.id];
                    return next;
                  })
                }
              >
                Hide host token
              </Button>
            </div>
          )}
          {item.kind === "linux-host" && (
            <p>
              Receiver:{" "}
              <code style={{ overflowWrap: "anywhere" }}>
                /api/v1/real-integrations/{item.id}/receive
              </code>
            </p>
          )}
          <Button
            disabled={busy}
            onClick={() => void perform(() => history(item.id))}
          >
            View observations for {item.name}
          </Button>
          {observations[item.id]?.length === 0 && (
            <p>No observations received.</p>
          )}
          <ul>
            {observations[item.id]?.map((observation) => (
              <li key={observation.id}>
                {observation.summary}{" "}
                <time dateTime={observation.occurredAt}>
                  {observation.occurredAt}
                </time>
                <ul>
                  {observation.metrics.map((metric) => (
                    <li key={metric.name}>
                      {metric.name === "host_memory_used"
                        ? `Memory used: ${metric.value}%`
                        : metric.name === "host_disk_used"
                          ? `Disk used: ${metric.value}%`
                          : metric.name === "host_uptime"
                            ? `Host uptime: ${metric.value} seconds`
                            : metric.name === "host_load_1m"
                              ? `Load average (1 minute): ${metric.value / 1000}`
                              : `${metric.name.replaceAll("_", " ")}: ${metric.value} ${metric.unit}`}
                    </li>
                  ))}
                </ul>
                <a href={observation.evidenceHref}>
                  Inspect real source evidence
                </a>
              </li>
            ))}
          </ul>
          {observationCursors[item.id] && (
            <Button
              disabled={busy}
              onClick={() =>
                void perform(() =>
                  history(item.id, observationCursors[item.id]!),
                )
              }
            >
              Load more observations for {item.name}
            </Button>
          )}
        </article>
      ))}
      {cursor && (
        <Button
          disabled={busy}
          onClick={() => void perform(() => refresh(cursor))}
        >
          Load more real sources
        </Button>
      )}
    </section>
  );
}
