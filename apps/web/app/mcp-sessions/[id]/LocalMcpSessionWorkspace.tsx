"use client";

import { useEffect, useState } from "react";
import type { LocalMcpAuditEvent, LocalMcpSession } from "@commandry/contracts";
import { AppShell, Button, LocalMcpSessionCard } from "@commandry/ui";
import { apiJson, pagePath, type PageResponse } from "../../projects/api";

export default function LocalMcpSessionWorkspace({
  sessionId,
}: {
  sessionId: string;
}) {
  const [session, setSession] = useState<LocalMcpSession | null>(null);
  const [audit, setAudit] = useState<LocalMcpAuditEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadAudit(nextCursor?: string | null) {
    const page = await apiJson<PageResponse<LocalMcpAuditEvent>>(
      pagePath(`/api/v1/mcp-sessions/${sessionId}/audit`, nextCursor),
    );
    setAudit((current) =>
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
  }

  useEffect(() => {
    let active = true;
    Promise.all([
      apiJson<LocalMcpSession>(`/api/v1/mcp-sessions/${sessionId}`),
      apiJson<PageResponse<LocalMcpAuditEvent>>(
        pagePath(`/api/v1/mcp-sessions/${sessionId}/audit`),
      ),
    ])
      .then(([record, history]) => {
        if (active) {
          setSession(record);
          setAudit(history.items);
          setCursor(history.nextCursor);
        }
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Local MCP session is unavailable.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [sessionId]);

  async function refresh() {
    setBusy(true);
    setError(null);
    try {
      setSession(
        await apiJson<LocalMcpSession>(`/api/v1/mcp-sessions/${sessionId}`),
      );
      await loadAudit();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not refresh local MCP session.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setBusy(true);
    setError(null);
    try {
      setSession(
        await apiJson<LocalMcpSession>(
          `/api/v1/mcp-sessions/${sessionId}/revoke`,
          { method: "POST" },
        ),
      );
      await loadAudit();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not revoke local MCP session.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell current="Agents">
      <nav className="cmd-breadcrumb" aria-label="Breadcrumb">
        <a href="/agents">Agents</a>
        <span aria-hidden="true">/</span>
        {session && (
          <a href={`/execution-packets/${session.packetId}`}>
            Execution packet
          </a>
        )}
        {session && <span aria-hidden="true">/</span>}
        <span>MCP read session</span>
      </nav>
      <header className="cmd-page-header">
        <div>
          <p className="cmd-eyebrow">Local read-only MCP preview</p>
          <h1>Scoped read session</h1>
          <p className="cmd-lead">
            The bearer token was shown once at creation and is never returned
            here. Project brief and packet work reads are scoped, expire, and
            leave audit evidence. The MCP endpoint is loopback-only.
          </p>
        </div>
      </header>
      {loading && (
        <p className="cmd-inline-state" role="status">
          Loading local MCP session...
        </p>
      )}
      {error && (
        <p className="cmd-inline-state cmd-error" role="alert">
          {error}
        </p>
      )}
      {session && (
        <section
          className="cmd-workspace-section"
          aria-label="MCP session scope"
        >
          <LocalMcpSessionCard session={session} />
          <div className="cmd-form-actions">
            <Button disabled={busy} onClick={() => void refresh()}>
              {busy ? "Refreshing..." : "Refresh session"}
            </Button>
            {!session.revokedAt && (
              <Button disabled={busy} onClick={() => void revoke()}>
                Revoke read session
              </Button>
            )}
          </div>
        </section>
      )}
      {session && (
        <section
          className="cmd-workspace-section"
          aria-labelledby="mcp-audit-heading"
        >
          <h2 id="mcp-audit-heading">Read audit</h2>
          {audit.length === 0 && (
            <p className="cmd-form-hint">
              No MCP tool call has been recorded yet.
            </p>
          )}
          <ul className="cmd-automation-list">
            {audit.map((event) => (
              <li key={event.id}>
                <p>
                  <strong>{event.operation}</strong> · {event.decision} ·{" "}
                  {event.code}
                </p>
                <p className="cmd-form-hint">
                  {event.actor} ·{" "}
                  <time dateTime={event.createdAt}>{event.createdAt}</time>
                </p>
              </li>
            ))}
          </ul>
          {cursor && (
            <Button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await loadAudit(cursor);
                } catch (cause) {
                  setError(
                    cause instanceof Error
                      ? cause.message
                      : "Could not load audit history.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              Load more audit events
            </Button>
          )}
        </section>
      )}
    </AppShell>
  );
}
