import { resourceName } from "./activity";
import type { ActivitySnapshot, Transfer } from "./activity";

export function featuredTransfer(
  snapshot: ActivitySnapshot,
  trace: string | null,
) {
  const priority = (flow: Transfer) =>
    flow.kind === "job" && flow.phase === "processing"
      ? 5
      : flow.kind === "artifact"
        ? 4
        : flow.kind === "job"
          ? 3
          : flow.kind === "request"
            ? 2
            : 1;
  return snapshot.transfers
    .filter((flow) => !trace || flow.correlationId === trace)
    .sort((a, b) => priority(b) - priority(a) || a.start - b.start)[0];
}

export function ActivityCaption({
  snapshot,
  trace,
  inspect,
}: {
  snapshot: ActivitySnapshot;
  trace: string | null;
  inspect: (id: string, destination: string) => void;
}) {
  const flow = featuredTransfer(snapshot, trace);
  if (!flow)
    return (
      <div className="gravity-activity-caption">
        <span>{trace ? "TRACE HISTORY" : "FIELD QUIET"}</span>
        <strong>
          {trace
            ? (snapshot.traceEvents[0]?.summary ?? "No retained activity")
            : "Waiting for the next dispatch"}
        </strong>
      </div>
    );
  const build = flow.kind === "job" || flow.kind === "artifact";
  const stage =
    flow.phase === "processing"
      ? 1
      : flow.kind === "artifact"
        ? flow.phase === "response"
          ? 3
          : 2
        : 0;
  const title =
    flow.outcome === "timeout"
      ? "Waiting for timeout"
      : flow.phase === "processing"
        ? `Building on ${resourceName(flow.to)}`
        : flow.phase === "response"
          ? "Reply returning"
          : flow.kind === "artifact"
            ? "Delivering build artifact"
            : flow.kind === "job"
              ? "Dispatching build"
              : flow.kind === "probe"
                ? `Checking ${flow.count} services`
                : `Sending ${flow.count > 1 ? `${flow.count} grouped requests` : "request"}`;
  return (
    <button
      className="gravity-activity-caption"
      data-kind={flow.kind}
      data-outcome={flow.outcome}
      aria-label={`Inspect current activity: ${title}`}
      onClick={() => inspect(flow.correlationId, flow.to)}
    >
      <span>
        {build ? "BUILD JOURNEY" : "IN FLIGHT"}{" "}
        <small>/ {flow.correlationId}</small>
      </span>
      <strong>{title}</strong>
      <span className="gravity-caption-route">
        {resourceName(flow.from)} <b>&gt;</b> {resourceName(flow.to)}
      </span>
      {build && (
        <span className="gravity-caption-stages">
          {["Dispatch", "Build", "Store", "Reply"].map((label, index) => (
            <span
              key={label}
              data-current={index === stage}
              data-complete={index < stage}
            >
              {label}
            </span>
          ))}
        </span>
      )}
    </button>
  );
}
