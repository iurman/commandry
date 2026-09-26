import type { ReactNode } from "react";

export interface LocalRunEvidenceView {
  kind: string;
  id: string;
  href: string;
  recordedAt: string;
  occurredAt: string | null;
  sourceLabel: string;
  isSynthetic: boolean;
}

export interface LocalAgentRunView {
  id: string;
  occurrenceId: string;
  agentId: string;
  packetId: string;
  packetVersion: number;
  packetDigest: string;
  workItemId: string;
  projectId: string;
  state: "queued" | "running" | "succeeded" | "failed";
  attempts: number;
  attemptHistory: {
    id: string;
    number: number;
    state: "running" | "succeeded" | "failed";
    error: string | null;
    startedAt: string;
    completedAt: string | null;
  }[];
  grant: {
    projectId: string;
    operations: string[];
    expiresAt: string;
  };
  result: {
    summary: string;
    contextReadIds: string[];
    evidence: LocalRunEvidenceView[];
    runtime: "local-fake-v1";
    isSynthetic: true;
    verificationStatus: "unverified";
    externalActions: string[];
  } | null;
  error: string | null;
  verificationStatus: "unverified";
  runtime: "local-fake-v1";
  sourceLabel: string;
  isSynthetic: true;
  externalActions: string[];
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface LocalAgentAuditView {
  id: string;
  runId: string;
  actor: string;
  operation: string;
  projectId: string | null;
  decision: "allowed" | "denied" | null;
  code: string | null;
  reason: string | null;
  createdAt: string;
}

export interface LocalAgentReadView {
  runId: string;
  projectId: string;
  operation: string;
  readAt: string;
  sensitivity: string;
  isSynthetic: true;
  source: {
    kind: string;
    id: string;
    title: string;
    summary: string;
    href: string;
    recordedAt: string;
    sourceLabel: string;
    isSynthetic: boolean;
    evidence: LocalRunEvidenceView[];
  };
  auditId: string;
}

function Evidence({ source }: { source: LocalRunEvidenceView }) {
  return (
    <li>
      <a href={source.href}>View {source.kind.replaceAll("_", " ")} source</a>
      <span>
        {source.isSynthetic ? "Synthetic / " : ""}
        {source.sourceLabel}
      </span>
      <time dateTime={source.recordedAt}>Recorded {source.recordedAt}</time>
    </li>
  );
}

export function LocalAgentRunPanel({
  run,
  agentName,
}: {
  run: LocalAgentRunView;
  agentName?: string;
}) {
  return (
    <article className="cmd-local-run" aria-label="Fake local run">
      <div className="cmd-local-run-head">
        <div>
          <p className="cmd-eyebrow">Synthetic local execution</p>
          <h1>Fake local run</h1>
          <p className="cmd-lead">
            {agentName ?? run.agentId} / Packet version {run.packetVersion}
          </p>
        </div>
        <span className="cmd-local-run-state" data-state={run.state}>
          {run.state}
        </span>
      </div>
      <p className="cmd-local-run-warning">
        This is a synthetic, unverified result. The local worker can read only
        the granted project context. It performs no external action and does not
        complete the work item.
      </p>
      <div className="cmd-local-run-grid">
        <section aria-labelledby="run-identity-heading">
          <h2 id="run-identity-heading">Run identity</h2>
          <dl className="cmd-local-run-facts">
            <div>
              <dt>Run ID</dt>
              <dd>
                <code>{run.id}</code>
              </dd>
            </div>
            <div>
              <dt>Occurrence</dt>
              <dd>
                <code>{run.occurrenceId}</code>
              </dd>
            </div>
            <div>
              <dt>Attempts</dt>
              <dd>{run.attempts}</dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>
                <time dateTime={run.createdAt}>{run.createdAt}</time>
              </dd>
            </div>
            <div>
              <dt>Started</dt>
              <dd>
                {run.startedAt ? (
                  <time dateTime={run.startedAt}>{run.startedAt}</time>
                ) : (
                  "Not started"
                )}
              </dd>
            </div>
            <div>
              <dt>Completed</dt>
              <dd>
                {run.completedAt ? (
                  <time dateTime={run.completedAt}>{run.completedAt}</time>
                ) : (
                  "Not completed"
                )}
              </dd>
            </div>
          </dl>
        </section>
        <section aria-labelledby="run-grant-heading">
          <h2 id="run-grant-heading">Run-specific read grant</h2>
          <dl className="cmd-local-run-facts">
            <div>
              <dt>Project</dt>
              <dd>
                <a
                  href={`/projects/${encodeURIComponent(run.grant.projectId)}`}
                >
                  {run.grant.projectId}
                </a>
              </dd>
            </div>
            <div>
              <dt>Operations</dt>
              <dd>{run.grant.operations.join(", ")}</dd>
            </div>
            <div>
              <dt>Expires</dt>
              <dd>
                <time dateTime={run.grant.expiresAt}>
                  {run.grant.expiresAt}
                </time>
              </dd>
            </div>
            <div>
              <dt>Actions</dt>
              <dd>None authorized</dd>
            </div>
          </dl>
        </section>
      </div>
      <section
        className="cmd-local-run-attempts"
        aria-labelledby="run-attempts-heading"
      >
        <h2 id="run-attempts-heading">Attempts</h2>
        {run.attemptHistory.length === 0 ? (
          <p>No worker attempt has started yet.</p>
        ) : (
          <ol>
            {run.attemptHistory.map((attempt) => (
              <li key={attempt.id}>
                <strong>
                  Attempt {attempt.number}: {attempt.state}
                </strong>
                {attempt.error && <p>{attempt.error}</p>}
                <p>Started: {attempt.startedAt ?? "Pending"}</p>
                <p>Completed: {attempt.completedAt ?? "Pending"}</p>
              </li>
            ))}
          </ol>
        )}
      </section>
      <section
        className="cmd-local-run-result"
        aria-labelledby="run-result-heading"
      >
        <div className="cmd-section-heading">
          <div>
            <p className="cmd-eyebrow">Worker outcome / {run.runtime}</p>
            <h2 id="run-result-heading">Result</h2>
          </div>
          <span className="cmd-local-run-verify">Unverified</span>
        </div>
        {run.error && (
          <p className="cmd-form-error" role="alert">
            {run.error}
          </p>
        )}
        {run.result ? (
          <>
            <p>{run.result.summary}</p>
            <p className="cmd-local-run-disclosure">
              No external actions were taken. This output is deterministic local
              simulation, not verified task completion.
            </p>
            {run.result.evidence.length > 0 && (
              <ul className="cmd-local-run-evidence">
                {run.result.evidence.map((source) => (
                  <Evidence
                    key={`${source.kind}:${source.id}`}
                    source={source}
                  />
                ))}
              </ul>
            )}
          </>
        ) : !run.error ? (
          <p>Worker result pending. Refresh to see its cited outcome.</p>
        ) : null}
      </section>
      <p className="cmd-local-run-packet-link">
        <a href={`/execution-packets/${encodeURIComponent(run.packetId)}`}>
          Review immutable packet version {run.packetVersion}
        </a>
        <span>
          Digest: <code>{run.packetDigest}</code>
        </span>
      </p>
    </article>
  );
}

export function LocalAgentReadReceipt({ read }: { read: LocalAgentReadView }) {
  return (
    <article
      className="cmd-local-read-receipt"
      aria-label="Scoped context read"
    >
      <p className="cmd-eyebrow">Allowed scoped read / audited</p>
      <h3>{read.source.title}</h3>
      <p>{read.source.summary}</p>
      <dl className="cmd-local-run-facts">
        <div>
          <dt>Operation</dt>
          <dd>{read.operation}</dd>
        </div>
        <div>
          <dt>Sensitivity</dt>
          <dd>{read.sensitivity}</dd>
        </div>
        <div>
          <dt>Read at</dt>
          <dd>
            <time dateTime={read.readAt}>{read.readAt}</time>
          </dd>
        </div>
        <div>
          <dt>Audit ID</dt>
          <dd>
            <code>{read.auditId}</code>
          </dd>
        </div>
      </dl>
      <a href={read.source.href}>
        View {read.source.kind.replaceAll("_", " ")} source
      </a>
      <p className="cmd-local-run-disclosure">
        {read.source.isSynthetic ? "Synthetic source" : "Local saved source"} /{" "}
        {read.source.sourceLabel}. This read is bounded to the run grant and is
        not an action authorization.
      </p>
    </article>
  );
}

export function LocalAgentAuditList({
  items,
  children,
}: {
  items: LocalAgentAuditView[];
  children?: ReactNode;
}) {
  return (
    <section
      className="cmd-local-run-audit"
      aria-labelledby="run-audit-heading"
    >
      <div className="cmd-section-heading">
        <div>
          <p className="cmd-eyebrow">Decision trail</p>
          <h2 id="run-audit-heading">Audit history</h2>
        </div>
        <span className="cmd-count">{items.length} shown</span>
      </div>
      {items.length === 0 ? (
        <p>No audit events recorded yet.</p>
      ) : (
        <ol>
          {items.map((item) => (
            <li key={item.id}>
              <span
                className="cmd-local-audit-marker"
                data-decision={item.decision ?? "system"}
              >
                {item.decision ?? "system"}
              </span>
              <div>
                <strong>{item.operation}</strong>
                <p>
                  {item.actor} / {item.projectId ?? "No project"}
                </p>
                <p>
                  {item.reason ??
                    (item.code
                      ? `Policy code: ${item.code}`
                      : "Local worker lifecycle event")}
                </p>
              </div>
              <time dateTime={item.createdAt}>{item.createdAt}</time>
            </li>
          ))}
        </ol>
      )}
      {children}
    </section>
  );
}
