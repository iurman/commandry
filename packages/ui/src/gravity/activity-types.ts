export type Health = "unknown" | "healthy" | "degraded" | "unhealthy";
export type Outcome = "ok" | "slow" | "timeout" | "failed";
export type Transfer = {
  id: string;
  correlationId: string;
  from: string;
  to: string;
  kind: "probe" | "request" | "job" | "artifact";
  phase: "outbound" | "response" | "processing";
  start: number;
  duration: number;
  outcome: Outcome;
  count: number;
  attempt: number;
  origin: string;
  recorded?: boolean;
};
export type HealthSample = {
  state: Health;
  checkedAt: number;
  latencyMs: number | null;
  reason: string;
};
export type ActivityEvent = {
  id: string;
  at: number;
  correlationId: string;
  from: string;
  to: string;
  kind: Transfer["kind"] | "observation";
  outcome: Outcome;
  summary: string;
  effect: "arrival" | "failure" | null;
};
export type ActivitySnapshot = {
  time: number;
  transfers: Transfer[];
  events: ActivityEvent[];
};
export function activeTransfers(snapshot: ActivitySnapshot) {
  return snapshot.transfers.filter(
    (flow) =>
      snapshot.time >= flow.start && snapshot.time < flow.start + flow.duration,
  );
}
export interface ActivitySource {
  /** Recorded evidence playback follows elapsed time even at a low render rate. */
  readonly clock?: "elapsed";
  snapshot(): ActivitySnapshot;
  active?(): boolean;
  advance?(seconds: number): void;
  attention?(id: string): number;
}
