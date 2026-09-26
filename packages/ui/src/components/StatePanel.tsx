import type { ReactNode } from "react";

export type StatePanelState =
  "normal" | "loading" | "empty" | "error" | "disabled" | "permission-denied";

const stateLabels: Record<StatePanelState, string> = {
  normal: "Ready",
  loading: "Loading",
  empty: "No data",
  error: "Unable to load",
  disabled: "Unavailable",
  "permission-denied": "Access denied",
};

export interface StatePanelProps {
  id: string;
  title: string;
  state: StatePanelState;
  description?: string;
  children?: ReactNode;
}

export function StatePanel({
  id,
  title,
  state,
  description,
  children,
}: StatePanelProps) {
  const message =
    description ?? (state === "normal" ? undefined : stateLabels[state]);

  return (
    <section
      aria-busy={state === "loading"}
      aria-labelledby={id}
      className="cmd-panel"
      data-state={state}
    >
      <div className="cmd-panel-heading">
        <h2 id={id}>{title}</h2>
        <span className="cmd-panel-state">{stateLabels[state]}</span>
      </div>
      {message && (
        <p
          className="cmd-panel-message"
          role={state === "error" ? "alert" : undefined}
        >
          {message}
        </p>
      )}
      {state === "normal" && children && (
        <div className="cmd-panel-content">{children}</div>
      )}
    </section>
  );
}
