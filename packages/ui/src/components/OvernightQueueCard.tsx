export interface OvernightQueueCardView {
  id: string;
  packetId: string;
  packetVersion: number;
  projectId: string;
  projectName: string;
  workItemId: string;
  workTitle: string;
  agentName: string;
  runAfter: string;
  state: "scheduled" | "dispatching" | "dispatched" | "blocked" | "canceled";
  runId: string | null;
  runState: string | null;
  blockedReason: string | null;
}

export function OvernightQueueCard({
  entry,
  action,
}: {
  entry: OvernightQueueCardView;
  action?: React.ReactNode;
}) {
  return (
    <article className="cmd-automation-card">
      <div className="cmd-section-heading">
        <div>
          <p className="cmd-eyebrow">Synthetic local overnight queue</p>
          <h3>
            <a href={`/work-items/${entry.workItemId}`}>{entry.workTitle}</a>
          </h3>
        </div>
        <span className="cmd-count">{entry.state}</span>
      </div>
      <dl className="cmd-automation-facts">
        <div>
          <dt>Project</dt>
          <dd>
            <a href={`/projects/${entry.projectId}`}>{entry.projectName}</a>
          </dd>
        </div>
        <div>
          <dt>Agent</dt>
          <dd>{entry.agentName} / local fake runtime</dd>
        </div>
        <div>
          <dt>Saved evidence</dt>
          <dd>
            <a href={`/execution-packets/${entry.packetId}`}>
              Packet v{entry.packetVersion}
            </a>
          </dd>
        </div>
        <div>
          <dt>Due</dt>
          <dd>
            <time dateTime={entry.runAfter}>
              {new Date(entry.runAfter).toLocaleString()}
            </time>
          </dd>
        </div>
        <div>
          <dt>Worker result</dt>
          <dd>
            {entry.runId ? (
              <a href={`/agent-runs/${entry.runId}`}>
                Review {entry.runState ?? "run"}
              </a>
            ) : (
              "No run yet"
            )}
          </dd>
        </div>
      </dl>
      {entry.blockedReason && (
        <p className="cmd-form-error">Blocked: {entry.blockedReason}</p>
      )}
      <p>
        <a href={`/overnight/${entry.id}`}>Open saved overnight plan</a>
      </p>
      {action}
      <p className="cmd-form-hint">
        Read-only simulation. Unverified result; no external action.
      </p>
    </article>
  );
}
