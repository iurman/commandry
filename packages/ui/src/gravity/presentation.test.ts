import { describe, expect, it } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import type { Well } from "./model";
import { fittedLandscapePose, landscapeBounds } from "./presentation";

const well = (id: string, kind: Well["kind"], x: number, z: number): Well => ({
  id,
  label: id,
  kind,
  x,
  z,
  hostId: null,
  sector: "fleet",
  radius: 2,
  depth: 3,
  aspect: 1.3,
  angle: 0.4,
  elevation: 1,
  profile: 1,
  attention: false,
});

describe("complete landscape composition", () => {
  const wells = [
    well("host", "host", 0, 0),
    well("distant-child", "service", 72, -40),
    well("sector", "project", -65, 55),
  ];
  it("includes non-host fields in the landscape even when no hosts exist", () => {
    const bounds = landscapeBounds(wells.slice(1));
    for (const item of wells.slice(1)) {
      expect(
        Math.abs(item.x - bounds.center.x) + item.radius,
      ).toBeLessThanOrEqual(bounds.half.x);
      expect(
        Math.abs(item.z - bounds.center.z) + item.radius,
      ).toBeLessThanOrEqual(bounds.half.z);
    }
  });
  it.each([320 / 720, 390 / 844, 16 / 9, 32 / 9])(
    "fits all occupied footprints at aspect %s",
    (aspect) => {
      for (const azimuth of [0.18, 1.8, 4.4]) {
        const pose = fittedLandscapePose(wells, aspect, azimuth);
        const camera = new PerspectiveCamera(40, aspect, 0.1, 10000);
        camera.position.set(pose.position.x, pose.position.y, pose.position.z);
        camera.lookAt(pose.target.x, pose.target.y, pose.target.z);
        camera.updateMatrixWorld();
        for (const item of wells) {
          const radius = item.radius * Math.max(1, item.aspect) * 1.7;
          for (const x of [-radius, radius])
            for (const z of [-radius, radius])
              for (const y of [-5, 5]) {
                const point = new Vector3(item.x + x, y, item.z + z).project(
                  camera,
                );
                expect(Math.abs(point.x)).toBeLessThan(1);
                expect(Math.abs(point.y)).toBeLessThan(1);
                expect(point.z).toBeLessThan(1);
              }
        }
      }
    },
  );
});
