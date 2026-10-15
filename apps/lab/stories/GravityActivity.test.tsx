import { describe, expect, it } from "vitest";
import { ActivitySimulation, resourceHealth } from "./gravity/activity";
import {
  fixtureHosts,
  arrivalHost,
  projectWells,
  surfaceHeight,
} from "./gravity/model";
import {
  transferPoint,
  transferMatchesSelection,
} from "./gravity/activity-renderer";

describe("operational activity simulation", () => {
  it("keeps a complete build trace after it leaves the recent feed and returns the result to its requester", () => {
    const simulation = new ActivitySimulation(fixtureHosts);
    simulation.advance(2);
    const trace = simulation
      .snapshot()
      .transfers.find((flow) => flow.kind === "job")!.correlationId;
    simulation.advance(22);
    const history = simulation.snapshot(trace).traceEvents;
    expect(history.some((event) => event.summary === "Job dispatched")).toBe(
      true,
    );
    expect(
      history.some(
        (event) =>
          event.kind === "artifact" &&
          event.to === "electra/Worker" &&
          event.summary === "Response received",
      ),
    ).toBe(true);
    simulation.advance(130);
    expect(simulation.snapshot(trace).traceEvents).toHaveLength(0);
  });
  it("starts unknown, observes each service, and keeps capacity separate from availability", () => {
    const simulation = new ActivitySimulation(fixtureHosts);
    expect(
      Object.values(simulation.snapshot().health).every(
        (sample) => sample.state === "unknown",
      ),
    ).toBe(true);
    simulation.advance(8);
    const snapshot = simulation.snapshot();
    expect(Object.keys(snapshot.health)).toHaveLength(21);
    expect(
      Object.values(snapshot.health).every(
        (sample) =>
          sample.state === "healthy" &&
          sample.checkedAt > 0 &&
          sample.latencyMs! > 0,
      ),
    ).toBe(true);
    expect(resourceHealth(snapshot, "titan").state).toBe("healthy");
    expect(fixtureHosts.find((host) => host.id === "titan")!.memory).toBe(86);
    expect(resourceHealth(snapshot, "missing").state).toBe("unknown");
  });
  it("visits slow, unavailable and recovered states through completed checks", () => {
    const simulation = new ActivitySimulation(fixtureHosts, "incident");
    simulation.advance(12);
    expect(simulation.snapshot().health["titan/Builder"]!.state).toBe(
      "healthy",
    );
    simulation.advance(4);
    expect(simulation.snapshot().health["titan/Builder"]!.state).toBe(
      "degraded",
    );
    simulation.advance(8);
    expect(resourceHealth(simulation.snapshot(), "titan").state).toBe(
      "unhealthy",
    );
    expect(simulation.snapshot().health["titan/Registry"]!.state).toBe(
      "healthy",
    );
    simulation.advance(14);
    expect(resourceHealth(simulation.snapshot(), "titan").state).toBe(
      "healthy",
    );
    expect(
      simulation
        .snapshot()
        .events.some((event) => event.summary === "Service recovered"),
    ).toBe(true);
  });
  it("correlates dispatch, processing, artifact storage and response and bounds retry attempts", () => {
    const simulation = new ActivitySimulation(fixtureHosts, "incident");
    const summaries = new Map<string, Set<string>>();
    let retries = false;
    for (let time = 0; time < 48; time += 0.5) {
      simulation.advance(0.5);
      for (const flow of simulation.snapshot().transfers) {
        expect(flow.attempt).toBeLessThanOrEqual(3);
        if (flow.attempt > 1) retries = true;
      }
      for (const event of simulation.snapshot().events) {
        const chain = summaries.get(event.correlationId) ?? new Set<string>();
        chain.add(event.summary);
        summaries.set(event.correlationId, chain);
      }
    }
    expect(retries).toBe(true);
    expect(
      [...summaries.values()].some(
        (chain) =>
          chain.has("Job dispatched") &&
          chain.has("Job running") &&
          chain.has("Build completed; artifact ready") &&
          chain.has("Artifact stored") &&
          chain.has("Response received"),
      ),
    ).toBe(true);
    expect(simulation.snapshot().failed).toBeGreaterThan(0);
  });
  it("aggregates bursts without inventing extra visible packets or counting response packets twice", () => {
    const steady = new ActivitySimulation(fixtureHosts, "steady");
    const burst = new ActivitySimulation(fixtureHosts, "burst");
    steady.advance(20);
    burst.advance(20);
    expect(burst.snapshot().completed).toBeGreaterThan(
      steady.snapshot().completed * 20,
    );
    expect(burst.snapshot().transfers.length).toBe(
      steady.snapshot().transfers.length,
    );
    expect(burst.snapshot().transfers.some((flow) => flow.count > 1)).toBe(
      true,
    );
    const repeat = new ActivitySimulation(fixtureHosts, "burst");
    for (let index = 0; index < 40; index++) repeat.advance(0.5);
    expect(repeat.snapshot()).toEqual(burst.snapshot());
  });
  it("retains running resources across arrivals and bounds the active visual population", () => {
    const simulation = new ActivitySimulation(fixtureHosts, "build");
    simulation.advance(10);
    const before = simulation.snapshot();
    simulation.setHosts([...fixtureHosts, arrivalHost]);
    expect(simulation.snapshot().health["electra/Web"]).toEqual(
      before.health["electra/Web"],
    );
    expect(simulation.snapshot().health["atlas/Build agent"]!.state).toBe(
      "unknown",
    );
    for (let index = 0; index < 600; index++) {
      simulation.advance(0.5);
      expect(simulation.snapshot().transfers.length).toBeLessThan(32);
    }
    expect(simulation.snapshot().health["atlas/Build agent"]!.state).toBe(
      "healthy",
    );
    expect(simulation.snapshot().events).toHaveLength(30);
    expect(simulation.snapshot().totalEvents).toBeGreaterThan(30);
    expect(() => simulation.advance(Infinity)).toThrow();
    expect(() => simulation.advance(-1)).toThrow();
  });
  it("keeps every flow on the current terrain through regrouping and preserves endpoints", () => {
    const simulation = new ActivitySimulation(fixtureHosts);
    simulation.advance(3);
    const flow = simulation
      .snapshot()
      .transfers.find((item) => item.kind === "request")!;
    const grouped = projectWells(fixtureHosts, "custom", { electra: "home" });
    expect(transferMatchesSelection(flow, "electra", grouped)).toBe(true);
    expect(transferMatchesSelection(flow, "electra/Web", grouped)).toBe(true);
    expect(transferMatchesSelection(flow, "sector-home", grouped)).toBe(true);
    expect(transferMatchesSelection(flow, "titan", grouped)).toBe(false);
    for (const mode of ["hosts", "projects", "custom"] as const) {
      const wells = projectWells(fixtureHosts, mode, { electra: "home" });
      for (const flow of simulation.snapshot().transfers) {
        for (const progress of [0, 0.25, 0.5, 0.9, 1]) {
          const point = transferPoint(flow, progress, wells)!;
          expect(Number.isFinite(point.x + point.y + point.z)).toBe(true);
          expect(point.y).toBeGreaterThan(
            surfaceHeight(point.x, point.z, wells),
          );
        }
        if (flow.phase !== "processing") {
          const start = transferPoint(flow, 0, wells)!;
          const end = transferPoint(flow, 1, wells)!;
          expect(start.x).toBeCloseTo(
            wells.find((well) => well.id === flow.from)!.x,
          );
          expect(end.x).toBeCloseTo(
            wells.find((well) => well.id === flow.to)!.x,
          );
        }
      }
    }
  });
});
