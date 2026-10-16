import { describe, expect, it } from "vitest";
import { LabelLayout, type LabelPosition } from "./labels";

const label = (id: string, x = 450, y = 160): LabelPosition => ({
  id,
  x,
  y,
  visible: true,
  opacity: 0,
});
describe("complete-scene label density", () => {
  it("retains every identity but admits only non-overlapping labels within the actual viewport", () => {
    const layout = new LabelLayout();
    const input = Array.from({ length: 137 }, (_, i) => label(`resource-${i}`));
    for (const item of input) layout.measure(item.id, 110, 42);
    const result = layout.layout(input, 900, 300, 1 / 60, false);
    expect(result.map((item) => item.id).sort()).toEqual(
      input.map((item) => item.id).sort(),
    );
    const shown = result.filter((item) => item.opacity > 0.5);
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.length).toBeLessThan(input.length);
    for (let i = 0; i < shown.length; i++) {
      expect(shown[i]!.x).toBeGreaterThanOrEqual(55);
      expect(shown[i]!.y).toBeGreaterThanOrEqual(73);
      for (let j = i + 1; j < shown.length; j++)
        expect(
          Math.abs(shown[i]!.x - shown[j]!.x) >= 116 ||
            Math.abs(shown[i]!.y - shown[j]!.y) >= 48,
        ).toBe(true);
    }
  });
  it("prioritizes the selected resource over an already visible colliding label", () => {
    const layout = new LabelLayout();
    layout.measure("selected", 300, 70);
    layout.measure("other", 300, 70);
    layout.layout([label("other", 160, 100)], 320, 180, 1, false);
    const result = layout.layout(
      [label("other", 160, 100), label("selected", 160, 100)],
      320,
      180,
      1,
      false,
      52,
      "selected",
    );
    expect(result.find((item) => item.id === "selected")?.opacity).toBe(1);
    expect(result.find((item) => item.id === "other")?.opacity).toBe(0);
  });
  it("keeps uncluttered moving labels visible and hides oversized labels without losing their identities", () => {
    const layout = new LabelLayout();
    const input = [label("a", 200, 100), label("b", 650, 200)];
    for (let i = 0; i < 90; i++) {
      const result = layout.layout(
        input.map((item) => ({ ...item, x: item.x + Math.sin(i / 30) * 2 })),
        900,
        400,
        1 / 60,
        true,
      );
      if (i > 30) expect(result.every((item) => item.opacity > 0.9)).toBe(true);
    }
    layout.measure("too-wide", 500, 42);
    const result = layout.layout(
      [label("too-wide", 150, 100)],
      300,
      200,
      1,
      false,
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.opacity).toBe(0);
  });
  it("admits an attention label ahead of a retained ordinary label when space is full", () => {
    const layout = new LabelLayout();
    layout.measure("a-normal", 300, 70);
    layout.measure("z-attention", 300, 70);
    layout.layout([label("a-normal", 160, 100)], 320, 180, 1, false);
    const result = layout.layout(
      [
        label("a-normal", 160, 100),
        { ...label("z-attention", 160, 100), attention: true },
      ],
      320,
      180,
      1,
      false,
    );
    expect(result.find((item) => item.id === "z-attention")?.opacity).toBe(1);
    expect(result.find((item) => item.id === "a-normal")?.opacity).toBe(0);
  });
});
