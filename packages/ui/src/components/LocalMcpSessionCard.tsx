export interface LocalMcpSessionCardView {
  id: string;
  packetId: string;
  packetVersion: number;
  projectId: string;
  workItemId: string;
  agentId: string;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
}

export function LocalMcpSessionCard({
  session,
}: {
  session: LocalMcpSessionCardView;
}) {
  const state = session.revokedAt ? "Revoked" : "Time-limited";
  return (
    <article className="cmd-automation-card">
      <div className="cmd-section-heading">
        <div>
          <p className="cmd-eyebrow">Local read-only MCP preview</p>
          <h3>
            <a href={`/mcp-sessions/${session.id}`}>
              Packet v{session.packetVersion} read session
            </a>
          </h3>
        </div>
        <span className="cmd-count">{state}</span>
      </div>
      <dl className="cmd-automation-facts">
        <div>
          <dt>Scope</dt>
          <dd>
            <a href={`/projects/${session.projectId}`}>One project</a> ·{" "}
            <a href={`/work-items/${session.workItemId}`}>One work item</a>
          </dd>
        </div>
        <div>
          <dt>Saved packet</dt>
          <dd>
            <a href={`/execution-packets/${session.packetId}`}>
              Review packet v{session.packetVersion}
            </a>
          </dd>
        </div>
        <div>
          <dt>Expiry</dt>
          <dd>
            <time dateTime={session.expiresAt}>
              {new Date(session.expiresAt).toLocaleString()}
            </time>
          </dd>
        </div>
        <div>
          <dt>Tools</dt>
          <dd>Project brief read · Packet work read</dd>
        </div>
      </dl>
      <p className="cmd-form-hint">
        Bearer token shown once at creation. Every tool call is scoped and
        audited. No external action.
      </p>
    </article>
  );
}
