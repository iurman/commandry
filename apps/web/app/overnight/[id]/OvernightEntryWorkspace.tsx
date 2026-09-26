"use client";

import { useEffect, useState } from "react";
import type {
  OvernightQueueAuditEvent,
  OvernightQueueEntry,
} from "@commandry/contracts";
import { AppShell, Button, OvernightQueueCard } from "@commandry/ui";
import { apiJson, pagePath, type PageResponse } from "../../projects/api";

export default function OvernightEntryWorkspace({
  entryId,
}: {
  entryId: string;
}) {
  const [entry, setEntry] = useState<OvernightQueueEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audit, setAudit] = useState<OvernightQueueAuditEvent[]>([]);
  const [auditCursor, setAuditCursor] = useState<string | null>(null);

  async function loadAudit(cursor?: string | null) {
    const page = await apiJson<PageResponse<OvernightQueueAuditEvent>>(
      pagePath(`/api/v1/overnight/${entryId}/audit`, cursor),
    );
    setAudit((current) =>
      cursor
        ? [
            ...current,
            ...page.items.filter(
              (item) => !current.some((saved) => saved.id === item.id),
            ),
          ]
        : page.items,
    );
    setAuditCursor(page.nextCursor);
  }

  useEffect(() => {
    let active = true;
    apiJson<OvernightQueueEntry>(`/api/v1/overnight/${entryId}`)
      .then((item) => {
        if (active) setEntry(item);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Overnight entry is unavailable.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    void apiJson<PageResponse<OvernightQueueAuditEvent>>(
      pagePath(`/api/v1/overnight/${entryId}/audit`),
    )
      .then((page) => {
        if (active) {
          setAudit(page.items);
          setAuditCursor(page.nextCursor);
        }
      })
      .catch(() => {
        if (active) setError("Overnight audit could not load.");
      });
    return () => {
      active = false;
    };
  }, [entryId]);

  async function refresh() {
    setBusy(true);
    setError(null);
    try {
      setEntry(
        await apiJson<OvernightQueueEntry>(`/api/v1/overnight/${entryId}`),
      );
      await loadAudit();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not refresh overnight entry.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      setEntry(
        await apiJson<OvernightQueueEntry>(
          `/api/v1/overnight/${entryId}/cancel`,
          { method: "POST" },
        ),
      );
      await loadAudit();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not cancel overnight entry.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell current="Overnight">
      <nav className="cmd-breadcrumb" aria-label="Breadcrumb">
        <a href="/overnight">Overnight Queue</a>
        <span aria-hidden="true">/</span>
        <span>Entry</span>
      </nav>
      <header className="cmd-page-header">
        <div>
          <p className="cmd-eyebrow">Synthetic local overnight queue</p>
          <h1>Overnight plan</h1>
          <p className="cmd-lead">
            This saved plan shows the exact packet, due time, dispatch decision,
            and linked fake run. Every outcome is unverified.
          </p>
        </div>
      </header>
      {loading && (
        <p className="cmd-inline-state" role="status">
          Loading overnight plan...
        </p>
      )}
      {error && (
        <p className="cmd-inline-state cmd-error" role="alert">
          {error}
        </p>
      )}
      {entry && (
        <section className="cmd-workspace-section" aria-label="Overnight plan">
          <OvernightQueueCard entry={entry} />
          <div className="cmd-form-actions">
            <Button disabled={busy} onClick={() => void refresh()}>
              {busy ? "Refreshing..." : "Refresh status"}
            </Button>
            {entry.state === "scheduled" && (
              <Button disabled={busy} onClick={() => void cancel()}>
                Cancel scheduled run
              </Button>
            )}
          </div>
        </section>
      )}
      {entry && (
        <section
          className="cmd-workspace-section"
          aria-labelledby="overnight-audit-heading"
        >
          <h2 id="overnight-audit-heading">Queue history</h2>
          <ul className="cmd-automation-list">
            {audit.map((event) => (
              <li key={event.id}>
                <p>
                  <strong>
                    {event.operation.replaceAll("overnight_queue.", "")}
                  </strong>{" "}
                  · {event.actor} ·{" "}
                  <time dateTime={event.createdAt}>{event.createdAt}</time>
                </p>
                {event.operation === "overnight_queue.blocked" && (
                  <p>{String(event.details.reason ?? "Readiness changed")}</p>
                )}
              </li>
            ))}
          </ul>
          {auditCursor && (
            <Button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await loadAudit(auditCursor);
                } catch (cause) {
                  setError(
                    cause instanceof Error
                      ? cause.message
                      : "Could not load queue history.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              Load more history
            </Button>
          )}
        </section>
      )}
    </AppShell>
  );
}
