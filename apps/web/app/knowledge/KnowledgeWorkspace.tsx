"use client";

import { useEffect, useState } from "react";
import type {
  SavedViewDefinition,
  WorkspaceDecision,
  WorkspaceKnowledgeItem,
} from "@commandry/contracts";
import {
  AppShell,
  Button,
  DecisionCard,
  KnowledgeDocumentCard,
  KnowledgeLinkCard,
  KnowledgeTypeBadge,
  knowledgeTypeLabel,
  RecordEmptyState,
} from "@commandry/ui";
import { apiJson, type PageResponse } from "../projects/api";
import SavedViewControls from "../components/SavedViewControls";

const notesPath = "/api/v1/knowledge-items";
const decisionsPath = "/api/v1/decisions";

function workspacePagePath(
  path: string,
  projectId: string | null,
  cursor?: string | null,
  kind?: WorkspaceKnowledgeItem["kind"] | "all",
) {
  const params = new URLSearchParams({ limit: "20" });
  if (projectId) params.set("projectId", projectId);
  if (cursor) params.set("cursor", cursor);
  if (kind && kind !== "all") params.set("kind", kind);
  return `${path}?${params}`;
}

const knowledgeKinds: WorkspaceKnowledgeItem["kind"][] = [
  "note",
  "idea",
  "research",
  "requirement",
  "architecture_note",
  "runbook",
  "meeting_note",
  "lesson_learned",
  "instruction",
  "link",
  "document",
];

export default function KnowledgeWorkspace({
  projectId,
}: {
  projectId: string | null;
}) {
  const [activeProjectId, setActiveProjectId] = useState(projectId);
  const [kind, setKind] = useState<WorkspaceKnowledgeItem["kind"] | "all">(
    "all",
  );
  const [notes, setNotes] = useState<WorkspaceKnowledgeItem[]>([]);
  const [decisions, setDecisions] = useState<WorkspaceDecision[]>([]);
  const [notesCursor, setNotesCursor] = useState<string | null>(null);
  const [decisionsCursor, setDecisionsCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState<"notes" | "decisions" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiJson<PageResponse<WorkspaceKnowledgeItem>>(
        workspacePagePath(notesPath, activeProjectId, undefined, kind),
      ),
      apiJson<PageResponse<WorkspaceDecision>>(
        workspacePagePath(decisionsPath, activeProjectId),
      ),
    ])
      .then(([notePage, decisionPage]) => {
        if (!active) return;
        setNotes(notePage.items);
        setNotesCursor(notePage.nextCursor);
        setDecisions(decisionPage.items);
        setDecisionsCursor(decisionPage.nextCursor);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Knowledge is unavailable.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [activeProjectId, kind]);

  async function loadMore(section: "notes" | "decisions") {
    const cursor = section === "notes" ? notesCursor : decisionsCursor;
    if (!cursor || loadingMore) return;
    setLoadingMore(section);
    setError(null);
    try {
      if (section === "notes") {
        const page = await apiJson<PageResponse<WorkspaceKnowledgeItem>>(
          workspacePagePath(notesPath, activeProjectId, cursor, kind),
        );
        setNotes((current) => [...current, ...page.items]);
        setNotesCursor(page.nextCursor);
      } else {
        const page = await apiJson<PageResponse<WorkspaceDecision>>(
          workspacePagePath(decisionsPath, activeProjectId, cursor),
        );
        setDecisions((current) => [...current, ...page.items]);
        setDecisionsCursor(page.nextCursor);
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load more knowledge.",
      );
    } finally {
      setLoadingMore(null);
    }
  }

  const savedDefinition: SavedViewDefinition = {
    surface: "knowledge",
    projectId: activeProjectId,
    kind,
  };

  function applySavedView(definition: SavedViewDefinition) {
    if (definition.surface !== "knowledge") return;
    if (activeProjectId === definition.projectId && kind === definition.kind)
      return;
    setActiveProjectId(definition.projectId);
    setKind(definition.kind);
    setNotes([]);
    setNotesCursor(null);
    setLoading(true);
    window.history.replaceState(
      null,
      "",
      definition.projectId
        ? `/knowledge?projectId=${encodeURIComponent(definition.projectId)}`
        : "/knowledge",
    );
  }

  return (
    <AppShell current="Knowledge">
      <nav className="cmd-breadcrumb" aria-label="Breadcrumb">
        <a href="/">Command Center</a>
        <span aria-hidden="true">/</span>
        <span>Knowledge</span>
      </nav>
      <header className="cmd-page-header cmd-workspace-heading">
        <div>
          <p className="cmd-eyebrow">Knowledge / Across projects</p>
          <h1>Knowledge</h1>
          <p className="cmd-lead">
            Read local ideas, research, runbooks, notes, links, documents, and
            decisions in project context. Originals stay separate from editable
            Knowledge records.
          </p>
        </div>
        <a className="cmd-headline-mark" href="/inbox">
          Capture knowledge
        </a>
      </header>
      {activeProjectId && (
        <p className="cmd-section-intro">
          Showing knowledge for{" "}
          <a href={`/projects/${encodeURIComponent(activeProjectId)}`}>
            this project
          </a>
          . <a href="/knowledge">Show all projects</a>.
        </p>
      )}
      <p className="cmd-section-intro">
        <a
          href={
            activeProjectId
              ? `/search?projectId=${encodeURIComponent(activeProjectId)}`
              : "/search"
          }
        >
          Search across knowledge and source captures
        </a>
        . Record a new decision from its project workspace.
      </p>
      <SavedViewControls
        definition={savedDefinition}
        onApply={applySavedView}
      />
      <div className="cmd-work-focus" role="group" aria-label="Knowledge query">
        <label>
          Knowledge type
          <select
            value={kind}
            onChange={(event) => {
              const next = event.target.value as typeof kind;
              if (next === kind) return;
              setKind(next);
              setNotes([]);
              setNotesCursor(null);
              setLoading(true);
            }}
          >
            <option value="all">All knowledge types</option>
            {knowledgeKinds.map((choice) => (
              <option key={choice} value={choice}>
                {knowledgeTypeLabel(choice)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="cmd-section-intro">
        The type filter applies to Knowledge records. Decisions stay visible
        within the selected project scope.
      </p>
      {loading && (
        <p className="cmd-inline-state" role="status">
          Loading knowledge...
        </p>
      )}
      {error && (
        <p className="cmd-inline-state cmd-error" role="alert">
          {error}
        </p>
      )}
      {!loading && (
        <div className="cmd-knowledge-grid">
          <section
            className="cmd-workspace-section"
            aria-labelledby="notes-heading"
          >
            <div className="cmd-section-heading">
              <div>
                <p className="cmd-eyebrow">Source preserving</p>
                <h2 id="notes-heading">Knowledge records</h2>
              </div>
              <span className="cmd-count">{notes.length} shown</span>
            </div>
            {notes.length === 0 && !error && (
              <RecordEmptyState
                title="No knowledge records yet"
                description="Capture text, a URL, or a file in the Inbox and file it as knowledge."
              />
            )}
            <ul className="cmd-record-list" aria-label="Knowledge records">
              {notes.map((note) => (
                <li key={note.id}>
                  {note.contextLink && (
                    <p className="cmd-record-identity">
                      Shared into this project from {note.projectName} through
                      an{" "}
                      <a
                        href={`/api/v1/knowledge-project-links/${note.contextLink.id}`}
                      >
                        exact typed relationship
                      </a>
                      .
                    </p>
                  )}
                  {note.kind === "link" && note.url ? (
                    <KnowledgeLinkCard
                      link={{
                        id: note.id,
                        projectId: note.projectId,
                        projectName: note.projectName,
                        sourceCaptureId: note.sourceCaptureId,
                        title: note.title,
                        content: note.content,
                        url: note.url,
                      }}
                    />
                  ) : note.kind === "document" ? (
                    <KnowledgeDocumentCard
                      document={{
                        id: note.id,
                        projectId: note.projectId,
                        projectName: note.projectName,
                        sourceCaptureId: note.sourceCaptureId,
                        title: note.title,
                        content: note.content,
                        version: note.version ?? 1,
                      }}
                    />
                  ) : (
                    <article className="cmd-record-card">
                      <div className="cmd-record-topline">
                        <KnowledgeTypeBadge kind={note.kind} />
                        <span className="cmd-count">
                          Version {note.version ?? 1}
                        </span>
                      </div>
                      <h3 className="cmd-record-title">
                        <a
                          href={`/knowledge-items/${encodeURIComponent(note.id)}`}
                        >
                          {note.title}
                        </a>
                      </h3>
                      {note.content && (
                        <p className="cmd-record-description">
                          {note.content.length > 240
                            ? `${note.content.slice(0, 240)}…`
                            : note.content}
                        </p>
                      )}
                      <p className="cmd-record-identity">
                        <a
                          href={`/projects/${encodeURIComponent(note.projectId)}`}
                        >
                          {note.projectName}
                        </a>
                        <a
                          href={`/inbox?captureId=${encodeURIComponent(note.sourceCaptureId)}`}
                        >
                          Exact original capture
                        </a>
                      </p>
                    </article>
                  )}
                </li>
              ))}
            </ul>
            {notesCursor && (
              <Button
                disabled={loadingMore !== null}
                onClick={() => loadMore("notes")}
              >
                {loadingMore === "notes" ? "Loading..." : "Load more knowledge"}
              </Button>
            )}
          </section>
          <section
            className="cmd-workspace-section"
            aria-labelledby="decisions-heading"
          >
            <div className="cmd-section-heading">
              <div>
                <p className="cmd-eyebrow">Manual project memory</p>
                <h2 id="decisions-heading">Decisions</h2>
              </div>
              <span className="cmd-count">{decisions.length} shown</span>
            </div>
            {decisions.length === 0 && !error && (
              <RecordEmptyState
                title="No decisions recorded"
                description="Open a project to record a question, outcome, and rationale."
              />
            )}
            <ul className="cmd-record-list" aria-label="Knowledge decisions">
              {decisions.map((decision) => (
                <li key={decision.id}>
                  <DecisionCard {...decision} />
                  <p className="cmd-record-identity">
                    <a
                      href={`/projects/${encodeURIComponent(decision.projectId)}#decisions-heading`}
                    >
                      Open {decision.projectName} to revise
                    </a>
                  </p>
                </li>
              ))}
            </ul>
            {decisionsCursor && (
              <Button
                disabled={loadingMore !== null}
                onClick={() => loadMore("decisions")}
              >
                {loadingMore === "decisions"
                  ? "Loading..."
                  : "Load more decisions"}
              </Button>
            )}
          </section>
        </div>
      )}
    </AppShell>
  );
}
