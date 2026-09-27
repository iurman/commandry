export interface SyntheticFlowStageView {
  id: string;
  kind: string;
  title: string;
  detail: string;
  recordedAt: string;
  occurredAt: string | null;
  href: string | null;
  isSynthetic: true;
}

export function SyntheticFlowTimeline({
  stages,
}: {
  stages: SyntheticFlowStageView[];
}) {
  return (
    <ol className="cmd-flow-timeline" aria-label="Persisted synthetic stages">
      {stages.map((stage) => (
        <li key={stage.id} className="cmd-flow-stage">
          <article>
            <p className="cmd-eyebrow">
              Synthetic record / {stage.kind.replaceAll("_", " ")}
            </p>
            <h3>{stage.title}</h3>
            <p>{stage.detail}</p>
            <dl className="cmd-flow-stage-times">
              <div>
                <dt>Recorded by Commandry</dt>
                <dd>
                  <time dateTime={stage.recordedAt}>{stage.recordedAt}</time>
                </dd>
              </div>
              {stage.occurredAt && (
                <div>
                  <dt>Source occurrence</dt>
                  <dd>
                    <time dateTime={stage.occurredAt}>{stage.occurredAt}</time>
                  </dd>
                </div>
              )}
            </dl>
            {stage.href && <a href={stage.href}>Inspect exact record</a>}
          </article>
        </li>
      ))}
    </ol>
  );
}
