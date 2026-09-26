export interface AutomationCardView {
  id: string;
  name: string;
  projectName: string;
  enabled: boolean;
  latestRunState:
    "queued" | "running" | "succeeded" | "failed" | "skipped" | null;
  latestRunAt: string | null;
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
          <dd>On creation once</dd>
        </div>
        <div>
          <dt>Routine</dt>
          <dd>Local project summary</dd>
        </div>
        <div>
          <dt>Last outcome</dt>
          <dd>{automation.latestRunState ?? "No run"}</dd>
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
        Synthetic local output. No external actions, live scheduler, or verified
        result.
      </p>
    </article>
  );
}
