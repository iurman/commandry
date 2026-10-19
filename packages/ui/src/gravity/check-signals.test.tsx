// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  CheckSignalOverlay,
  checkSignalCurve,
  checkSignalPoint,
} from "./check-signals";
import type { RecordedCheckRoute, CheckEndpoint } from "./check-signals";
import type { Transfer } from "./activity-types";

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

describe("quiet recorded check signals", () => {
  it("starts without paths or packets, moves a short dot trail and retraces a received reply", () => {
    const container = document.createElement("div");
    const overlay = new CheckSignalOverlay(container);
    const update = (
      time: number,
      transfers = [request, response],
      animate = true,
    ) =>
      overlay.update(
        [route],
        { time, transfers, events: [] },
        (id) => endpoints[id] ?? null,
        889,
        480,
        animate,
      );
    update(0, []);
    expect(
      overlay.element
        .querySelector("path.cmd-check-inspection-guide")
        ?.getAttribute("d"),
    ).toBe("");
    expect(
      overlay.element.querySelectorAll("[data-check-packet]"),
    ).toHaveLength(0);
    update(1.2);
    const packet = overlay.element.querySelector(
      '[data-check-packet="outbound"]',
    )!;
    expect(
      packet.querySelectorAll("circle:not(.cmd-check-arrival)"),
    ).toHaveLength(3);
    expect(packet.querySelector("path, text")).toBeNull();
    const midpoint = packet.getAttribute("transform");
    const curve = checkSignalCurve(endpoints.source!, endpoints.target!, 889);
    expect(checkSignalPoint(curve, 0.5).x).toBeGreaterThan(300);
    expect(checkSignalPoint(curve, 0.5).x).toBeLessThan(480);
    update(1.6);
    expect(packet.getAttribute("transform")).not.toBe(midpoint);
    update(3.6);
    const reply = overlay.element.querySelector(
      '[data-check-packet="response"]',
    )!;
    const coordinates = (value: string) =>
      value.match(/-?[\d.]+/g)!.map(Number);
    coordinates(reply.getAttribute("transform")!).forEach((value, index) =>
      expect(value).toBeCloseTo(coordinates(midpoint!)[index]!, 6),
    );
    update(3.6, [request, response], false);
    expect(
      overlay.element.querySelectorAll("[data-check-packet]"),
    ).toHaveLength(0);
    expect(container.querySelectorAll("button")).toHaveLength(0);
    update(5);
    expect(
      overlay.element.querySelectorAll("[data-check-packet]"),
    ).toHaveLength(0);
    overlay.dispose();
    expect(container.children).toHaveLength(0);
  });
  it("holds a hovered dot and exposes its actual evidence on selection, with one inspection guide", () => {
    const container = document.createElement("div"),
      inspect = vi.fn(),
      invalidate = vi.fn();
    const overlay = new CheckSignalOverlay(container, inspect, invalidate);
    const update = (time: number) =>
      overlay.update(
        [route],
        { time, transfers: [request], events: [] },
        (id) => endpoints[id] ?? null,
        889,
        480,
        true,
      );
    update(1);
    const hit = container.querySelector("button")!;
    expect(hit.getAttribute("aria-label")).toContain("42 ms, passing");
    const packet = overlay.element.querySelector("[data-check-packet]")!;
    const point = packet.getAttribute("transform");
    hit.dispatchEvent(new Event("pointerenter"));
    expect(invalidate).toHaveBeenCalledTimes(1);
    update(1.9);
    expect(packet.getAttribute("transform")).toBe(point);
    expect(
      overlay.element
        .querySelector(".cmd-check-inspection-guide")
        ?.getAttribute("d"),
    ).not.toBe("");
    update(8);
    expect(container.querySelector("button")).toBe(hit);
    hit.click();
    expect(inspect).toHaveBeenCalledWith({
      route,
      fromLabel: "Checking host",
      toLabel: "Checked service",
      phase: "outbound",
    });
    hit.dispatchEvent(new Event("pointerleave"));
    expect(invalidate).toHaveBeenCalledTimes(2);
    update(9);
    expect(container.querySelector("button")).toBeNull();
    expect(
      overlay.element
        .querySelector(".cmd-check-inspection-guide")
        ?.getAttribute("d"),
    ).toBe("");
    overlay.dispose();
  });
  it("keeps only the selected guide while paused and clears removed or redacted evidence", () => {
    const container = document.createElement("div"),
      overlay = new CheckSignalOverlay(container);
    overlay.update(
      [route],
      { time: 1, transfers: [request], events: [] },
      (id) => endpoints[id] ?? null,
      889,
      480,
      false,
      [],
      route,
    );
    expect(
      overlay.element
        .querySelector(".cmd-check-inspection-guide")
        ?.getAttribute("d"),
    ).not.toBe("");
    expect(container.querySelector("button")).toBeNull();
    overlay.update(
      [route],
      { time: 1, transfers: [request], events: [] },
      () => null,
      889,
      480,
      true,
      [],
      route,
    );
    expect(
      overlay.element
        .querySelector(".cmd-check-inspection-guide")
        ?.getAttribute("d"),
    ).toBe("");
    expect(overlay.element.querySelector("[data-check-packet]")).toBeNull();
    overlay.dispose();
  });
  it("shows a contained check as a short local loop and retains a failed response", () => {
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
        .querySelector("[data-check-packet]")
        ?.getAttribute("data-failed"),
    ).toBe("true");
    const middle = checkSignalPoint(
      checkSignalCurve(endpoints.source!, endpoints.source!, 889),
      0.5,
    );
    expect(Math.abs(middle.x - endpoints.source!.x)).toBeLessThan(50);
    expect(middle.y).toBeGreaterThan(endpoints.source!.y);
    overlay.dispose();
  });
});
