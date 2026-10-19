import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { ActivityRenderer, transferPoint } from "./activity-renderer";
import type { ActivitySnapshot, Transfer } from "./activity-types";
import type { Well } from "./model";

const wells: Well[] = ["checker", "target"].map((id, index) => ({
  id,
  label: id,
  kind: "host",
  hostId: null,
  sector: "infrastructure",
  x: index * 16,
  z: 0,
  radius: 1,
  depth: 1,
  aspect: 1,
  angle: 0,
  elevation: 0,
  profile: 2.4,
  attention: false,
}));
const probe: Transfer = {
  id: "observed-check",
  correlationId: "observed-check",
  from: "checker",
  to: "target",
  kind: "probe",
  phase: "outbound",
  start: 0,
  duration: 1.2,
  outcome: "ok",
  count: 1,
  attempt: 1,
  origin: "Recorded HTTP result",
  recorded: true,
};
const palette = {
  reporting: "#4e9d9a",
  unhealthy: "#bd4b51",
  attention: "#ca812e",
};
function draw(snapshot: ActivitySnapshot, worldUnitsPerPixel = 0) {
  const renderer = new ActivityRenderer();
  renderer.update(
    snapshot,
    wells,
    palette,
    null,
    null,
    false,
    0,
    false,
    true,
    1,
    worldUnitsPerPixel,
  );
  return renderer;
}

describe("recorded probe rendering", () => {
  it("keeps recorded corridors at least 2.5 screen pixels wide as the overview zooms out", () => {
    for (const units of [0.1, 0.5, 2]) {
      const renderer = draw(
        { time: 0.6, transfers: [probe], events: [] },
        units,
      );
      const mesh = renderer.group.children.find(
        (child) => child instanceof THREE.Mesh,
      ) as THREE.Mesh;
      const positions = mesh.geometry.getAttribute("position");
      const a = new THREE.Vector3().fromBufferAttribute(positions, 0);
      const b = new THREE.Vector3().fromBufferAttribute(positions, 1);
      expect(a.distanceTo(b) / units).toBeCloseTo(2.5, 4);
      renderer.dispose();
    }
  });
  it("bends short recorded paths clear of endpoint labels and retraces the response", () => {
    const middle = transferPoint(probe, 0.5, wells, 0, 0, 0.5)!;
    expect(Math.abs(middle.z)).toBeGreaterThanOrEqual(16);
    const response = { ...probe, from: probe.to, to: probe.from };
    expect(transferPoint(response, 0.5, wells, 0, 0, 0.5)).toEqual(middle);
    expect(
      Math.abs(
        transferPoint({ ...probe, recorded: false }, 0.5, wells, 0, 0, 0.5)!.z,
      ),
    ).toBeLessThan(2);
  });
  it("gives real checks a visible corridor and body while keeping background probes quiet", () => {
    const recorded = draw({ time: 0.9, transfers: [probe], events: [] });
    const quiet = draw({
      time: 0.9,
      transfers: [{ ...probe, recorded: false }],
      events: [],
    });
    const mesh = (renderer: ActivityRenderer) =>
      renderer.group.children.find(
        (child) => child instanceof THREE.Mesh,
      ) as THREE.Mesh;
    expect(mesh(recorded).geometry.drawRange.count).toBeGreaterThan(0);
    expect(mesh(quiet).geometry.drawRange.count).toBe(0);
    recorded.dispose();
    quiet.dispose();
  });
  it("does not draw a response before its replay phase or after it expires", () => {
    const response: Transfer = {
      ...probe,
      phase: "response",
      from: "target",
      to: "checker",
      start: 1.2,
    };
    for (const [time, visible] of [
      [0.9, false],
      [1.8, true],
      [2.5, false],
    ] as const) {
      const renderer = draw({ time, transfers: [response], events: [] });
      expect(renderer.group.visible).toBe(visible);
      renderer.dispose();
    }
  });
});
