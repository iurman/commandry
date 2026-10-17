import { describe, expect, it, vi } from "vitest";
import {
  createOperationalObservationPoller,
  OperationalSourceError,
  boundedOperationalRetrySeconds,
} from "./observatory-observations";
import type {
  OperationalObservation,
  OperationalSourceClaim,
  OperationalSourcePort,
} from "./observatory-observations";
import {
  observatoryFixtureId,
  observatoryFixtureSignal,
} from "../../../tests/fixtures/observatory";

const at = "2026-10-16T12:00:00.000Z";
function fixture() {
  const claim: OperationalSourceClaim = {
    id: observatoryFixtureId(1),
    leaseId: "lease-one",
    resourceId: observatoryFixtureId(2),
    kind: "infraagent-monitor",
    externalId: "monitor-one",
    freshnessSeconds: 300,
    environment: "production",
  };
  const observation: OperationalObservation = {
    sourceId: claim.id,
    resourceId: claim.resourceId,
    observedAt: at,
    signals: [
      {
        ...observatoryFixtureSignal(
          claim.resourceId,
          "actual-check",
          "failing",
        ),
        sourceId: claim.id,
      },
    ],
    details: { sourceState: "available" },
    rawPayload: { success: true, sourceRecord: "synthetic" },
  };
  const port: OperationalSourcePort = {
    claim: vi.fn(async () => claim),
    complete: vi.fn(async () => {}),
    fail: vi.fn(async () => {}),
  };
  const clock = { now: () => new Date("2026-10-16T12:00:01.000Z") };
  return { claim, observation, port, clock };
}
describe("leased operational observation poll orchestration", () => {
  it("does no read or write when no source lease is available", async () => {
    const f = fixture();
    vi.mocked(f.port.claim).mockResolvedValue(null);
    const read = vi.fn();
    expect(
      await createOperationalObservationPoller(
        f.port,
        read,
        f.clock,
      ).pollNext(),
    ).toBe(false);
    expect(read).not.toHaveBeenCalled();
    expect(f.port.complete).not.toHaveBeenCalled();
    expect(f.port.fail).not.toHaveBeenCalled();
  });
  it("appends the exact failing evidence once without replacing observation time or incident identity", async () => {
    const f = fixture();
    const read = vi.fn(async () => f.observation);
    const poll = createOperationalObservationPoller(f.port, read, f.clock);
    expect(await poll.pollNext()).toBe(true);
    expect(f.port.claim).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith(f.claim);
    expect(f.port.complete).toHaveBeenCalledWith(f.claim, f.observation);
    expect(f.port.fail).not.toHaveBeenCalled();
    expect(
      vi.mocked(f.port.complete).mock.calls[0]?.[1].signals[0]?.state,
    ).toBe("failing");
    expect(vi.mocked(f.port.complete).mock.calls[0]?.[1].observedAt).toBe(at);
  });
  it("coalesces concurrent poll requests into one lease and one external read", async () => {
    const f = fixture();
    let release: (() => void) | undefined;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const read = vi.fn(async () => {
      await barrier;
      return f.observation;
    });
    const poll = createOperationalObservationPoller(f.port, read, f.clock);
    const first = poll.pollNext(),
      second = poll.pollNext();
    expect(first).toBe(second);
    release!();
    await Promise.all([first, second]);
    expect(f.port.claim).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledTimes(1);
    expect(f.port.complete).toHaveBeenCalledTimes(1);
    await poll.pollNext();
    expect(f.port.claim).toHaveBeenCalledTimes(2);
  });
  it.each([
    "source",
    "resource",
    "signal-source",
    "signal-resource",
    "environment",
    "freshness",
    "duplicate",
    "missing-time",
    "empty",
    "missing-raw",
    "future-pass",
  ])(
    "retains prior evidence and rejects malformed %s binding",
    async (mode) => {
      const f = fixture();
      const observation = structuredClone(f.observation);
      if (mode === "source") observation.sourceId = observatoryFixtureId(99);
      if (mode === "resource")
        observation.resourceId = observatoryFixtureId(99);
      if (mode === "signal-source")
        observation.signals[0]!.sourceId = observatoryFixtureId(99);
      if (mode === "signal-resource")
        observation.signals[0]!.resourceId = observatoryFixtureId(99);
      if (mode === "environment")
        observation.signals[0]!.environment = "development";
      if (mode === "freshness") observation.signals[0]!.freshnessMs = 1;
      if (mode === "duplicate")
        observation.signals.push(observation.signals[0]!);
      if (mode === "missing-time") observation.observedAt = null;
      if (mode === "empty") observation.signals = [];
      if (mode === "missing-raw") observation.rawPayload = null;
      if (mode === "future-pass") {
        observation.observedAt = "2026-10-16T13:00:00Z";
        observation.signals = [
          {
            ...observatoryFixtureSignal(
              f.claim.resourceId,
              "future",
              "passing",
            ),
            observedAt: observation.observedAt,
            sourceId: f.claim.id,
          },
        ];
      }
      await createOperationalObservationPoller(
        f.port,
        async () => observation,
        f.clock,
      ).pollNext();
      expect(f.port.fail).toHaveBeenCalledWith(
        f.claim,
        "OPERATIONAL_INVALID_OBSERVATION",
        60,
      );
      expect(f.port.complete).not.toHaveBeenCalled();
    },
  );
  it("allows explicitly unknown/disabled source coverage without inventing a measurement or deleting old signals", async () => {
    for (const details of [
      { sourceState: "unknown", reason: "pending" },
      { sourceState: "unknown", reason: "no_observation" },
      { sourceState: "disabled", reason: "paused" },
    ]) {
      const f = fixture();
      const observation = {
        ...f.observation,
        observedAt: null,
        signals: [],
        details,
      };
      await createOperationalObservationPoller(
        f.port,
        async () => observation,
        f.clock,
      ).pollNext();
      expect(f.port.complete).toHaveBeenCalledWith(f.claim, observation);
      expect(f.port.fail).not.toHaveBeenCalled();
    }
  });
  it("rejects invalid/mutated leases without completing or claiming a replacement", async () => {
    const invalid = fixture();
    invalid.claim.freshnessSeconds = 0;
    const read = vi.fn(async () => invalid.observation);
    await createOperationalObservationPoller(
      invalid.port,
      read,
      invalid.clock,
    ).pollNext();
    expect(read).not.toHaveBeenCalled();
    expect(invalid.port.complete).not.toHaveBeenCalled();
    expect(invalid.port.claim).toHaveBeenCalledTimes(1);
    const changed = fixture();
    await createOperationalObservationPoller(
      changed.port,
      async () => {
        changed.claim.resourceId = observatoryFixtureId(99);
        return changed.observation;
      },
      changed.clock,
    ).pollNext();
    expect(changed.port.complete).not.toHaveBeenCalled();
    expect(vi.mocked(changed.port.fail).mock.calls[0]?.[1]).toBe(
      "OPERATIONAL_INVALID_CLAIM",
    );
  });
  it("uses only safe bounded error codes, never provider messages or credentials", async () => {
    const f = fixture();
    await createOperationalObservationPoller(
      f.port,
      async () => {
        throw {
          code: "Bearer PRIVATE_KEY https://private.example",
          retrySeconds: Infinity,
        };
      },
      f.clock,
    ).pollNext();
    expect(f.port.fail).toHaveBeenCalledWith(
      f.claim,
      "OPERATIONAL_UNAVAILABLE",
      60,
    );
    const rate = fixture();
    await createOperationalObservationPoller(
      rate.port,
      async () => {
        throw new OperationalSourceError("OPERATIONAL_RATE_LIMITED", 999999999);
      },
      rate.clock,
    ).pollNext();
    expect(rate.port.fail).toHaveBeenCalledWith(
      rate.claim,
      "OPERATIONAL_RATE_LIMITED",
      86400,
    );
    const mutated = fixture();
    const error = new OperationalSourceError("OPERATIONAL_UNAVAILABLE");
    Object.assign(error, { code: "PRIVATE_PROVIDER_BODY", retrySeconds: NaN });
    await createOperationalObservationPoller(
      mutated.port,
      async () => {
        throw error;
      },
      mutated.clock,
    ).pollNext();
    expect(mutated.port.fail).toHaveBeenCalledWith(
      mutated.claim,
      "OPERATIONAL_UNAVAILABLE",
      60,
    );
    expect(boundedOperationalRetrySeconds(-1)).toBe(30);
  });
  it("does not misclassify persistence/audit failure as a source outage", async () => {
    const f = fixture();
    vi.mocked(f.port.complete).mockRejectedValue(
      new Error("synthetic persistence failure"),
    );
    await expect(
      createOperationalObservationPoller(
        f.port,
        async () => f.observation,
        f.clock,
      ).pollNext(),
    ).rejects.toThrow("synthetic persistence failure");
    expect(f.port.fail).not.toHaveBeenCalled();
  });
  it("rejects accessor-bearing observations without executing them", async () => {
    const f = fixture();
    let invoked = false;
    Object.defineProperty(f.observation.details, "unsafe", {
      enumerable: true,
      get() {
        invoked = true;
        return "PRIVATE";
      },
    });
    await createOperationalObservationPoller(
      f.port,
      async () => f.observation,
      f.clock,
    ).pollNext();
    expect(invoked).toBe(false);
    expect(f.port.complete).not.toHaveBeenCalled();
  });
});
