import { describe, expect, it } from "vitest";
import { positionFloatingSurface } from "./floating-position";
import type { FloatingPositionOptions } from "./floating-position";

const base: FloatingPositionOptions = {
  anchor: { left: 450, top: 350, width: 100, height: 40 },
  surface: { width: 300, height: 240 },
  viewport: { left: 0, top: 0, width: 1000, height: 800 },
};
describe("floating placement", () => {
  it.each([
    ["top", 450, 102],
    ["bottom", 450, 398],
    ["left", 142, 350],
    ["right", 558, 350],
  ] as const)("places on the requested %s side", (side, left, top) => {
    expect(positionFloatingSurface({ ...base, side })).toMatchObject({
      side,
      left,
      top,
      width: 300,
      height: 240,
      presentation: "anchored",
    });
  });
  it.each([
    ["bottom", "top", { left: 450, top: 750, width: 100, height: 40 }],
    ["top", "bottom", { left: 450, top: 10, width: 100, height: 40 }],
    ["left", "right", { left: 10, top: 350, width: 100, height: 40 }],
    ["right", "left", { left: 950, top: 350, width: 40, height: 40 }],
  ] as const)("flips %s at a viewport edge", (side, expected, anchor) => {
    expect(positionFloatingSurface({ ...base, anchor, side }).side).toBe(
      expected,
    );
  });
  it("shifts an end-aligned panel back inside a wrapping boundary", () => {
    const result = positionFloatingSurface({
      ...base,
      anchor: { left: 12, top: 300, width: 80, height: 36 },
      align: "end",
    });
    expect(result.left).toBe(8);
    expect(result.left + result.width).toBeLessThanOrEqual(992);
  });
  it("uses visual viewport offsets and safe areas when zoomed or above a keyboard", () => {
    const result = positionFloatingSurface({
      ...base,
      viewport: { left: 170, top: 290, width: 390, height: 260 },
      safeArea: { top: 12, right: 10, bottom: 24, left: 6 },
      surface: { width: 700, height: 1000 },
    });
    expect(result).toMatchObject({
      left: 184,
      top: 310,
      width: 358,
      height: 208,
      maxHeight: 208,
      presentation: "sheet",
    });
  });
  it.each([320, 390, 768, 974, 1280, 1920, 3840])(
    "keeps long content reachable at %ipx",
    (width) => {
      const result = positionFloatingSurface({
        ...base,
        anchor: { left: width - 70, top: 400, width: 60, height: 40 },
        viewport: { left: 0, top: 0, width, height: 720 },
        surface: { width: 620, height: 3000 },
      });
      expect(result.width).toBeGreaterThan(0);
      expect(result.maxHeight).toBeGreaterThan(0);
      expect(result.left).toBeGreaterThanOrEqual(8);
      expect(result.top).toBeGreaterThanOrEqual(8);
      expect(result.left + result.width).toBeLessThanOrEqual(width - 8);
      expect(result.top + result.height).toBeLessThanOrEqual(712);
      expect(result.presentation).toBe(width <= 480 ? "sheet" : "anchored");
    },
  );
  it("resizes on the roomier side when neither side fits", () => {
    const result = positionFloatingSurface({
      ...base,
      surface: { width: 300, height: 3000 },
    });
    expect(result.height).toBe(394);
    expect(result.maxHeight).toBe(394);
    expect(result.top + result.height).toBe(792);
  });
  it("centers on the cross axis", () => {
    expect(positionFloatingSurface({ ...base, align: "center" }).left).toBe(
      350,
    );
    expect(
      positionFloatingSurface({ ...base, side: "left", align: "end" }).top,
    ).toBe(150);
  });
  it("retains usable dimensions after an anchor scrolls outside the viewport", () => {
    const result = positionFloatingSurface({
      ...base,
      anchor: { left: -1000, top: -1000, width: 80, height: 30 },
    });
    expect(result.left).toBe(8);
    expect(result.width).toBe(300);
    expect(result.height).toBe(240);
  });
  it("falls back to a sheet when an anchor covers all available primary space", () => {
    expect(
      positionFloatingSurface({
        ...base,
        anchor: { left: 0, top: 0, width: 1000, height: 800 },
      }).presentation,
    ).toBe("sheet");
  });
  it("supports explicitly anchored narrow panels and explicitly requested sheets", () => {
    expect(
      positionFloatingSurface({
        ...base,
        viewport: { left: 0, top: 0, width: 320, height: 800 },
        presentation: "anchored",
      }).presentation,
    ).toBe("anchored");
    expect(
      positionFloatingSurface({ ...base, presentation: "sheet" }).width,
    ).toBe(984);
  });
  it("documents the zero-viewport failure boundary with finite nonnegative dimensions", () => {
    const result = positionFloatingSurface({
      ...base,
      viewport: { left: 15, top: 20, width: 0, height: 0 },
      safeArea: { left: 50, top: 50, right: 50, bottom: 50 },
    });
    expect(result).toMatchObject({
      left: 15,
      top: 20,
      width: 0,
      height: 0,
      maxWidth: 0,
      maxHeight: 0,
    });
    for (const item of [result.left, result.top, result.width, result.height])
      expect(Number.isFinite(item)).toBe(true);
  });
  it("normalizes invalid geometry without publishing NaN CSS coordinates", () => {
    const result = positionFloatingSurface({
      ...base,
      anchor: { left: NaN, top: Infinity, width: -1, height: NaN },
      surface: { width: Infinity, height: -10 },
      gap: -3,
    });
    expect(result).toMatchObject({ left: 8, top: 8, width: 0, height: 0 });
  });
});
