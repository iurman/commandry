export interface ProjectAgentFindingView {
  runId: string;
  agentName: string;
  workTitle: string;
  packetId: string;
  packetDigest: string;
  completedAt: string;
  summary: string;
  evidenceCount: number;
  evidence: Array<{
    id: string;
    kind: string;
    href: string;
    sourceLabel: string;
    isSynthetic: boolean;
  }>;
  sourceHref: string;
  packetHref: string;
}

export function ProjectAgentFindingCard({
  finding,
}: {
  finding: ProjectAgentFindingView;
}) {
  return (
    <article className="cmd-record-card" aria-label="saved fake agent finding">
      <p className="cmd-eyebrow">Synthetic / unverified / saved result</p>
      <h3 className="cmd-record-title">{finding.workTitle}</h3>
      <p>{finding.summary}</p>
      <p>
        Fake agent {finding.agentName}; recorded{" "}
        <time dateTime={finding.completedAt}>{finding.completedAt}</time>.
      </p>
      <p>
        Bound to packet digest <code>{finding.packetDigest.slice(0, 12)}</code>.
        This result is historical and does not update when project context
        changes.
      </p>
      <ul>
        {finding.evidence.map((source) => (
          <li key={`${source.kind}:${source.id}`}>
            <a href={source.href}>
              Exact {source.kind.replaceAll("_", " ")} evidence
            </a>
            {` / ${source.isSynthetic ? "synthetic " : ""}${source.sourceLabel}`}
          </li>
        ))}
      </ul>
      {finding.evidenceCount > finding.evidence.length && (
        <p>
          {finding.evidenceCount - finding.evidence.length} more source records
          are available from the run.
        </p>
      )}
      <p>
        <a href={`/agent-runs/${finding.runId}`}>
          Review fake run and evidence
        </a>
        {" / "}
        <a href={`/execution-packets/${finding.packetId}`}>
          Review saved packet
        </a>
        {" / "}
        <a href={finding.sourceHref}>Run source</a>
        {" / "}
        <a href={finding.packetHref}>Packet source</a>
      </p>
    </article>
  );
}
