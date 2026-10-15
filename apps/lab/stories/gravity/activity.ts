import type { Host } from "./model";

export const scenarios = {
  steady: "Steady traffic",
  build: "Build pipeline",
  incident: "Failure / recovery",
  burst: "Traffic burst",
} as const;
export type Scenario = keyof typeof scenarios;
export type Health = "unknown" | "healthy" | "degraded" | "unhealthy";
export type Outcome = "ok" | "slow" | "timeout";
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
  kind: Transfer["kind"];
  outcome: Outcome;
  summary: string;
  effect: "arrival" | "failure" | null;
};
export type ActivitySnapshot = {
  time: number;
  scenario: Scenario;
  transfers: Transfer[];
  health: Record<string, HealthSample>;
  events: ActivityEvent[];
  traceEvents: ActivityEvent[];
  totalEvents: number;
  completed: number;
  failed: number;
  jobs: number;
};

export function resourceName(id: string) {
  const [host, service] = id.split("/");
  const name = host ? host[0]!.toUpperCase() + host.slice(1) : id;
  return service ? `${name} / ${service}` : name;
}
export function resourceHealth(
  snapshot: ActivitySnapshot,
  id: string,
): HealthSample {
  if (snapshot.health[id]) return snapshot.health[id]!;
  const children = Object.entries(snapshot.health)
    .filter(([key]) => key.startsWith(`${id}/`))
    .map(([, sample]) => sample);
  const rank: Health[] = ["healthy", "unknown", "degraded", "unhealthy"];
  return (
    children.sort(
      (a, b) => rank.indexOf(b.state) - rank.indexOf(a.state),
    )[0] ?? {
      state: "unknown",
      checkedAt: 0,
      latencyMs: null,
      reason: "Awaiting simulated check",
    }
  );
}

// This is a deterministic lab fixture. It performs no network or infrastructure action.
export class ActivitySimulation {
  private time = 0;
  private nextTick = 0;
  private sequence = 0;
  private transfers: Transfer[] = [];
  private health: Record<string, HealthSample> = {};
  private events: ActivityEvent[] = [];
  private totalEvents = 0;
  private completed = 0;
  private failed = 0;
  private jobs = 0;
  private scheduled: Transfer[] = [];

  constructor(
    private hosts: Host[],
    private scenario: Scenario = "steady",
  ) {
    this.setHosts(hosts);
  }

  setHosts(hosts: Host[]) {
    this.hosts = hosts;
    const ids = new Set(
      hosts.flatMap((host) =>
        host.services.map((service) => `${host.id}/${service}`),
      ),
    );
    for (const id of Object.keys(this.health))
      if (!ids.has(id)) delete this.health[id];
    for (const id of ids)
      this.health[id] ??= {
        state: "unknown",
        checkedAt: 0,
        latencyMs: null,
        reason: "Awaiting simulated check",
      };
  }

  snapshot(trace: string | null = null): ActivitySnapshot {
    return {
      time: this.time,
      scenario: this.scenario,
      transfers: this.transfers.map((flow) => ({ ...flow })),
      health: { ...this.health },
      events: this.events.slice(0, 30),
      traceEvents: trace
        ? this.events.filter((event) => event.correlationId === trace)
        : [],
      totalEvents: this.totalEvents,
      completed: this.completed,
      failed: this.failed,
      jobs: this.jobs,
    };
  }

  advance(seconds: number) {
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 300)
      throw new Error("Advance the study by 0 to 300 seconds at a time.");
    const until = this.time + seconds;
    while (this.nextTick <= until) {
      this.time = this.nextTick;
      this.settle();
      this.schedule();
      this.nextTick += 0.5;
    }
    this.time = until;
    this.settle();
  }

  sendJob(hostId = "titan") {
    const host = this.hosts.find((item) => item.id === hostId) ?? this.hosts[0];
    if (!host) return;
    const destination = `${host.id}/${host.services.includes("Builder") ? "Builder" : host.services[0]}`;
    this.launch("electra/Worker", destination, "job", 1);
  }

  private outcome(resource: string, at = this.time): Outcome {
    const phase = at % 48;
    if (this.scenario === "incident" && resource === "titan/Builder") {
      if (phase >= 12 && phase < 28) return "timeout";
      if (phase >= 5 && phase < 12) return "slow";
    }
    return "ok";
  }

  private launch(
    from: string,
    to: string,
    kind: Transfer["kind"],
    count: number,
    correlationId?: string,
    phase: Transfer["phase"] = "outbound",
    attempt = 1,
    start = this.time,
    origin = from,
  ) {
    if (!this.health[from] || !this.health[to]) return;
    const id = `transfer-${++this.sequence}`;
    const outcome = this.outcome(to);
    const duration =
      phase === "processing"
        ? outcome === "timeout"
          ? 5
          : 7
        : phase === "response"
          ? 1.5
          : outcome === "timeout"
            ? 4
            : outcome === "slow"
              ? 4.5
              : 2.5;
    const transfer: Transfer = {
      id,
      correlationId: correlationId ?? `trace-${this.sequence}`,
      from,
      to,
      kind,
      phase,
      start,
      duration,
      outcome,
      count,
      attempt,
      origin,
    };
    if (start > this.time) {
      this.scheduled.push(transfer);
      this.record(transfer, `Retry ${attempt - 1} queued; backoff 4s`);
    } else {
      this.transfers.push(transfer);
      this.record(
        transfer,
        phase === "processing"
          ? "Job running"
          : phase === "response"
            ? "Response returning"
            : kind === "probe"
              ? `Health batch dispatched (${count} checks)`
              : kind === "job"
                ? `Job dispatched${attempt > 1 ? `, retry ${attempt - 1}` : ""}`
                : `${kind === "artifact" ? "Artifact" : "Request"} dispatched${count > 1 ? ` (${count} grouped)` : ""}`,
        phase === "processing" ? "arrival" : null,
      );
    }
  }

  private record(
    flow: Transfer,
    summary: string,
    effect: ActivityEvent["effect"] = null,
  ) {
    this.events.unshift({
      id: `event-${++this.totalEvents}`,
      at: this.time,
      correlationId: flow.correlationId,
      from: flow.from,
      to: flow.to,
      kind: flow.kind,
      outcome: flow.outcome,
      summary,
      effect,
    });
    this.events = this.events.filter((event) => event.at >= this.time - 120);
  }

  private schedule() {
    const tick = Math.round(this.time * 2);
    this.hosts.forEach((host, index) => {
      if (tick % 16 === (index * 2) % 16)
        this.launch(
          "pleiades/Metrics",
          `${host.id}/${host.services[0]}`,
          "probe",
          host.services.length,
        );
    });
    if (tick % 8 === 2)
      this.launch(
        "electra/Web",
        "pleiades/API",
        "request",
        this.scenario === "burst" ? 40 : 1,
      );
    if (tick % 12 === 6)
      this.launch(
        "pleiades/API",
        "maia/NAS",
        "request",
        this.scenario === "burst" ? 24 : 1,
      );
    if (tick % (this.scenario === "build" ? 28 : 48) === 4) this.sendJob();
    if (this.scenario === "incident" && tick % 8 === 4)
      this.launch("pleiades/API", "titan/Builder", "request", 1);
    if (this.hosts.some((host) => host.id === "atlas") && tick % 32 === 8)
      this.launch("titan/Registry", "atlas/Build agent", "job", 1);
  }

  private settle() {
    for (const flow of this.scheduled.filter(
      (item) => item.start <= this.time,
    )) {
      flow.outcome = this.outcome(flow.to);
      this.transfers.push(flow);
      this.record(flow, `Retry ${flow.attempt - 1} dispatched`);
    }
    this.scheduled = this.scheduled.filter((item) => item.start > this.time);
    const finished = this.transfers.filter(
      (flow) => flow.start + flow.duration <= this.time,
    );
    this.transfers = this.transfers.filter(
      (flow) => flow.start + flow.duration > this.time,
    );
    for (const flow of finished) {
      if (flow.kind === "probe") {
        if (flow.phase === "response") {
          this.record(flow, "Health response received", "arrival");
          continue;
        }
        const host = this.hosts.find((item) =>
          flow.to.startsWith(`${item.id}/`),
        );
        if (host)
          for (const service of host.services) {
            const id = `${host.id}/${service}`;
            const outcome = this.outcome(id, flow.start);
            const state: Health =
              outcome === "timeout"
                ? "unhealthy"
                : outcome === "slow"
                  ? "degraded"
                  : "healthy";
            const previous = this.health[id]?.state;
            this.health[id] = {
              state,
              checkedAt: this.time,
              latencyMs:
                outcome === "timeout"
                  ? null
                  : outcome === "slow"
                    ? 940
                    : 90 + ((id.length * 17) % 160),
              reason:
                outcome === "timeout"
                  ? "Simulated check timed out"
                  : outcome === "slow"
                    ? "Simulated response over 750 ms"
                    : "Simulated HTTP 200",
            };
            if (previous !== state && previous !== "unknown")
              this.record(
                { ...flow, to: id, outcome },
                state === "healthy"
                  ? "Service recovered"
                  : state === "degraded"
                    ? "Service response slowed"
                    : "Service unavailable",
              );
          }
        if (flow.phase === "outbound") {
          if (flow.outcome !== "timeout")
            this.launch(
              flow.to,
              flow.from,
              "probe",
              flow.count,
              flow.correlationId,
              "response",
            );
          this.record(
            flow,
            "Health batch completed",
            flow.outcome === "timeout" ? "failure" : "arrival",
          );
        }
        continue;
      }
      if (flow.outcome === "timeout") {
        this.failed += flow.count;
        this.record(
          flow,
          flow.kind === "job" ? "Job timed out" : "Request timed out",
          "failure",
        );
        if (flow.attempt < 3)
          this.launch(
            flow.from,
            flow.to,
            flow.kind,
            flow.count,
            flow.correlationId,
            "outbound",
            flow.attempt + 1,
            this.time + 4,
            flow.origin,
          );
      } else if (flow.kind === "job" && flow.phase === "outbound") {
        this.launch(
          flow.from,
          flow.to,
          "job",
          1,
          flow.correlationId,
          "processing",
          flow.attempt,
          this.time,
          flow.origin,
        );
      } else if (flow.kind === "job" && flow.phase === "processing") {
        this.jobs++;
        this.record(flow, "Build completed; artifact ready", "arrival");
        this.launch(
          flow.to,
          "maia/NAS",
          "artifact",
          1,
          flow.correlationId,
          "outbound",
          flow.attempt,
          this.time,
          flow.origin,
        );
      } else if (flow.phase === "outbound") {
        if (flow.kind === "request") this.completed += flow.count;
        this.record(
          flow,
          flow.kind === "artifact"
            ? "Artifact stored"
            : flow.outcome === "slow"
              ? "Slow request completed"
              : `${flow.count > 1 ? `${flow.count} grouped requests` : "Request"} completed`,
          "arrival",
        );
        this.launch(
          flow.to,
          flow.kind === "artifact" ? flow.origin : flow.from,
          flow.kind,
          flow.count,
          flow.correlationId,
          "response",
        );
      } else this.record(flow, "Response received", "arrival");
    }
  }
}
