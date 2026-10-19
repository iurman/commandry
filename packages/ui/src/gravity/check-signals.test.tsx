// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  CheckSignalOverlay,
  checkSignalCurve,
  checkSignalPoint,
} from "./check-signals";
import type { RecordedCheckRoute, CheckEndpoint } from "./check-signals";
import type { ActivitySnapshot, Transfer } from "./activity-types";

const endpoints: Record<string, CheckEndpoint> = {
  source: {
    id: "source",
    label: "Checking host",
    x: 350,
    y: 140,
    width: 110,
    height: 36,
  },
  target: {
    id: "target",
    label: "Checked service",
    x: 430,
    y: 320,
    width: 130,
    height: 36,
  },
};
const route: RecordedCheckRoute = {
  id: "real-observation",
  from: "source",
  to: "target",
  protocol: "http",
  responseTimeMs: 42,
  observedAt: "2026-10-19T03:00:00Z",
  failed: false,
};
const request: Transfer = {
  id: "request",
  correlationId: route.id,
  from: route.from,
  to: route.to,
  phase: "outbound",
  kind: "probe",
  start: 0,
  duration: 2.4,
  outcome: "ok",
  count: 1,
  attempt: 1,
  origin: "Recorded HTTP check",
  recorded: true,
};
const response: Transfer = {
  ...request,
  id: "response",
  phase: "response",
  from: route.to,
  to: route.from,
  start: 2.4,
};

describe("foreground health-check signals", () => {
  it("keeps the evidenced route visible at baseline, moves new packets outside the pins, and reverses a received reply", () => {
    const container = document.createElement("div");
    const overlay = new CheckSignalOverlay(container);
    const update = (snapshot: ActivitySnapshot, animate = true) =>
      overlay.update(
        [route],
        snapshot,
        (id) => endpoints[id] ?? null,
        889,
        480,
        animate,
      );
    update({ time: 0, transfers: [], events: [] });
    expect(overlay.element.querySelectorAll("[data-check-route]")).toHaveLength(
      1,
    );
    expect(
      overlay.element.querySelectorAll("[data-check-packet]"),
    ).toHaveLength(0);
    update({ time: 1.2, transfers: [request, response], events: [] });
    const packet = overlay.element.querySelector(
      '[data-check-packet="outbound"]',
    )!;
    expect(packet.textContent).toBe("HTTP request: Checked service");
    const midpoint = packet.getAttribute("transform");
    const curve = checkSignalCurve(endpoints.source!, endpoints.target!, 889);
    expect(checkSignalPoint(curve, 0.5).x).toBeGreaterThan(800);
    update({ time: 1.6, transfers: [request, response], events: [] });
    expect(packet.getAttribute("transform")).not.toBe(midpoint);
    update({ time: 3.6, transfers: [request, response], events: [] });
    const reply = overlay.element.querySelector(
      '[data-check-packet="response"]',
    )!;
    expect(reply.textContent).toBe("HTTP response: Checked service");
    const coordinates = (value: string) =>
      value.match(/-?[\d.]+/g)!.map(Number);
    coordinates(reply.getAttribute("transform")!).forEach((value, index) =>
      expect(value).toBeCloseTo(coordinates(midpoint!)[index]!, 6),
    );
    update({ time: 3.6, transfers: [request, response], events: [] }, false);
    expect(
      overlay.element.querySelectorAll("[data-check-packet]"),
    ).toHaveLength(0);
    expect(overlay.element.querySelectorAll("[data-check-route]")).toHaveLength(
      1,
    );
    update({ time: 5, transfers: [request, response], events: [] });
    expect(
      overlay.element.querySelectorAll("[data-check-packet]"),
    ).toHaveLength(0);
    overlay.dispose();
    expect(container.children).toHaveLength(0);
  });
  it("shows a real within-group check as a loop, preserves failures, and omits unavailable endpoints", () => {
    const overlay = new CheckSignalOverlay(document.createElement("div"));
    const local = { ...route, to: route.from, failed: true };
    overlay.update(
      [local],
      { time: 1, transfers: [{ ...request, to: route.from }], events: [] },
      (id) => endpoints[id] ?? null,
      889,
      480,
      true,
    );
    expect(
      overlay.element
        .querySelector("[data-check-route]")
        ?.getAttribute("data-failed"),
    ).toBe("true");
    const middle = checkSignalPoint(
      checkSignalCurve(endpoints.source!, endpoints.source!, 889),
      0.5,
    );
    expect(middle.x).toBeGreaterThan(800);
    overlay.update(
      [route],
      { time: 1, transfers: [request], events: [] },
      () => null,
      889,
      480,
      true,
    );
    expect(
      overlay.element.querySelectorAll(
        "[data-check-route], [data-check-packet]",
      ),
    ).toHaveLength(0);
    overlay.dispose();
  });
});
