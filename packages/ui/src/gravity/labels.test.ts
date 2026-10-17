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

const denseLabels = () =>
  Array.from({ length: 31 }, (_, index) => ({
    ...label(
      "dense-" + String(index).padStart(2, "0"),
      210 + (index % 6) * 58,
      130 + Math.floor(index / 6) * 39,
    ),
    attention: index === 3,
  }));
const denseSize = (index: number) => ({
  width: 110 + (index % 4) * 15,
  height: 32 + (index % 3) * 5,
});
const ordered = (positions: LabelPosition[]) =>
  [...positions].sort((a, b) => a.id.localeCompare(b.id));

const expectStable = (before: LabelPosition[], after: LabelPosition[]) => {
  const previous = ordered(before);
  const current = ordered(after);
  expect(current.map((item) => item.id)).toEqual(
    previous.map((item) => item.id),
  );
  current.forEach((item, index) => {
    const prior = previous[index]!;
    expect(
      Math.abs(item.x - prior.x) + Math.abs(item.y - prior.y),
    ).toBeLessThanOrEqual(0.05);
    expect(Math.abs(item.opacity - prior.opacity)).toBeLessThanOrEqual(0.002);
    expect(item.opacity > 0.5).toBe(prior.opacity > 0.5);
  });
};

describe("retained collision settling", () => {
  it.each([false, true])(
    "reaches an unchanged dense fixed point before sleeping with motion=%s",
    (motion) => {
      const layout = new LabelLayout();
      const input = denseLabels();
      input.forEach((item, index) => {
        const size = denseSize(index);
        layout.measure(item.id, size.width, size.height);
      });
      const solve = () =>
        layout.layout(input, 900, 500, 1 / 60, motion, 52, "dense-00");
      let result = solve();
      let frames = 1;
      while (layout.changing && frames < 600) {
        result = solve();
        frames++;
      }
      expect(layout.changing).toBe(false);
      expect(frames).toBeLessThan(600);
      expect(result.map((item) => item.id).sort()).toEqual(
        input.map((item) => item.id).sort(),
      );
      const shown = result.filter((item) => item.opacity > 0.5);
      expect(shown.length).toBeGreaterThan(0);
      for (let i = 0; i < shown.length; i++) {
        const a = shown[i]!;
        const aSize = denseSize(Number(a.id.slice(-2)));
        expect(a.x - aSize.width / 2).toBeGreaterThanOrEqual(7);
        expect(a.x + aSize.width / 2).toBeLessThanOrEqual(893);
        expect(a.y - aSize.height).toBeGreaterThanOrEqual(51);
        expect(a.y).toBeLessThanOrEqual(472);
        for (let j = i + 1; j < shown.length; j++) {
          const b = shown[j]!;
          const bSize = denseSize(Number(b.id.slice(-2)));
          expect(
            Math.abs(a.x - b.x) >= (aSize.width + bSize.width) / 2 + 6 ||
              Math.abs(a.y - aSize.height / 2 - b.y + bSize.height / 2) >=
                (aSize.height + bSize.height) / 2 + 6,
          ).toBe(true);
        }
      }
      const settled = result;
      for (let refresh = 0; refresh < 6; refresh++) {
        result = solve();
        expect(layout.changing).toBe(false);
        expectStable(settled, result);
      }
      expect(frames).toBeGreaterThan(1);
    },
  );

  it.each([false, true])(
    "settles fresh measurements, viewport changes, moved anchors and removals with motion=%s",
    (motion) => {
      const layout = new LabelLayout();
      const settle = (input: LabelPosition[], width = 900, height = 500) => {
        let result = layout.layout(input, width, height, 1 / 60, motion);
        let frames = 1;
        while (layout.changing && frames < 600) {
          result = layout.layout(input, width, height, 1 / 60, motion);
          frames++;
        }
        expect(layout.changing).toBe(false);
        expect(frames).toBeLessThan(600);
        expectStable(
          result,
          layout.layout(input, width, height, 1 / 60, motion),
        );
        return result;
      };
      const input = [label("a", 200, 160), label("b", 600, 260)];
      layout.measure("a", 110, 42);
      layout.measure("b", 110, 42);
      expect(settle(input).every((item) => item.opacity > 0.99)).toBe(true);

      expect(layout.measure("a", 300, 70)).toBe(true);
      expect(layout.measure("a", 300, 70)).toBe(false);
      const narrowed = settle(input, 360, 280);
      expect(narrowed.find((item) => item.id === "a")!.x).toBeLessThanOrEqual(
        202.05,
      );
      expect(narrowed.find((item) => item.id === "b")!.x).toBeLessThanOrEqual(
        297.05,
      );
      expect(narrowed.some((item) => item.opacity > 0.99)).toBe(true);

      const moved = [label("a", 600, 240), label("b", 180, 160)];
      const restored = settle(moved);
      restored.forEach((item) => {
        const anchor = moved.find((candidate) => candidate.id === item.id)!;
        expect(
          Math.abs(item.x - anchor.x) + Math.abs(item.y - anchor.y),
        ).toBeLessThanOrEqual(0.05);
      });
      expect(settle([moved[0]!]).map((item) => item.id)).toEqual(["a"]);
      expect(layout.measure("b", 110, 42)).toBe(true);
    },
  );

  it.each([false, true])(
    "keeps lens and landscape collision offsets separate with motion=%s",
    (motion) => {
      const layout = new LabelLayout();
      const input = [
        label("landscape", 200, 160),
        label("lens-service", 200, 160),
      ];
      let result = layout.layout(
        input,
        900,
        500,
        1 / 60,
        motion,
        52,
        "service",
      );
      for (let frame = 0; layout.changing && frame < 600; frame++)
        result = layout.layout(input, 900, 500, 1 / 60, motion, 52, "service");
      expect(layout.changing).toBe(false);
      for (const item of result) {
        expect(item.x).toBe(200);
        expect(item.y).toBe(160);
      }
      expect(
        result.find((item) => item.id === "lens-service")!.opacity,
      ).toBeGreaterThan(0.99);
      expect(result.find((item) => item.id === "landscape")!.opacity).toBe(0);
      expectStable(
        result,
        layout.layout(input, 900, 500, 1 / 60, motion, 52, "service"),
      );
    },
  );
});
