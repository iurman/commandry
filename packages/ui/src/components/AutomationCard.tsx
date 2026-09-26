export interface AutomationCardView {
  id: string;
  name: string;
  projectName: string;
  enabled: boolean;
  triggerType: "on_creation_once" | "recurring_interval";
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
          <p className="cmd-eyebrow">Local-only / Read-only</p>
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
              : "On creation once"}
          </dd>
        </div>
        <div>
          <dt>Routine</dt>
          <dd>Local project summary</dd>
        </div>
        <div>
          <dt>Latest run state</dt>
          <dd>{automation.latestRunState ?? "No run"}</dd>
        </div>
        <div>
          <dt>Next planned run</dt>
          <dd>
            {automation.nextRunAt ? (
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
