"use client";

import { useEffect, useState } from "react";
import {
  projectBriefSchema,
  projectPresentationSchema,
  listProjectPresentationEventsResponseSchema,
  type ProjectBrief,
  type ProjectPresentation,
  type ProjectPresentationEvent,
} from "@commandry/contracts";
import { projectAreaIds, projectOverviewCardIds } from "@commandry/domain";
import {
  Button,
  ProjectOverviewCard,
  type ProjectOverviewFact,
} from "@commandry/ui";
import { apiJson } from "../api";

type CardId = ProjectPresentation["overviewCards"][number];
type AreaId = ProjectPresentation["visibleAreas"][number];
type HistoryPage = {
  items: ProjectPresentationEvent[];
  nextCursor: number | null;
};

const cardLabels: Record<CardId, string> = {
  state: "Project state",
  work: "Work",
  knowledge: "Knowledge",
  decisions: "Decisions",
  systems: "Systems",
  resources: "Resources",
  activity: "Recent activity",
  attention: "Attention",
};

const areaLabels: Record<AreaId, string> = {
  systems: "Systems",
  resources: "Linked resources and editing",
  metrics: "Synthetic metrics",
  work: "Project work",
  knowledge: "Project knowledge",
  decisions: "Decisions",
};

function cardData(brief: ProjectBrief, id: CardId) {
  if (id === "state") {
    const evidence = brief.state.evidence[0];
    return {
      facts: evidence
        ? [
            {
              title: "Current project state",
              detail: brief.state.text,
              evidenceHref: evidence.href,
              sourceLabel: evidence.sourceLabel,
              recordedAt: evidence.recordedAt,
              isSynthetic: evidence.isSynthetic,
            },
          ]
        : [],
      emptyState: null,
      sourceListHref: `/api/v1/projects/${encodeURIComponent(brief.project.id)}`,
    };
  }
  const section = brief.sections[id];
  if (!section) {
    return {
      facts: [] as ProjectOverviewFact[],
      emptyState: "No source-backed facts are available yet.",
      sourceListHref: `/api/v1/projects/${encodeURIComponent(brief.project.id)}/systems`,
    };
  }
  return {
    facts: section.items.slice(0, 2).flatMap((item) => {
      const evidence = item.evidence[0];
      return evidence
        ? [
            {
              title: item.title,
              detail: item.detail,
              evidenceHref: evidence.href,
              sourceLabel: item.sourceLabel,
              recordedAt: evidence.recordedAt,
              isSynthetic: item.isSynthetic || evidence.isSynthetic,
            },
          ]
        : [];
    }),
    emptyState: section.emptyState,
    sourceListHref: section.fullListHref,
  };
}

export default function ProjectOverviewPanel({
  projectId,
  presentation,
  onPresentationChange,
  briefVersion,
}: {
  projectId: string;
  presentation: ProjectPresentation;
  onPresentationChange: (next: ProjectPresentation) => void;
  briefVersion: number;
}) {
  const [brief, setBrief] = useState<ProjectBrief | null>(null);
  const [briefError, setBriefError] = useState<string | null>(null);
  const [briefRefresh, setBriefRefresh] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draftCards, setDraftCards] = useState<CardId[]>([
    ...presentation.overviewCards,
  ]);
  const [draftAreas, setDraftAreas] = useState<AreaId[]>([
    ...presentation.visibleAreas,
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [history, setHistory] = useState<ProjectPresentationEvent[]>([]);
  const [historyCursor, setHistoryCursor] = useState<number | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  const presentationPath = `/api/v1/projects/${encodeURIComponent(projectId)}/presentation`;
  const changesPath = `${presentationPath}/changes`;

  useEffect(() => {
    let active = true;
    apiJson<unknown>(`/api/v1/projects/${encodeURIComponent(projectId)}/brief`)
      .then((record) => {
        if (!active) return;
        const parsed = projectBriefSchema.safeParse(record);
        if (!parsed.success)
          throw new Error("Project brief response is invalid.");
        setBrief(parsed.data as ProjectBrief);
        setBriefError(null);
      })
      .catch((cause: unknown) => {
        if (active)
          setBriefError(
            cause instanceof Error ? cause.message : "Overview unavailable.",
          );
      });
    return () => {
      active = false;
    };
  }, [projectId, briefVersion, briefRefresh]);

  async function loadHistory(beforeVersion?: number) {
    if (historyBusy) return;
    setHistoryBusy(true);
    try {
      const url = `${changesPath}?limit=10${beforeVersion ? `&beforeVersion=${beforeVersion}` : ""}`;
      const record = await apiJson<unknown>(url);
      const parsed = listProjectPresentationEventsResponseSchema.parse(record);
      const page = parsed as HistoryPage;
      setHistory((current) =>
        beforeVersion ? [...current, ...page.items] : page.items,
      );
      setHistoryCursor(page.nextCursor);
      setHistoryLoaded(true);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load view history.",
      );
    } finally {
      setHistoryBusy(false);
    }
  }

  async function reload() {
    setBusy(true);
    setError(null);
    try {
      const record = await apiJson<unknown>(presentationPath);
      const current = projectPresentationSchema.parse(record);
      setDraftCards([...current.overviewCards]);
      setDraftAreas([...current.visibleAreas]);
      onPresentationChange(current);
      setEditing(false);
      setFeedback("Reloaded current project view.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not reload view.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const record = await apiJson<unknown>(presentationPath, {
        method: "PATCH",
        body: JSON.stringify({
          expectedVersion: presentation.version,
          overviewCards: draftCards,
          visibleAreas: draftAreas,
        }),
      });
      const next = projectPresentationSchema.parse(record);
      onPresentationChange(next);
      setEditing(false);
      setFeedback(
        next.version === presentation.version
          ? "Project view was already current."
          : "Project view saved with an audit record.",
      );
      if (historyLoaded) void loadHistory();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save view.");
    } finally {
      setBusy(false);
    }
  }

  function moveCard(id: CardId, direction: -1 | 1) {
    setDraftCards((current) => {
      const from = current.indexOf(id);
      const to = from + direction;
      if (from < 0 || to < 0 || to >= current.length) return current;
      const next = [...current];
      [next[from], next[to]] = [next[to]!, next[from]!];
      return next;
    });
  }

  return (
    <section
      className="cmd-workspace-section"
      aria-labelledby="project-overview-heading"
    >
      <div className="cmd-section-heading">
        <div>
          <p className="cmd-eyebrow">Project overview</p>
          <h2 id="project-overview-heading">At a glance</h2>
        </div>
        <span className="cmd-count">View version {presentation.version}</span>
      </div>
      <p className="cmd-section-intro">
        Cards summarize the current evidence-linked brief. Hiding a workspace
        area changes presentation only; its records remain available from Work,
        Knowledge, Search, and source links.
      </p>
      {briefError && (
        <p className="cmd-inline-state cmd-error" role="alert">
          {briefError}
        </p>
      )}
      {!brief && !briefError && (
        <p className="cmd-inline-state" role="status">
          Loading project overview...
        </p>
      )}
      {brief &&
        (presentation.overviewCards.length > 0 ? (
          <div
            className="cmd-project-overview-grid"
            aria-label="Project overview cards"
          >
            {presentation.overviewCards.map((id) => {
              const data = cardData(brief, id);
              return (
                <ProjectOverviewCard
                  key={id}
                  title={cardLabels[id]}
                  facts={data.facts}
                  emptyState={data.emptyState}
                  sourceListHref={data.sourceListHref}
                  generatedAt={brief.asOf}
                />
              );
            })}
          </div>
        ) : (
          <p className="cmd-inline-state">
            No overview cards selected. Customize the project view to add one.
          </p>
        ))}
      <div className="cmd-inline-actions">
        <Button
          onClick={() => {
            setBrief(null);
            setBriefError(null);
            setBriefRefresh((current) => current + 1);
          }}
        >
          Refresh overview
        </Button>
        <Button
          onClick={() => {
            setEditing((current) => !current);
            setError(null);
          }}
        >
          {editing ? "Close view settings" : "Customize project view"}
        </Button>
        <Button onClick={() => void loadHistory()} disabled={historyBusy}>
          {historyBusy ? "Loading..." : "Review view changes"}
        </Button>
      </div>
      {editing && (
        <div className="cmd-project-view-settings">
          <div>
            <h3>Overview cards</h3>
            <p>
              Select cards and set their order. Every card uses the live brief
              and links to its source.
            </p>
            <ul
              className="cmd-project-view-options"
              aria-label="Selected overview cards"
            >
              {draftCards.map((id, index) => (
                <li key={id}>
                  <label>
                    <input
                      type="checkbox"
                      checked
                      onChange={() =>
                        setDraftCards((current) =>
                          current.filter((item) => item !== id),
                        )
                      }
                    />
                    {cardLabels[id]}
                  </label>
                  <div className="cmd-inline-actions">
                    <Button
                      disabled={index === 0}
                      onClick={() => moveCard(id, -1)}
                    >
                      Move up
                    </Button>
                    <Button
                      disabled={index === draftCards.length - 1}
                      onClick={() => moveCard(id, 1)}
                    >
                      Move down
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            {projectOverviewCardIds
              .filter((id) => !draftCards.includes(id))
              .map((id) => (
                <label className="cmd-project-view-available" key={id}>
                  <input
                    type="checkbox"
                    checked={false}
                    onChange={() =>
                      setDraftCards((current) => [...current, id])
                    }
                  />
                  {cardLabels[id]}
                </label>
              ))}
          </div>
          <div>
            <h3>Workspace areas</h3>
            <p>
              Restore any hidden area here. Records are never deleted by this
              setting.
            </p>
            {projectAreaIds.map((id) => (
              <label className="cmd-project-view-available" key={id}>
                <input
                  type="checkbox"
                  checked={draftAreas.includes(id)}
                  onChange={() =>
                    setDraftAreas((current) =>
                      current.includes(id)
                        ? current.filter((item) => item !== id)
                        : [...current, id],
                    )
                  }
                />
                {areaLabels[id]}
              </label>
            ))}
          </div>
          <div className="cmd-inline-actions">
            <Button disabled={busy} variant="primary" onClick={save}>
              {busy ? "Saving..." : "Save project view"}
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                setDraftCards([...presentation.overviewCards]);
                setDraftAreas([...presentation.visibleAreas]);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
      {error && (
        <div className="cmd-inline-state cmd-error" role="alert">
          <p>{error}</p>
          <Button disabled={busy} onClick={reload}>
            Reload view
          </Button>
        </div>
      )}
      {feedback && (
        <p className="cmd-form-success" role="status">
          {feedback}
        </p>
      )}
      {historyLoaded && (
        <div className="cmd-project-view-history">
          <h3>View change history</h3>
          {history.length === 0 && <p>No view changes yet.</p>}
          <ul aria-label="Project view changes">
            {history.map((event) => (
              <li key={event.id}>
                <strong>Version {event.version}</strong> by {event.actor}.{" "}
                {event.current.overviewCards.length} cards,{" "}
                {event.current.visibleAreas.length} visible areas.{" "}
                <a href={`${changesPath}/${event.version}`}>
                  Exact audit record
                </a>
              </li>
            ))}
          </ul>
          {historyCursor !== null && (
            <Button
              disabled={historyBusy}
              onClick={() => void loadHistory(historyCursor)}
            >
              {historyBusy ? "Loading..." : "Load older view changes"}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
