export interface AutomationCardView {
  id: string;
  name: string;
  projectName: string;
  enabled: boolean;
  triggerType:
    | "on_creation_once"
    | "recurring_interval"
    | "synthetic_event"
    | "synthetic_condition";
  eventType?:
    "git.pull_request.merged" | "monitor.down" | "monitor.recovered" | null;
  condition?: { thresholdPercent: number } | null;
  createsLocalNote?: boolean;
  latestRunState:
    "queued" | "running" | "succeeded" | "failed" | "skipped" | null;
  latestRunAt: string | null;
  nextRunAt: string | null;
}

export function AutomationCard({
  automation,
}: {
  automation: AutomationCardView;
}) {
  return (
    <article className="cmd-automation-card">
      <div className="cmd-section-heading">
        <div>
          <p className="cmd-eyebrow">
            Local-only /{" "}
            {automation.createsLocalNote ? "Project note" : "Read-only"}
          </p>
          <h3>
            <a href={`/automations/${automation.id}`}>{automation.name}</a>
          </h3>
        </div>
        <span className="cmd-count">
          {automation.enabled ? "Enabled" : "Disabled"}
        </span>
      </div>
      <dl className="cmd-automation-facts">
        <div>
          <dt>Project</dt>
          <dd>{automation.projectName}</dd>
        </div>
        <div>
          <dt>Trigger</dt>
          <dd>
            {automation.triggerType === "recurring_interval"
              ? "Recurring local interval"
              : automation.triggerType === "synthetic_event"
                ? `Synthetic ${automation.eventType ?? "fixture"} event`
                : automation.triggerType === "synthetic_condition"
                  ? `Synthetic availability at or below ${automation.condition?.thresholdPercent ?? "configured"}%`
                  : "On creation once"}
          </dd>
        </div>
        <div>
          <dt>Routine</dt>
          <dd>
            Local project summary
            {automation.createsLocalNote ? " with synthetic note" : ""}
          </dd>
        </div>
        <div>
          <dt>Latest run state</dt>
          <dd>{automation.latestRunState ?? "No run"}</dd>
        </div>
        <div>
          <dt>Next planned run</dt>
          <dd>
            {automation.triggerType === "synthetic_event" ? (
              "On next matching synthetic event"
            ) : automation.triggerType === "synthetic_condition" ? (
              "On next synthetic below-threshold crossing"
            ) : automation.nextRunAt ? (
              <time dateTime={automation.nextRunAt}>
                {automation.nextRunAt} UTC
              </time>
            ) : (
              "None"
            )}
          </dd>
        </div>
      </dl>
      {automation.latestRunAt && (
        <p className="cmd-record-identity">
          Last run queued{" "}
          <time dateTime={automation.latestRunAt}>
            {automation.latestRunAt}
          </time>
        </p>
      )}
      <p className="cmd-form-hint">
        Synthetic local output. No external actions or verified result.
      </p>
    </article>
  );
}
