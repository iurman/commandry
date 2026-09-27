import { Button } from "./Button";

type ScenarioId =
  | "development.pr-merged"
  | "operations.monitor-down"
  | "operations.monitor-recovered";

export interface LocalConnectorFeedView {
  id: string;
  scenarioId: ScenarioId;
  state: "queued" | "processing" | "submitted" | "failed";
  attempts: number;
  importId: string | null;
  error: string | null;
}

export function LocalConnectorPanel({
  enabled,
  receiverConfigured,
  token,
  feed,
  nextCursor,
  busy,
  onRotate,
  onReceive,
  onQueue,
  onRefresh,
  onLoadMore,
  scenarios,
}: {
  enabled: boolean;
  receiverConfigured: boolean;
  token: string | null;
  feed: LocalConnectorFeedView[];
  nextCursor: string | null;
  busy: boolean;
  onRotate: () => void;
  onReceive: (scenarioId: ScenarioId) => void;
  onQueue: (scenarioId: ScenarioId) => void;
  onRefresh: () => void;
  onLoadMore: () => void;
  scenarios: { id: ScenarioId; label: string }[];
}) {
  return (
    <section
      className="cmd-local-connector"
      aria-label="Local synthetic connector rehearsal"
    >
      <h4>Local receiver and poll rehearsal</h4>
      <p>
        These paths use synthetic fixture payloads. They do not contact a live
        provider.
      </p>
      <p className="cmd-form-hint">
        Receiver token: {receiverConfigured ? "configured" : "not configured"}.
        Poll feed: worker checks queued rows locally.
      </p>
      <div className="cmd-action-row">
        <Button type="button" onClick={onRotate} disabled={!enabled || busy}>
          {receiverConfigured ? "Rotate local token" : "Create local token"}
        </Button>
        <Button type="button" onClick={onRefresh} disabled={busy}>
          Refresh feed
        </Button>
      </div>
      {token && (
        <div className="cmd-connector-token" role="status">
          <strong>Local synthetic receiver token, shown once</strong>
          <code>{token}</code>
          <p>Keep this local. Rotating it revokes the previous token.</p>
        </div>
      )}
      <div className="cmd-connector-actions">
        {scenarios.map((scenario) => (
          <div className="cmd-action-row" key={scenario.id}>
            <Button
              type="button"
              onClick={() => onQueue(scenario.id)}
              disabled={!enabled || busy}
            >
              Queue {scenario.label} for local poll
            </Button>
            <Button
              type="button"
              onClick={() => onReceive(scenario.id)}
              disabled={!enabled || !token || busy}
            >
              Send {scenario.label} to receiver
            </Button>
          </div>
        ))}
      </div>
      <div className="cmd-connector-feed">
        <strong>Synthetic poll feed</strong>
        {feed.length === 0 ? (
          <p>No queued fixture rows shown.</p>
        ) : (
          <ul>
            {feed.map((item) => (
              <li key={item.id}>
                <span>
                  {item.scenarioId} / {item.state} / {item.attempts} attempt
                  {item.attempts === 1 ? "" : "s"}
                </span>
                {item.importId && (
                  <a href={`/api/v1/synthetic-event-imports/${item.importId}`}>
                    Import receipt
                  </a>
                )}
                {item.error && <span role="status">{item.error}</span>}
              </li>
            ))}
          </ul>
        )}
        {nextCursor && (
          <Button type="button" onClick={onLoadMore} disabled={busy}>
            Load older feed rows
          </Button>
        )}
      </div>
    </section>
  );
}
