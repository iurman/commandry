"use client";

import { useEffect, useState } from "react";
import type {
  WorkspaceDecision,
  WorkspaceKnowledgeItem,
} from "@commandry/contracts";
import {
  AppShell,
  Button,
  DecisionCard,
  KnowledgeLinkCard,
  RecordEmptyState,
} from "@commandry/ui";
import { apiJson, type PageResponse } from "../projects/api";

const notesPath = "/api/v1/knowledge-items";
const decisionsPath = "/api/v1/decisions";

function workspacePagePath(
  path: string,
  projectId: string | null,
  cursor?: string | null,
) {
  const params = new URLSearchParams({ limit: "20" });
  if (projectId) params.set("projectId", projectId);
  if (cursor) params.set("cursor", cursor);
  return `${path}?${params}`;
}

export default function KnowledgeWorkspace({
  projectId,
}: {
  projectId: string | null;
}) {
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
        workspacePagePath(notesPath, projectId),
      ),
      apiJson<PageResponse<WorkspaceDecision>>(
        workspacePagePath(decisionsPath, projectId),
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
  }, [projectId]);

  async function loadMore(kind: "notes" | "decisions") {
    const cursor = kind === "notes" ? notesCursor : decisionsCursor;
    if (!cursor || loadingMore) return;
    setLoadingMore(kind);
    setError(null);
    try {
      if (kind === "notes") {
        const page = await apiJson<PageResponse<WorkspaceKnowledgeItem>>(
          workspacePagePath(notesPath, projectId, cursor),
        );
        setNotes((current) => [...current, ...page.items]);
        setNotesCursor(page.nextCursor);
      } else {
        const page = await apiJson<PageResponse<WorkspaceDecision>>(
          workspacePagePath(decisionsPath, projectId, cursor),
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
            Read local notes, saved links, and decisions in project context.
            Notes and links retain their exact original capture; decisions
            retain their revisions.
          </p>
        </div>
        <a className="cmd-headline-mark" href="/inbox">
          Capture a note or link
        </a>
      </header>
      {projectId && (
        <p className="cmd-section-intro">
          Showing knowledge for{" "}
          <a href={`/projects/${encodeURIComponent(projectId)}`}>
            this project
          </a>
          . <a href="/knowledge">Show all projects</a>.
        </p>
      )}
      <p className="cmd-section-intro">
        <a
          href={
            projectId
              ? `/search?projectId=${encodeURIComponent(projectId)}`
              : "/search"
          }
        >
          Search across knowledge and source captures
        </a>
        . Record a new decision from its project workspace.
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
                <h2 id="notes-heading">Notes and links</h2>
              </div>
              <span className="cmd-count">{notes.length} shown</span>
            </div>
            {notes.length === 0 && !error && (
              <RecordEmptyState
                title="No notes or links yet"
                description="Capture text or a URL in the Inbox and file it as knowledge."
              />
            )}
            <ul
              className="cmd-record-list"
              aria-label="Knowledge notes and links"
            >
              {notes.map((note) => (
                <li key={note.id}>
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
                  ) : (
                    <article className="cmd-record-card">
                      <div className="cmd-record-topline">
                        <span className="cmd-record-kind">Local note</span>
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
