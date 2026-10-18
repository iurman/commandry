import { describe, expect, it } from "vitest";
import { basinField, floorSwell, surfaceHeight, type Well } from "./model";

const pool: Well = {
  id: "pool",
  label: "Pool",
  kind: "project",
  hostId: null,
  sector: "pool",
  x: 10,
  z: -6,
  radius: 3,
  depth: 0.4,
  aspect: 1,
  angle: 0,
  elevation: 0,
  profile: 2.4,
  attention: false,
  pool: true,
};

describe("calmed floor swell", () => {
  it("keeps a shallow pool's contours concentric instead of following the swell", () => {
    const ring = (wells: Well[]) => {
      const heights = Array.from({ length: 24 }, (_, index) => {
        const angle = (index / 24) * Math.PI * 2;
        const x = pool.x + Math.cos(angle) * pool.radius * 0.5,
          z = pool.z + Math.sin(angle) * pool.radius * 0.5;
        return wells.length
          ? surfaceHeight(x, z, wells)
          : floorSwell(x, z) + basinField(x, z, [pool]).height;
      });
      return Math.max(...heights) - Math.min(...heights);
    };
    // Without calming, the swell tilts the floor by more than one contour band.
    expect(ring([])).toBeGreaterThan(1 / 11);
    expect(ring([pool])).toBeLessThan(0.03);
  });
  it("leaves the open floor unchanged and matches the summed basin relief", () => {
    const far = { x: pool.x + 40, z: pool.z - 25 };
    expect(surfaceHeight(far.x, far.z, [pool])).toBeCloseTo(
      floorSwell(far.x, far.z),
      6,
    );
    const field = basinField(pool.x, pool.z, [pool]);
    expect(field.calm).toBeGreaterThanOrEqual(4 * 0.999);
    expect(surfaceHeight(pool.x, pool.z, [pool])).toBeCloseTo(
      floorSwell(pool.x, pool.z) * Math.exp(-field.calm) + field.height,
      12,
    );
  });
});
