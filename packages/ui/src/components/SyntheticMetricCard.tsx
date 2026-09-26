export interface SyntheticMetricCardView {
  id: string;
  resourceId: string;
  resourceName: string;
  value: number;
  sampledAt: string;
  recordedAt: string;
  evidenceHref: string;
  sourceLabel: string;
}

export function SyntheticMetricCard({
  sample,
  previousValue,
}: {
  sample: SyntheticMetricCardView;
  previousValue?: number | null;
}) {
  const change = previousValue == null ? null : sample.value - previousValue;
  return (
    <article className="cmd-synthetic-event cmd-metric-card">
      <p className="cmd-eyebrow">
        Synthetic operational fixture / Not live health
      </p>
      <h3>External availability: {sample.value}%</h3>
      <progress
        aria-label="Synthetic external availability"
        max={100}
        value={sample.value}
      />
      <p>
        <a href={`/resources/${sample.resourceId}`}>{sample.resourceName}</a>
        {change == null
          ? ". No earlier sample in this page."
          : `. Change from the previous synthetic sample: ${change > 0 ? "+" : ""}${change} percentage points.`}
      </p>
      <p>
        Fixture time <time dateTime={sample.sampledAt}>{sample.sampledAt}</time>
        . Recorded <time dateTime={sample.recordedAt}>{sample.recordedAt}</time>
        .
      </p>
      <p>
        {sample.sourceLabel}.{" "}
        <a href={sample.evidenceHref}>Inspect original synthetic source</a>
      </p>
    </article>
  );
}
