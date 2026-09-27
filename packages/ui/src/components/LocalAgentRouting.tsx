export interface LocalAgentRouteView {
  agent: {
    id: string;
    name: string;
    role: string | null;
    runtime: string;
  };
  activeRunCount: number;
  reason: string;
  readOperations: readonly string[];
}

export interface CachedLocalResultView {
  runId: string;
  completedAt: string;
  summary: string;
  sourceLabel: string;
  verificationStatus: "unverified";
}

export interface CachedLocalEvidenceView {
  kind: string;
  id: string;
  href: string;
  sourceLabel: string;
  recordedAt: string;
  isSynthetic: boolean;
}

export function LocalAgentRouteCard({
  candidate,
}: {
  candidate: LocalAgentRouteView;
}) {
  return (
    <article className="cmd-record-card" aria-label={candidate.agent.name}>
      <p className="cmd-eyebrow">Synthetic local routing preview</p>
      <h3 className="cmd-record-title">{candidate.agent.name}</h3>
      <p>{candidate.agent.role ?? "No role recorded"}</p>
      <p>{candidate.reason}.</p>
      <p>
        Read scope: {candidate.readOperations.join(", ")}. Runtime:{" "}
        {candidate.agent.runtime}.
      </p>
      <p>Queued or running fake jobs: {candidate.activeRunCount}.</p>
    </article>
  );
}

export function CachedLocalResultCard({
  result,
  evidence,
}: {
  result: CachedLocalResultView;
  evidence: CachedLocalEvidenceView[];
}) {
  return (
    <article className="cmd-record-card" aria-label="Saved fake-run result">
      <p className="cmd-eyebrow">{result.sourceLabel}</p>
      <h3 className="cmd-record-title">Saved fake-run result</h3>
      <p>{result.summary}</p>
      <p>
        Saved {new Date(result.completedAt).toLocaleString()}. Unverified
        historical output; no external action was taken.
      </p>
      <p>
        <a href={`/agent-runs/${result.runId}`}>
          Open saved run and read audit
        </a>
      </p>
      <h4>Evidence in this page</h4>
      <ul>
        {evidence.map((item) => (
          <li key={`${item.kind}:${item.id}`}>
            <a href={item.href}>
              {item.kind.replaceAll("_", " ")} / {item.id}
            </a>{" "}
            ({item.sourceLabel}; recorded{" "}
            {new Date(item.recordedAt).toLocaleString()};{" "}
            {item.isSynthetic ? "synthetic" : "recorded source"})
          </li>
        ))}
      </ul>
    </article>
  );
}
