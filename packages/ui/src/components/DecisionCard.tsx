import type { ReactNode } from "react";
import { Button } from "./Button";
import { StatusBadge } from "./StatusBadge";

export interface DecisionCardProps {
  id: string;
  question: string;
  outcome: string;
  alternatives: string;
  rationale: string;
  status: "proposed" | "accepted" | "superseded";
  revision: number;
  sourceLabel: string;
  updatedAt: string;
  onRevise?: () => void;
  onHistory?: () => void;
  historyOpen?: boolean;
  children?: ReactNode;
}

export function DecisionCard({
  id,
  question,
  outcome,
  alternatives,
  rationale,
  status,
  revision,
  sourceLabel,
  updatedAt,
  onRevise,
  onHistory,
  historyOpen = false,
  children,
}: DecisionCardProps) {
  return (
    <article className="cmd-decision-card">
      <div className="cmd-section-heading">
        <h3>{question}</h3>
        <StatusBadge dimension="lifecycle" label={status} tone="neutral" />
      </div>
      <p>
        <strong>Outcome:</strong> {outcome}
      </p>
      {alternatives && (
        <p>
          <strong>Alternatives:</strong> {alternatives}
        </p>
      )}
      <p>
        <strong>Rationale:</strong> {rationale}
      </p>
      <p className="cmd-record-identity">
        {sourceLabel} · Revision {revision} · Updated{" "}
        <time dateTime={updatedAt}>{updatedAt}</time>
      </p>
      <div className="cmd-decision-actions">
        {status !== "superseded" && onRevise && (
          <Button onClick={onRevise}>Revise decision</Button>
        )}
        {onHistory && (
          <Button onClick={onHistory}>
            {historyOpen ? "Hide history" : "View history"}
          </Button>
        )}
        <a href={`/api/v1/decisions/${id}`}>Open source record</a>
      </div>
      {children}
    </article>
  );
}
