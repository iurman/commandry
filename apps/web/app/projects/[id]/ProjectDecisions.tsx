"use client";

import { useEffect, useState, type FormEvent } from "react";
import type {
  ProjectDecision,
  ProjectDecisionRevision,
} from "@commandry/contracts";
import { Button, DecisionCard, RecordEmptyState } from "@commandry/ui";
import { apiJson, pagePath, type PageResponse } from "../api";

type Fields = Pick<
  ProjectDecision,
  "question" | "outcome" | "alternatives" | "rationale" | "status"
>;

const emptyFields: Fields = {
  question: "",
  outcome: "",
  alternatives: "",
  rationale: "",
  status: "proposed",
};

export default function ProjectDecisions({ projectId }: { projectId: string }) {
  const path = `/api/v1/projects/${encodeURIComponent(projectId)}/decisions`;
  const [items, setItems] = useState<ProjectDecision[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [fields, setFields] = useState<Fields>(emptyFields);
  const [editing, setEditing] = useState<ProjectDecision | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [history, setHistory] = useState<ProjectDecisionRevision[]>([]);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiJson<PageResponse<ProjectDecision>>(pagePath(path))
      .then((page) => {
        if (!active) return;
        setItems(page.items);
        setCursor(page.nextCursor);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Decisions are unavailable.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path]);

  function update<K extends keyof Fields>(key: K, value: Fields[K]) {
    setFields((current) => ({ ...current, [key]: value }));
  }

  function edit(item: ProjectDecision) {
    setEditing(item);
    setFields({
      question: item.question,
      outcome: item.outcome,
      alternatives: item.alternatives,
      rationale: item.rationale,
      status: item.status,
    });
    setFeedback(null);
    setError(null);
    document
      .getElementById("decision-form-heading")
      ?.scrollIntoView({ behavior: "smooth" });
  }

  function reset() {
    setEditing(null);
    setFields(emptyFields);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const saved = editing
        ? await apiJson<ProjectDecision>(`/api/v1/decisions/${editing.id}`, {
            method: "PUT",
            body: JSON.stringify({
              ...fields,
              expectedRevision: editing.revision,
            }),
          })
        : await apiJson<ProjectDecision>(path, {
            method: "POST",
            body: JSON.stringify(fields),
          });
      setItems((current) =>
        editing
          ? current.map((item) => (item.id === saved.id ? saved : item))
          : [...current, saved].sort((a, b) => a.id.localeCompare(b.id)),
      );
      setFeedback(
        `Decision revision ${saved.revision} saved. Refresh the project brief to include it.`,
      );
      if (historyId === saved.id) setHistoryId(null);
      reset();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save decision.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function loadMore() {
    if (!cursor || busy) return;
    setBusy(true);
    setError(null);
    try {
      const page = await apiJson<PageResponse<ProjectDecision>>(
        pagePath(path, cursor),
      );
      setItems((current) => [
        ...current,
        ...page.items.filter(
          (item) => !current.some((saved) => saved.id === item.id),
        ),
      ]);
      setCursor(page.nextCursor);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load more decisions.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function openHistory(id: string, nextCursor?: string) {
    setBusy(true);
    setError(null);
    try {
      const page = await apiJson<PageResponse<ProjectDecisionRevision>>(
        pagePath(`/api/v1/decisions/${id}/revisions`, nextCursor),
      );
      setHistoryId(id);
      setHistory((current) =>
        nextCursor ? [...current, ...page.items] : page.items,
      );
      setHistoryCursor(page.nextCursor);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load decision history.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="cmd-workspace-section cmd-decision-section"
      aria-labelledby="decisions-heading"
    >
      <div className="cmd-section-heading">
        <div>
          <p className="cmd-eyebrow">Project memory / manual</p>
          <h2 id="decisions-heading">Decisions</h2>
        </div>
        <span className="cmd-count">{items.length} shown</span>
      </div>
      <p className="cmd-section-intro">
        Record a question, outcome, alternatives and rationale. Each revision
        remains in local history. These records are user-authored, not AI
        findings.
      </p>
      {loading && (
        <p className="cmd-inline-state" role="status">
          Loading decisions...
        </p>
      )}
      {error && (
        <p className="cmd-inline-state cmd-error" role="alert">
          {error}
        </p>
      )}
      {!loading && items.length === 0 && !error && (
        <RecordEmptyState
          title="No decisions recorded"
          description="Add one to make the project brief more useful."
        />
      )}
      <ul className="cmd-decision-list" aria-label="Project decisions">
        {items.map((item) => (
          <li key={item.id}>
            <DecisionCard
              {...item}
              historyOpen={historyId === item.id}
              onHistory={() =>
                historyId === item.id
                  ? setHistoryId(null)
                  : openHistory(item.id)
              }
              onRevise={() => edit(item)}
            >
              {historyId === item.id && (
                <div className="cmd-decision-history">
                  <h4>Recorded revisions</h4>
                  <ol>
                    {history.map((revision) => (
                      <li key={revision.id}>
                        <strong>
                          Revision {revision.revision}: {revision.status}
                        </strong>
                        <p>{revision.outcome}</p>
                        <small>
                          {revision.actor} ·{" "}
                          <time dateTime={revision.createdAt}>
                            {revision.createdAt}
                          </time>
                        </small>
                      </li>
                    ))}
                  </ol>
                  {historyCursor && (
                    <Button
                      disabled={busy}
                      onClick={() => openHistory(item.id, historyCursor)}
                    >
                      Load older revisions
                    </Button>
                  )}
                </div>
              )}
            </DecisionCard>
          </li>
        ))}
      </ul>
      {cursor && (
        <Button disabled={busy} onClick={loadMore}>
          Load more decisions
        </Button>
      )}
      <div className="cmd-create-panel cmd-decision-form-panel">
        <h3 id="decision-form-heading">
          {editing
            ? `Revise decision ${editing.revision}`
            : "Record a decision"}
        </h3>
        <form className="cmd-form" onSubmit={save}>
          <label htmlFor="decision-question">Question or context</label>
          <input
            id="decision-question"
            maxLength={500}
            onChange={(event) => update("question", event.target.value)}
            required
            value={fields.question}
          />
          <label htmlFor="decision-outcome">Chosen outcome</label>
          <textarea
            id="decision-outcome"
            maxLength={5000}
            onChange={(event) => update("outcome", event.target.value)}
            required
            rows={3}
            value={fields.outcome}
          />
          <label htmlFor="decision-alternatives">
            Alternatives considered{" "}
            <span className="cmd-optional">Optional</span>
          </label>
          <textarea
            id="decision-alternatives"
            maxLength={5000}
            onChange={(event) => update("alternatives", event.target.value)}
            rows={2}
            value={fields.alternatives}
          />
          <label htmlFor="decision-rationale">Rationale and consequences</label>
          <textarea
            id="decision-rationale"
            maxLength={5000}
            onChange={(event) => update("rationale", event.target.value)}
            required
            rows={3}
            value={fields.rationale}
          />
          <label htmlFor="decision-status">Decision status</label>
          <select
            id="decision-status"
            onChange={(event) =>
              update("status", event.target.value as Fields["status"])
            }
            value={fields.status}
          >
            {editing?.status !== "accepted" && (
              <option value="proposed">Proposed</option>
            )}
            <option value="accepted">Accepted</option>
            {editing && <option value="superseded">Superseded</option>}
          </select>
          {feedback && (
            <p className="cmd-form-success" role="status">
              {feedback}
            </p>
          )}
          <div className="cmd-decision-actions">
            <Button disabled={busy} type="submit" variant="primary">
              {busy
                ? "Saving..."
                : editing
                  ? "Save revision"
                  : "Record decision"}
            </Button>
            {editing && (
              <Button disabled={busy} onClick={reset} type="button">
                Cancel revision
              </Button>
            )}
          </div>
        </form>
      </div>
    </section>
  );
}
