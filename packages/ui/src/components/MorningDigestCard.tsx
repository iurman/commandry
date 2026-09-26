export interface MorningDigestCardView {
  id: string;
  kind: "automation" | "agent";
  title: string;
  actorLabel: string;
  outcome: "awaiting_review" | "failed" | "skipped";
  summary: string;
  completedAt: string;
  href: string;
  evidenceHref: string;
  sourceEvidenceHref: string | null;
  sourceLabel: string;
  queueHref?: string | null | undefined;
}

export function MorningDigestCard({ item }: { item: MorningDigestCardView }) {
  return (
    <article className="cmd-automation-card">
      <div className="cmd-section-heading">
        <div>
          <p className="cmd-eyebrow">
            {item.sourceLabel} /{" "}
            {item.kind === "agent" ? "Fake local run" : "Local worker"}
          </p>
          <h3>
            <a href={item.href}>{item.title}</a>
          </h3>
        </div>
        <span className="cmd-count">
          {item.outcome === "awaiting_review"
            ? "Awaiting review"
            : item.outcome === "failed"
              ? "Failed"
              : "Skipped"}
        </span>
      </div>
      <p>{item.summary}</p>
      <p className="cmd-form-hint">
        {item.actorLabel} · Completed{" "}
        <time dateTime={item.completedAt}>{item.completedAt} UTC</time> ·
        Unverified
      </p>
      <p>
        <a href={item.evidenceHref}>Run record and audit</a>
        {item.sourceEvidenceHref && (
          <>
            {" "}
            · <a href={item.sourceEvidenceHref}>Source evidence</a>
          </>
        )}
        {item.queueHref && (
          <>
            {" "}
            · <a href={item.queueHref}>Overnight plan</a>
          </>
        )}
      </p>
    </article>
  );
}
