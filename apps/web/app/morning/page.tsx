"use client";

import { useEffect, useState, type FormEvent } from "react";
import type {
  MorningDigestItem,
  MorningDigestResponse,
} from "@commandry/contracts";
import {
  AppShell,
  Button,
  MorningDigestCard,
  RecordEmptyState,
} from "@commandry/ui";
import {
  apiJson,
  pagePath,
  type PageResponse,
  type ProjectRecord,
} from "../projects/api";

type Range = { from: string; to: string; projectId: string };

function deviceDateTime(date: Date) {
  const two = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}T${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`;
}

function digestPath(range: Range, cursor?: string) {
  const query = new URLSearchParams({
    from: range.from,
    to: range.to,
    limit: "20",
  });
  if (range.projectId) query.set("projectId", range.projectId);
  if (cursor) query.set("cursor", cursor);
  return `/api/v1/morning-digest?${query.toString()}`;
}

const groups = [
  {
    outcome: "awaiting_review",
    title: "Completed, awaiting review",
    description:
      "These local results are unverified. Open each run to inspect evidence.",
  },
  {
    outcome: "failed",
    title: "Failed",
    description:
      "Open the run for attempts, errors, and available source context.",
  },
  {
    outcome: "skipped",
    title: "Skipped",
    description:
      "The run did not execute; its source and skip reason remain recorded.",
  },
] as const;

export default function MorningPage() {
  const [fromInput, setFromInput] = useState("");
  const [toInput, setToInput] = useState("");
  const [projectId, setProjectId] = useState("");
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [projectCursor, setProjectCursor] = useState<string | null>(null);
  const [range, setRange] = useState<Range | null>(null);
  const [items, setItems] = useState<MorningDigestItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [projectBusy, setProjectBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(nextRange: Range, nextCursor?: string) {
    setLoading(true);
    setError(null);
    try {
      const page = await apiJson<MorningDigestResponse>(
        digestPath(nextRange, nextCursor),
      );
      setItems((current) =>
        nextCursor
          ? [
              ...current,
              ...page.items.filter(
                (item) => !current.some((saved) => saved.id === item.id),
              ),
            ]
          : page.items,
      );
      setCursor(page.nextCursor);
      setRange(nextRange);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Morning digest is unavailable.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      const to = new Date(Math.floor(Date.now() / 1000) * 1000);
      const from = new Date(to.getTime() - 24 * 60 * 60_000);
      setFromInput(deviceDateTime(from));
      setToInput(deviceDateTime(to));
      void load({
        from: from.toISOString(),
        to: to.toISOString(),
        projectId: "",
      });
    }, 0);
    void apiJson<PageResponse<ProjectRecord>>(pagePath("/api/v1/projects"))
      .then((page) => {
        setProjects(page.items);
        setProjectCursor(page.nextCursor);
      })
      .catch(() => {
        setError(
          "Project choices could not load. The all-project digest remains available.",
        );
      });
    return () => window.clearTimeout(initialLoad);
  }, []);

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const from = new Date(fromInput);
    const to = new Date(toInput);
    if (
      !Number.isFinite(from.getTime()) ||
      !Number.isFinite(to.getTime()) ||
      from >= to ||
      to.getTime() - from.getTime() > 31 * 24 * 60 * 60_000
    ) {
      setError("Choose a positive window no wider than 31 days.");
      return;
    }
    void load({ from: from.toISOString(), to: to.toISOString(), projectId });
  }

  function lastDay() {
    const to = new Date(Math.floor(Date.now() / 1000) * 1000);
    const from = new Date(to.getTime() - 24 * 60 * 60_000);
    setFromInput(deviceDateTime(from));
    setToInput(deviceDateTime(to));
    void load({ from: from.toISOString(), to: to.toISOString(), projectId });
  }

  async function loadMoreProjects() {
    if (!projectCursor || projectBusy) return;
    setProjectBusy(true);
    try {
      const page = await apiJson<PageResponse<ProjectRecord>>(
        pagePath("/api/v1/projects", projectCursor),
      );
      setProjects((current) => [
        ...current,
        ...page.items.filter(
          (item) => !current.some((saved) => saved.id === item.id),
        ),
      ]);
      setProjectCursor(page.nextCursor);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load more projects.",
      );
    } finally {
      setProjectBusy(false);
    }
  }

  return (
    <AppShell current="Automations">
      <div className="cmd-breadcrumb">
        <a href="/automations">Automations</a>
        <span aria-hidden="true">/</span>
        <span>Morning digest</span>
      </div>
      <header className="cmd-page-header">
        <div>
          <p className="cmd-eyebrow">Local review / Synthetic outcomes</p>
          <h1>Morning run digest</h1>
          <p className="cmd-lead">
            Review persisted local automation and fake agent outcomes in a
            chosen UTC window. Every result is unverified and source-linked.
            This view does not schedule overnight work or claim live activity.
          </p>
        </div>
      </header>
      <section
        className="cmd-workspace-section"
        aria-labelledby="digest-window-heading"
      >
        <p className="cmd-eyebrow">Window / From inclusive, to exclusive</p>
        <h2 id="digest-window-heading">Choose outcomes</h2>
        <form className="cmd-form" onSubmit={apply}>
          <label htmlFor="digest-from">From (device time)</label>
          <input
            id="digest-from"
            onChange={(event) => setFromInput(event.target.value)}
            required
            step="1"
            type="datetime-local"
            value={fromInput}
          />
          <label htmlFor="digest-to">To (device time)</label>
          <input
            id="digest-to"
            onChange={(event) => setToInput(event.target.value)}
            required
            step="1"
            type="datetime-local"
            value={toInput}
          />
          <label htmlFor="digest-project">Project</label>
          <select
            id="digest-project"
            onChange={(event) => setProjectId(event.target.value)}
            value={projectId}
          >
            <option value="">All projects</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          {projectCursor && (
            <Button disabled={projectBusy} onClick={loadMoreProjects}>
              Load more project choices
            </Button>
          )}
          <div className="cmd-decision-actions">
            <Button disabled={loading} type="submit" variant="primary">
              Show outcomes
            </Button>
            <Button disabled={loading} onClick={lastDay}>
              Last 24 hours
            </Button>
          </div>
        </form>
        {range && (
          <p className="cmd-form-hint">
            Showing completed outcomes from{" "}
            <time dateTime={range.from}>{range.from} UTC</time> to{" "}
            <time dateTime={range.to}>{range.to} UTC</time>. {items.length}{" "}
            loaded.
          </p>
        )}
      </section>
      {error && (
        <p className="cmd-inline-state cmd-error" role="alert">
          {error}
        </p>
      )}
      {loading && items.length === 0 && (
        <p className="cmd-inline-state" role="status">
          Loading local outcomes...
        </p>
      )}
      {!loading && items.length === 0 && !error && (
        <RecordEmptyState
          title="No completed local runs in this window"
          description="Choose another UTC window or project, or run a local automation or fake agent first."
        />
      )}
      {groups.map((group) => {
        const shown = items.filter((item) => item.outcome === group.outcome);
        if (shown.length === 0) return null;
        return (
          <section
            className="cmd-workspace-section"
            key={group.outcome}
            aria-labelledby={`digest-${group.outcome}`}
          >
            <div className="cmd-section-heading">
              <div>
                <p className="cmd-eyebrow">
                  {shown.length} loaded / Unverified
                </p>
                <h2 id={`digest-${group.outcome}`}>{group.title}</h2>
              </div>
            </div>
            <p>{group.description}</p>
            <ul className="cmd-automation-list" aria-label={group.title}>
              {shown.map((item) => (
                <li key={`${item.kind}:${item.id}`}>
                  <MorningDigestCard item={item} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {cursor && range && (
        <Button disabled={loading} onClick={() => void load(range, cursor)}>
          {loading ? "Loading..." : "Load older outcomes"}
        </Button>
      )}
    </AppShell>
  );
}
