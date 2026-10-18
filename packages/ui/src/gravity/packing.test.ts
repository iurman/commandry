import { describe, expect, it } from "vitest";
import { enclose, packCircles, type Circle } from "./packing";

const overlaps = (circles: readonly Circle[]) => {
  let count = 0;
  for (let i = 0; i < circles.length; i++)
    for (let j = i + 1; j < circles.length; j++) {
      const a = circles[i]!,
        b = circles[j]!;
      if (Math.hypot(a.x - b.x, a.z - b.z) < a.r + b.r - 1e-6) count++;
    }
  return count;
};

describe("sibling circle packing", () => {
  it.each([1, 2, 3, 7, 48, 300])(
    "packs %i equal circles without overlap inside a tight bound",
    (count) => {
      const circles = Array.from({ length: count }, () => ({
        r: 0.6,
        x: 0,
        z: 0,
      }));
      packCircles(circles);
      expect(overlaps(circles)).toBe(0);
      const bound = enclose(circles);
      for (const circle of circles)
        expect(
          Math.hypot(circle.x - bound.x, circle.z - bound.z) + circle.r,
        ).toBeLessThanOrEqual(bound.r + 1e-9);
      // Hexagonal density is about 0.9; a front chain stays well above 0.5.
      expect((count * 0.36) / bound.r ** 2).toBeGreaterThan(
        count > 2 ? 0.5 : 0.25,
      );
    },
  );
  it("packs mixed sizes deterministically without overlap", () => {
    const sizes = [5, 0.4, 2, 0.4, 0.4, 1.2, 3, 0.4, 0.8, 0.4];
    const run = () => {
      const circles = sizes.map((r) => ({ r, x: 0, z: 0 }));
      packCircles(circles);
      return circles;
    };
    const first = run();
    expect(overlaps(first)).toBe(0);
    expect(run()).toEqual(first);
  });
  it("encloses nothing as an empty circle", () => {
    expect(enclose([])).toEqual({ r: 0, x: 0, z: 0 });
  });
});
