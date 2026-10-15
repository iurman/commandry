import { expect, test } from "vitest";
import type { InfrastructureSource } from "@commandry/contracts";
import {
  createInfrastructureOverviewService,
  infrastructureTelemetry,
} from "./infrastructure-overview";
const now = new Date("2026-10-15T15:00:00Z");
const source: InfrastructureSource = {
  id: crypto.randomUUID(),
  name: "Host receiver",
  kind: "linux-host",
  enabled: true,
  observedAt: "2026-10-15T14:59:00Z",
  freshnessWindowMinutes: 5,
  error: null,
};
test("freshness distinguishes missing, disabled, stale, future and failing sources", () => {
  expect(infrastructureTelemetry([], now)).toBe("unknown");
  expect(infrastructureTelemetry([source], now)).toBe("reporting");
  expect(infrastructureTelemetry([{ ...source, observedAt: null }], now)).toBe(
    "unknown",
  );
  expect(infrastructureTelemetry([{ ...source, enabled: false }], now)).toBe(
    "disabled",
  );
  expect(
    infrastructureTelemetry(
      [{ ...source, observedAt: "2026-10-15T14:54:59Z" }],
      now,
    ),
  ).toBe("stale");
  expect(
    infrastructureTelemetry(
      [{ ...source, observedAt: "2026-10-15T15:01:00Z" }],
      now,
    ),
  ).toBe("future");
  expect(
    infrastructureTelemetry([source, { ...source, error: "POLL_FAILED" }], now),
  ).toBe("error");
  expect(
    infrastructureTelemetry([source, { ...source, observedAt: null }], now),
  ).toBe("unknown");
});
test("a fresh host sample never promotes a host or child service to healthy", async () => {
  const result = await createInfrastructureOverviewService(
    {
      read: async () => ({
        total: 2,
        nextCursor: null,
        edges: [],
        events: [],
        items: [
          {
            id: crypto.randomUUID(),
            name: "Host",
            kind: "host",
            parentResourceId: null,
            projects: [],
            sources: [source],
            metrics: [],
          },
          {
            id: crypto.randomUUID(),
            name: "Web",
            kind: "service",
            parentResourceId: null,
            projects: [],
            sources: [],
            metrics: [],
          },
        ],
      }),
    },
    () => now,
  ).read({ limit: 12, q: "" });
  expect(result.items.map((item) => item.health)).toEqual([
    "unknown",
    "unknown",
  ]);
  expect(result.items.map((item) => item.telemetry)).toEqual([
    "reporting",
    "unknown",
  ]);
  expect(result.readAt).toBe(now.toISOString());
});
