import { resourceName, scenarios } from "./activity";
import type { ActivitySnapshot, Scenario } from "./activity";
import { useState } from "react";

export type ActivityControls = {
  scenario: Scenario;
  running: boolean;
  speed: number;
  follow: boolean;
  trace: string | null;
};
export const initialActivityControls: ActivityControls = {
  scenario: "steady",
  running: true,
  speed: 1,
  follow: false,
  trace: null,
};
export const clockLabel = (time: number) =>
  `${Math.floor(time / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(time % 60)
    .toString()
    .padStart(2, "0")}`;

export function ActivityPanel({
  snapshot,
  controls,
  visible,
  motion,
  disabled,
  change,
  step,
  reset,
  dispatch,
  trace,
}: {
  snapshot: ActivitySnapshot;
  controls: ActivityControls;
  visible: boolean;
  motion: boolean;
  disabled: boolean;
  change: (patch: Partial<ActivityControls>) => void;
  step: () => void;
  reset: () => void;
  dispatch: () => void;
  trace: (id: string, destination: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [history, setHistory] = useState(false);
  const flows = snapshot.transfers;
  const events = controls.trace ? snapshot.traceEvents : snapshot.events;
  return (
    <section className="gravity-activity" aria-label="Activity simulation">
      <div className="gravity-section-heading">
        <h3>Activity simulator</h3>
        <span>SYNTHETIC</span>
      </div>
      <label className="gravity-scenario">
        Scenario
        <select
          aria-label="Activity scenario"
          value={controls.scenario}
          disabled={disabled}
          onChange={(event) =>
            change({ scenario: event.target.value as Scenario, trace: null })
          }
        >
          {Object.entries(scenarios).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <div className="gravity-simulation-controls">
        <button
          disabled={disabled}
          aria-pressed={!controls.running}
          onClick={() => change({ running: !controls.running })}
        >
          {controls.running ? "Pause simulation" : "Run simulation"}
        </button>
        <button disabled={disabled} onClick={step}>
          Step +5s
        </button>
        <button
          disabled={disabled}
          onClick={() => {
            reset();
            change({ trace: null });
          }}
        >
          Restart
        </button>
        <select
          aria-label="Simulation speed"
          value={controls.speed}
          disabled={disabled}
          onChange={(event) => change({ speed: Number(event.target.value) })}
        >
          <option value={0.5}>0.5x</option>
          <option value={1}>1x</option>
          <option value={2}>2x</option>
          <option value={4}>4x</option>
        </select>
      </div>
      <p className="gravity-simulation-note">
        {disabled
          ? "Simulation requires the terrain renderer."
          : !motion
            ? `Motion paused at ${clockLabel(snapshot.time)}. Simulation frozen; stepping remains available.`
            : !visible && controls.running
              ? `Scene offscreen at ${clockLabel(snapshot.time)}. Autoplay suspended; stepping remains available.`
              : controls.running
                ? `Running ${clockLabel(snapshot.time)}. Paths use illustrative travel times.`
                : `Paused at ${clockLabel(snapshot.time)}. Inspect or step forward.`}
      </p>
      <div className="gravity-activity-counters">
        <span>
          <b>{snapshot.completed}</b> requests completed
        </span>
        <span>
          <b>{snapshot.failed}</b> failed attempts
        </span>
        <span>
          <b>{snapshot.jobs}</b> builds completed
        </span>
      </div>
      <label className="gravity-follow">
        <input
          type="checkbox"
          checked={controls.follow}
          onChange={(event) => change({ follow: event.target.checked })}
        />{" "}
        Emphasize selected resource
      </label>
      {controls.trace && (
        <div className="gravity-trace-selected">
          <span>Following {controls.trace}</span>
          <button onClick={() => change({ trace: null })}>Clear trace</button>
        </div>
      )}
      <div className="gravity-section-heading">
        <h3>Transfers</h3>
        <span>{flows.length} active</span>
      </div>
      <p className="gravity-simulation-note">
        A pulse sends a packet; a ripple confirms arrival. Replies retrace the
        request. Dotted: checks. Blue: requests. Violet rings: build progress.
        Gold bundles: artifacts. Broken red ripples mark timeouts.
      </p>
      {flows.length === 0 ? (
        <p className="gravity-simulation-note gravity-transfers-empty">
          No transfers in flight.
        </p>
      ) : (
        <ol className="gravity-transfers" aria-live="off">
          {(expanded ? flows : flows.slice(0, 4)).map((flow) => (
            <li
              key={flow.id}
              data-outcome={flow.outcome}
              data-kind={flow.kind}
              data-traced={controls.trace === flow.correlationId}
            >
              <button
                aria-label={`Trace ${flow.kind} ${resourceName(flow.from)} to ${resourceName(flow.to)}`}
                onClick={() => trace(flow.correlationId, flow.to)}
              >
                <span className="gravity-transfer-type">
                  {flow.kind} /{" "}
                  {flow.phase === "processing"
                    ? "running"
                    : flow.phase === "response"
                      ? "returning"
                      : flow.outcome === "timeout"
                        ? "awaiting timeout"
                        : flow.outcome === "slow"
                          ? "slow response"
                          : "outbound"}
                  {flow.count > 1 ? ` / ${flow.count} grouped` : ""}
                </span>
                <strong>
                  {resourceName(flow.from)}
                  <span> &gt; </span>
                  {resourceName(flow.to)}
                </strong>
                <span className="gravity-transfer-progress">
                  <i
                    style={{
                      width: `${Math.min(100, ((snapshot.time - flow.start) / flow.duration) * 100)}%`,
                    }}
                  />
                </span>
                <small>
                  {flow.correlationId} /{" "}
                  {flow.outcome === "timeout"
                    ? "timeout expected"
                    : flow.outcome === "slow"
                      ? "delayed"
                      : "in progress"}
                </small>
              </button>
            </li>
          ))}
        </ol>
      )}
      {flows.length > 4 && (
        <button
          className="gravity-show-transfers"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded
            ? "Show fewer transfers"
            : `Show all ${flows.length} transfers`}
        </button>
      )}
      <div className="gravity-section-heading">
        <h3>{controls.trace ? "Trace history" : "Event timeline"}</h3>
        <button disabled={disabled || !motion} onClick={dispatch}>
          Dispatch job
        </button>
      </div>
      <p className="gravity-simulation-note">
        Latest {history ? events.length : Math.min(6, events.length)} of{" "}
        {events.length}{" "}
        {controls.trace
          ? "trace events (120s window)"
          : "recent events (latest 30)"}{" "}
        / {snapshot.totalEvents} since restart. Inspect a row to follow its
        trace.
      </p>
      <ol className="gravity-activity-history" aria-live="off">
        {(history ? events : events.slice(0, 6)).map((event) => (
          <li key={event.id} data-outcome={event.outcome}>
            <button onClick={() => trace(event.correlationId, event.to)}>
              <time>{clockLabel(event.at)}</time>
              <span>
                {event.summary}
                <small>
                  {resourceName(event.from)} &gt; {resourceName(event.to)} /{" "}
                  {event.correlationId}
                </small>
              </span>
            </button>
          </li>
        ))}
      </ol>
      {events.length > 6 && (
        <button
          className="gravity-show-transfers"
          onClick={() => setHistory(!history)}
        >
          {history
            ? "Show recent events"
            : `Show all ${events.length} retained events`}
        </button>
      )}
    </section>
  );
}
