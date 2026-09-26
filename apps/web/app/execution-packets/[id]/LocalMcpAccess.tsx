"use client";

import { useEffect, useState, type FormEvent } from "react";
import type {
  CreatedLocalMcpSession,
  ExecutionPacket,
  LocalMcpSession,
} from "@commandry/contracts";
import { Button, LocalMcpSessionCard } from "@commandry/ui";
import { apiJson, type PageResponse } from "../../projects/api";

function sessionPath(packetId: string, cursor?: string | null) {
  const query = new URLSearchParams({ packetId, limit: "20" });
  if (cursor) query.set("cursor", cursor);
  return `/api/v1/mcp-sessions?${query}`;
}

export default function LocalMcpAccess({
  packet,
  agentId,
}: {
  packet: ExecutionPacket;
  agentId: string;
}) {
  const [sessions, setSessions] = useState<LocalMcpSession[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedLocalMcpSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiJson<PageResponse<LocalMcpSession>>(sessionPath(packet.id))
      .then((page) => {
        if (active) {
          setSessions(page.items);
          setCursor(page.nextCursor);
        }
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load local MCP sessions.",
          );
      });
    return () => {
      active = false;
    };
  }, [packet.id]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!agentId || busy) return;
    setBusy(true);
    setError(null);
    setCreated(null);
    try {
      const session = await apiJson<CreatedLocalMcpSession>(
        "/api/v1/mcp-sessions",
        {
          method: "POST",
          body: JSON.stringify({ packetId: packet.id, agentId }),
        },
      );
      setCreated(session);
      setSessions((current) => [session, ...current]);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not create local MCP read session.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function more() {
    if (!cursor || busy) return;
    setBusy(true);
    setError(null);
    try {
      const page = await apiJson<PageResponse<LocalMcpSession>>(
        sessionPath(packet.id, cursor),
      );
      setSessions((current) => [
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
          : "Could not load more local MCP sessions.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="cmd-local-run-assignment"
      aria-labelledby="local-mcp-heading"
    >
      <p className="cmd-eyebrow">Agent interface / Local read-only preview</p>
      <h2 id="local-mcp-heading">Open scoped MCP reads</h2>
      <p className="cmd-section-intro">
        Create a short-lived bearer session for this saved packet and the
        eligible agent selected above. An MCP client on this laptop can read
        only the project brief and this packet&apos;s work item. Each tool call
        records an audit event. The local review gate is not product sign-in.
      </p>
      <form className="cmd-form" onSubmit={(event) => void create(event)}>
        <Button type="submit" variant="primary" disabled={!agentId || busy}>
          {busy ? "Creating..." : "Create local MCP read session"}
        </Button>
      </form>
      {!agentId && (
        <p className="cmd-form-hint">
          Choose an eligible project-scoped agent above first.
        </p>
      )}
      {error && (
        <p className="cmd-form-error" role="alert">
          {error}
        </p>
      )}
      {created && (
        <div className="cmd-workspace-section" role="status">
          <h3>Token shown once</h3>
          <p>
            Use an MCP HTTP client on this laptop with endpoint{" "}
            <code>http://127.0.0.1:3010/mcp</code> and header{" "}
            <code>Authorization: Bearer</code> followed by this token. It
            expires at{" "}
            <time dateTime={created.expiresAt}>
              {new Date(created.expiresAt).toLocaleString()}
            </time>
            . Save it locally now; the API will not return it again.
          </p>
          <label htmlFor="mcp-one-time-token">One-time local MCP token</label>
          <input
            id="mcp-one-time-token"
            readOnly
            value={created.token}
            onFocus={(event) => event.currentTarget.select()}
          />
          <p>
            <a href={`/mcp-sessions/${created.id}`}>
              Review session scope and audit
            </a>
          </p>
        </div>
      )}
      <h3>Packet read sessions</h3>
      {sessions.length === 0 && (
        <p className="cmd-form-hint">
          No local MCP read session has been created for this packet.
        </p>
      )}
      <ul className="cmd-automation-list" aria-label="Packet MCP read sessions">
        {sessions.map((session) => (
          <li key={session.id}>
            <LocalMcpSessionCard session={session} />
          </li>
        ))}
      </ul>
      {cursor && (
        <Button disabled={busy} onClick={() => void more()}>
          Load more read sessions
        </Button>
      )}
    </section>
  );
}
