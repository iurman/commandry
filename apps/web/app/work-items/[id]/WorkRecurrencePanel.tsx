"use client";

import { useEffect, useState, type FormEvent } from "react";
import type {
  WorkRecurrenceAuditEvent,
  WorkRecurrenceDefinition,
  WorkRecurrenceOccurrence,
} from "@commandry/contracts";
import { Button, WorkRecurrenceCard } from "@commandry/ui";
import { apiJson, pagePath, type PageResponse } from "../../projects/api";

function utcInput(iso: string) {
  return iso.slice(0, 16);
}

export default function WorkRecurrencePanel({
  workItemId,
}: {
  workItemId: string;
}) {
  const [definition, setDefinition] = useState<WorkRecurrenceDefinition | null>(
    null,
  );
  const [startDraft, setStartDraft] = useState("");
  const [everyDraft, setEveryDraft] = useState("1440");
  const [enabledDraft, setEnabledDraft] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [occurrences, setOccurrences] = useState<WorkRecurrenceOccurrence[]>(
    [],
  );
  const [occurrenceCursor, setOccurrenceCursor] = useState<string | null>(null);
  const [occurrencesLoading, setOccurrencesLoading] = useState(false);
  const [audit, setAudit] = useState<WorkRecurrenceAuditEvent[]>([]);
  const [auditCursor, setAuditCursor] = useState<string | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const recurrencePath = `/api/v1/work-items/${encodeURIComponent(workItemId)}/recurrence`;
  const occurrencePath = `${recurrencePath}/occurrences`;
  const auditPath = `${recurrencePath}/audit`;

  async function refreshHistory() {
    const [current, occurrencePage, auditPage] = await Promise.all([
      apiJson<{ definition: WorkRecurrenceDefinition | null }>(recurrencePath),
      apiJson<PageResponse<WorkRecurrenceOccurrence>>(pagePath(occurrencePath)),
      apiJson<PageResponse<WorkRecurrenceAuditEvent>>(pagePath(auditPath)),
    ]);
    setDefinition(current.definition);
    setOccurrences(occurrencePage.items);
    setOccurrenceCursor(occurrencePage.nextCursor);
    setAudit(auditPage.items);
    setAuditCursor(auditPage.nextCursor);
    setHistoryError(null);
  }

  useEffect(() => {
    let active = true;
    Promise.all([
      apiJson<{ definition: WorkRecurrenceDefinition | null }>(recurrencePath),
      apiJson<PageResponse<WorkRecurrenceOccurrence>>(pagePath(occurrencePath)),
      apiJson<PageResponse<WorkRecurrenceAuditEvent>>(pagePath(auditPath)),
    ])
      .then(([current, occurrencePage, auditPage]) => {
        if (!active) return;
        setDefinition(current.definition);
        if (current.definition) {
          setStartDraft(utcInput(current.definition.startAt));
          setEveryDraft(String(current.definition.everyMinutes));
          setEnabledDraft(current.definition.enabled);
        }
        setOccurrences(occurrencePage.items);
        setOccurrenceCursor(occurrencePage.nextCursor);
        setAudit(auditPage.items);
        setAuditCursor(auditPage.nextCursor);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Recurring Work is unavailable.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [recurrencePath, occurrencePath, auditPath]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !startDraft) return;
    setSaving(true);
    setError(null);
    setFeedback(null);
    try {
      const input = {
        startAt:
          definition && startDraft === utcInput(definition.startAt)
            ? definition.startAt
            : new Date(`${startDraft}:00Z`).toISOString(),
        everyMinutes: Number(everyDraft),
      };
      const updated = await apiJson<WorkRecurrenceDefinition>(recurrencePath, {
        method: definition ? "PUT" : "POST",
        body: JSON.stringify(
          definition
            ? {
                ...input,
                enabled: enabledDraft,
                expectedUpdatedAt: definition.updatedAt,
              }
            : input,
        ),
      });
      setDefinition(updated);
      setStartDraft(utcInput(updated.startAt));
      setEveryDraft(String(updated.everyMinutes));
      setEnabledDraft(updated.enabled);
      setFeedback(
        definition
          ? "Local recurring Work updated. Existing occurrences remain in history."
          : "Local recurring Work scheduled. The worker will create task occurrences after their due time.",
      );
      try {
        await refreshHistory();
      } catch (cause) {
        setHistoryError(
          cause instanceof Error
            ? cause.message
            : "Schedule saved, but history could not be refreshed.",
        );
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save recurring Work.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function loadMoreOccurrences() {
    if (!occurrenceCursor || occurrencesLoading) return;
    setOccurrencesLoading(true);
    setHistoryError(null);
    try {
      const page = await apiJson<PageResponse<WorkRecurrenceOccurrence>>(
        pagePath(occurrencePath, occurrenceCursor),
      );
      setOccurrences((current) => [...current, ...page.items]);
      setOccurrenceCursor(page.nextCursor);
    } catch (cause) {
      setHistoryError(
        cause instanceof Error ? cause.message : "Could not load occurrences.",
      );
    } finally {
      setOccurrencesLoading(false);
    }
  }

  async function loadMoreAudit() {
    if (!auditCursor || auditLoading) return;
    setAuditLoading(true);
    setHistoryError(null);
    try {
      const page = await apiJson<PageResponse<WorkRecurrenceAuditEvent>>(
        pagePath(auditPath, auditCursor),
      );
      setAudit((current) => [...current, ...page.items]);
      setAuditCursor(page.nextCursor);
    } catch (cause) {
      setHistoryError(
        cause instanceof Error ? cause.message : "Could not load audit.",
      );
    } finally {
      setAuditLoading(false);
    }
  }

  const unchanged =
    definition &&
    startDraft === utcInput(definition.startAt) &&
    everyDraft === String(definition.everyMinutes) &&
    enabledDraft === definition.enabled;

  return (
    <section
      className="cmd-detail-document"
      aria-labelledby="work-recurrence-heading"
    >
      <p className="cmd-eyebrow">Local recurring Work / Worker generated</p>
      <h2 id="work-recurrence-heading">Recurrence</h2>
      <p>
        Create future task occurrences from this original task. Each generated
        task links to the same preserved capture and starts unassigned. No agent
        run or external action starts automatically. After downtime, only the
        latest due slot is queued; skipped slots appear in the audit.
      </p>
      {loading && <p role="status">Loading recurring Work...</p>}
      {!loading && (
        <>
          {definition && (
            <p>
              Current state:{" "}
              <strong>{definition.enabled ? "enabled" : "paused"}</strong>. Next
              scheduled slot:{" "}
              <time dateTime={definition.nextOccurrenceAt}>
                {definition.nextOccurrenceAt}
              </time>{" "}
              UTC.
            </p>
          )}
          <form className="cmd-form" onSubmit={save}>
            <label htmlFor="work-recurrence-start">Start at (UTC)</label>
            <input
              id="work-recurrence-start"
              type="datetime-local"
              required
              value={startDraft}
              onChange={(event) => setStartDraft(event.target.value)}
            />
            <label htmlFor="work-recurrence-interval">
              Repeat every (minutes)
            </label>
            <input
              id="work-recurrence-interval"
              type="number"
              min={5}
              max={10080}
              step={1}
              required
              value={everyDraft}
              onChange={(event) => setEveryDraft(event.target.value)}
            />
            {definition && (
              <label>
                <input
                  type="checkbox"
                  checked={enabledDraft}
                  onChange={(event) => setEnabledDraft(event.target.checked)}
                />{" "}
                Enabled
              </label>
            )}
            <Button type="submit" disabled={saving || Boolean(unchanged)}>
              {saving
                ? "Saving recurrence..."
                : definition
                  ? "Save recurrence"
                  : "Create recurrence"}
            </Button>
          </form>
          {feedback && (
            <p className="cmd-form-success" role="status">
              {feedback}
            </p>
          )}
          {error && (
            <p className="cmd-inline-state cmd-error" role="alert">
              {error}
            </p>
          )}
          {definition && (
            <>
              <div className="cmd-section-heading">
                <h3>Task occurrences</h3>
                <Button
                  onClick={() => {
                    void refreshHistory().catch((cause: unknown) =>
                      setHistoryError(
                        cause instanceof Error
                          ? cause.message
                          : "Could not refresh recurrence history.",
                      ),
                    );
                  }}
                >
                  Refresh history
                </Button>
              </div>
              {occurrences.length === 0 && <p>No task occurrences yet.</p>}
              {occurrences.length > 0 && (
                <ul
                  className="cmd-record-list"
                  aria-label="Recurring task occurrences"
                >
                  {occurrences.map((occurrence) => (
                    <li key={occurrence.id}>
                      <WorkRecurrenceCard occurrence={occurrence} />
                    </li>
                  ))}
                </ul>
              )}
              {occurrenceCursor && (
                <Button
                  disabled={occurrencesLoading}
                  onClick={loadMoreOccurrences}
                >
                  {occurrencesLoading ? "Loading..." : "Load older occurrences"}
                </Button>
              )}
              <h3>Recurrence audit</h3>
              <ol>
                {audit.map((entry) => (
                  <li key={entry.id}>
                    {entry.operation} by {entry.actor} at{" "}
                    <time dateTime={entry.createdAt}>{entry.createdAt}</time>
                    {typeof entry.details.count === "number"
                      ? ` (${entry.details.count} older slots skipped)`
                      : ""}
                  </li>
                ))}
              </ol>
              {auditCursor && (
                <Button disabled={auditLoading} onClick={loadMoreAudit}>
                  {auditLoading ? "Loading..." : "Load older recurrence audit"}
                </Button>
              )}
              {historyError && (
                <p className="cmd-inline-state cmd-error" role="alert">
                  {historyError}
                </p>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
