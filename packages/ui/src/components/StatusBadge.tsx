export type StatusDimension =
  "lifecycle" | "health" | "attention" | "sync" | "execution";

export type StatusTone = "neutral" | "positive" | "caution" | "critical";

export interface StatusBadgeProps {
  dimension: StatusDimension;
  label: string;
  tone: StatusTone;
}

export function StatusBadge({ dimension, label, tone }: StatusBadgeProps) {
  return (
    <span
      className="cmd-status-badge"
      data-dimension={dimension}
      data-tone={tone}
    >
      <span className="cmd-status-dimension">{dimension}</span>
      <span>{label}</span>
    </span>
  );
}
