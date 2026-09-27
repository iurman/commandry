export interface LocalAgentCallbackView {
  id: string;
  attemptId: string;
  sequence: number;
  kind: "heartbeat" | "artifact";
  stage: "started" | "brief_read" | "work_read" | "result_prepared" | null;
  artifactName: "synthetic-run-report.json" | null;
  artifactBytes: number | null;
  artifactSha256: string | null;
  sourceLabel: string;
  createdAt: string;
}

export function LocalAgentCallbackTimeline({
  runId,
  events,
}: {
  runId: string;
  events: LocalAgentCallbackView[];
}) {
  return (
    <section
      className="cmd-local-run-audit"
      aria-labelledby="runner-events-heading"
    >
      <p className="cmd-eyebrow">Local runner protocol / Synthetic evidence</p>
      <h2 id="runner-events-heading">Runner heartbeats and artifacts</h2>
      <p>
        These are recorded by the fake local worker. Each callback is scoped to
        one run attempt and ordered; the report is unverified and contains no
        external action.
      </p>
      {events.length === 0 ? (
        <p>No local runner callback has been recorded yet.</p>
      ) : (
        <ol className="cmd-runner-callback-list">
          {events.map((event) => (
            <li key={event.id}>
              <strong>
                {event.kind === "heartbeat"
                  ? `Heartbeat: ${event.stage?.replaceAll("_", " ")}`
                  : "Synthetic report artifact"}
              </strong>
              <p>
                Attempt {event.attemptId.slice(0, 8)} / callback{" "}
                {event.sequence}/ {event.sourceLabel}
              </p>
              <p>
                Recorded{" "}
                <time dateTime={event.createdAt}>{event.createdAt}</time>
              </p>
              {event.kind === "artifact" && event.artifactName && (
                <p>
                  <a
                    href={`/api/v1/agent-runs/${encodeURIComponent(runId)}/callbacks/${encodeURIComponent(event.id)}/artifact`}
                  >
                    Download {event.artifactName}
                  </a>{" "}
                  ({event.artifactBytes?.toLocaleString()} bytes, SHA-256{" "}
                  <code>{event.artifactSha256}</code>)
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
