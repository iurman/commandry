import { describe, expect, it } from "vitest";
import {
  CalloutLayout,
  LABEL_RELEASE,
  LabelLayout,
  type CalloutPlacement,
  type LabelPosition,
  type LabelRect,
} from "./labels";

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

type CapturedLabel = LabelPosition & {
  label: string;
  kind: string;
  sector: string;
};
type CapturedLabels = {
  width: number;
  height: number;
  top: number;
  selected: string | null;
  anchors: CapturedLabel[];
  sizes: [number, number, number][];
  states: [number, number, number, number, boolean][];
  separations: [number, number, "x" | "y", number][];
};
// Exact built D02 input at frame 715, unchanged at frame 1429.
// Map keys use anchor indices solely to avoid repeating the captured alias IDs.
const stationaryCapture: CapturedLabels = {
  width: 727,
  height: 650,
  top: 99,
  selected: null,
  anchors: [
    {
      id: "group:operational:repositories",
      label: "Repositories",
      kind: "project",
      attention: false,
      sector: "group:operational:repositories",
      opacity: 0,
      x: 429.9747926289315,
      y: 314.193125661471,
      visible: true,
    },
    {
      id: "group:operational:shared-execution",
      label: "Shared execution targets",
      kind: "project",
      attention: true,
      sector: "group:operational:shared-execution",
      opacity: 0,
      x: 275.5748193095018,
      y: 335.9330166249334,
      visible: true,
    },
    {
      id: "group:operational:shared-project-references",
      label: "Shared project references",
      kind: "project",
      attention: false,
      sector: "group:operational:shared-project-references",
      opacity: 0,
      x: 238.81517842318715,
      y: 196.8515626287845,
      visible: true,
    },
    {
      id: "resource:00000000-0000-4000-8000-000000040001",
      label: "Synthetic provider 40001",
      kind: "project",
      attention: false,
      sector: "resource:00000000-0000-4000-8000-000000040001",
      opacity: 0,
      x: 473.8587832378019,
      y: 204.32835542666845,
      visible: true,
    },
    {
      id: "resource:00000000-0000-4000-8000-000000040002",
      label: "Synthetic provider 40002",
      kind: "project",
      attention: false,
      sector: "resource:00000000-0000-4000-8000-000000040002",
      opacity: 0,
      x: 597.1283585208087,
      y: 311.41308248384075,
      visible: true,
    },
    {
      id: "resource:00000000-0000-4000-8000-000000040003",
      label: "Synthetic host 40003",
      kind: "host",
      attention: true,
      sector: "resource:00000000-0000-4000-8000-000000040003",
      opacity: 0,
      x: 121.2436687775721,
      y: 360.21450012649046,
      visible: true,
    },
    {
      id: "resource:00000000-0000-4000-8000-000000040004",
      label: "Synthetic host 40004",
      kind: "host",
      attention: false,
      sector: "resource:00000000-0000-4000-8000-000000040004",
      opacity: 0,
      x: 417.7278092838517,
      y: 496.32035272859684,
      visible: true,
    },
    {
      id: "group:operational:references:00000000-0000-4000-8000-000000041000",
      label: "Operational project 1",
      kind: "project",
      attention: false,
      sector: "group:operational:shared-project-references",
      opacity: 0,
      x: 261.0661511136958,
      y: 179.95880748865548,
      visible: true,
    },
    {
      id: "group:operational:references:00000000-0000-4000-8000-000000041001",
      label: "Operational project 2",
      kind: "project",
      attention: false,
      sector: "group:operational:shared-project-references",
      opacity: 0,
      x: 239.20346382385304,
      y: 228.66545443395026,
      visible: true,
    },
    {
      id: "group:operational:references:00000000-0000-4000-8000-000000041002",
      label: "Operational project 3",
      kind: "project",
      attention: false,
      sector: "group:operational:shared-project-references",
      opacity: 0,
      x: 209.70663282740426,
      y: 176.09157984681036,
      visible: true,
    },
    {
      id: "reference:execution%3A00000000-0000-4000-8000-000000040001:00000000-0000-4000-8000-000000040008",
      label: "Synthetic deployment 40008",
      kind: "project",
      attention: false,
      sector: "resource:00000000-0000-4000-8000-000000040001",
      opacity: 0,
      x: 445.46990290542624,
      y: 198.58820667281066,
      visible: true,
    },
    {
      id: "reference:execution%3A00000000-0000-4000-8000-000000040003:00000000-0000-4000-8000-000000040008",
      label: "Synthetic deployment 40008",
      kind: "project",
      attention: false,
      sector: "resource:00000000-0000-4000-8000-000000040003",
      opacity: 0,
      x: 134.41843774561445,
      y: 392.52115446915786,
      visible: true,
    },
    {
      id: "resource:00000000-0000-4000-8000-000000040005",
      label: "Synthetic repository 40005",
      kind: "project",
      attention: false,
      sector: "group:operational:repositories",
      opacity: 0,
      x: 398.9997365534693,
      y: 307.7923176552026,
      visible: true,
    },
    {
      id: "resource:00000000-0000-4000-8000-000000040006",
      label: "Synthetic repository 40006",
      kind: "project",
      attention: false,
      sector: "group:operational:repositories",
      opacity: 0,
      x: 460.4821447910198,
      y: 302.07539566600764,
      visible: true,
    },
    {
      id: "resource:00000000-0000-4000-8000-000000040007",
      label: "Synthetic repository 40007",
      kind: "project",
      attention: false,
      sector: "group:operational:repositories",
      opacity: 0,
      x: 419.31158134232663,
      y: 347.8850799126703,
      visible: true,
    },
    {
      id: "reference:deployment%3A00000000-0000-4000-8000-000000040008:00000000-0000-4000-8000-000000040005",
      label: "Synthetic repository 40005",
      kind: "project",
      attention: false,
      sector: "group:operational:shared-execution",
      opacity: 0,
      x: 215.6994840793228,
      y: 351.04833288844,
      visible: true,
    },
    {
      id: "reference:deployment%3A00000000-0000-4000-8000-000000040008:00000000-0000-4000-8000-000000040012",
      label: "Synthetic API",
      kind: "project",
      attention: true,
      sector: "group:operational:shared-execution",
      opacity: 0,
      x: 250.5701555547508,
      y: 343.66030574658714,
      visible: true,
    },
    {
      id: "reference:deployment%3A00000000-0000-4000-8000-000000040008:00000000-0000-4000-8000-000000040013",
      label: "Synthetic Frontend",
      kind: "project",
      attention: false,
      sector: "group:operational:shared-execution",
      opacity: 0,
      x: 211.19049126857027,
      y: 354.0952444726294,
      visible: true,
    },
    {
      id: "reference:deployment%3A00000000-0000-4000-8000-000000040008:00000000-0000-4000-8000-000000040016",
      label: "Synthetic Shared database",
      kind: "project",
      attention: true,
      sector: "group:operational:shared-execution",
      opacity: 0,
      x: 240.55874847344978,
      y: 324.7798545862078,
      visible: true,
    },
    {
      id: "reference:deployment%3A00000000-0000-4000-8000-000000040009:00000000-0000-4000-8000-000000040005",
      label: "Synthetic repository 40005",
      kind: "project",
      attention: false,
      sector: "resource:00000000-0000-4000-8000-000000040004",
      opacity: 0,
      x: 360.4648775447827,
      y: 496.81054544457453,
      visible: true,
    },
    {
      id: "reference:deployment%3A00000000-0000-4000-8000-000000040009:00000000-0000-4000-8000-000000040018",
      label: "Synthetic Optional development service",
      kind: "project",
      attention: false,
      sector: "resource:00000000-0000-4000-8000-000000040004",
      opacity: 0,
      x: 377.65459308344293,
      y: 488.54030128695064,
      visible: true,
    },
    {
      id: "reference:deployment%3A00000000-0000-4000-8000-000000040010:00000000-0000-4000-8000-000000040006",
      label: "Synthetic repository 40006",
      kind: "project",
      attention: false,
      sector: "resource:00000000-0000-4000-8000-000000040003",
      opacity: 0,
      x: 101.2805862496338,
      y: 315.96487661300955,
      visible: true,
    },
    {
      id: "reference:deployment%3A00000000-0000-4000-8000-000000040010:00000000-0000-4000-8000-000000040007",
      label: "Synthetic repository 40007",
      kind: "project",
      attention: false,
      sector: "resource:00000000-0000-4000-8000-000000040003",
      opacity: 0,
      x: 92.64549782761448,
      y: 346.79147042787196,
      visible: true,
    },
    {
      id: "reference:deployment%3A00000000-0000-4000-8000-000000040010:00000000-0000-4000-8000-000000040014",
      label: "Synthetic Jobs",
      kind: "project",
      attention: false,
      sector: "resource:00000000-0000-4000-8000-000000040003",
      opacity: 0,
      x: 85.87354810765264,
      y: 349.6728335213201,
      visible: true,
    },
    {
      id: "reference:deployment%3A00000000-0000-4000-8000-000000040010:00000000-0000-4000-8000-000000040015",
      label: "Synthetic Queue",
      kind: "project",
      attention: false,
      sector: "resource:00000000-0000-4000-8000-000000040003",
      opacity: 0,
      x: 75.90061190813742,
      y: 311.41501270449356,
      visible: true,
    },
    {
      id: "reference:deployment%3A00000000-0000-4000-8000-000000040010:00000000-0000-4000-8000-000000040016",
      label: "Synthetic Shared database",
      kind: "project",
      attention: true,
      sector: "resource:00000000-0000-4000-8000-000000040003",
      opacity: 0,
      x: 118.52657036740251,
      y: 330.1870737537283,
      visible: true,
    },
    {
      id: "reference:deployment%3A00000000-0000-4000-8000-000000040010:00000000-0000-4000-8000-000000040017",
      label: "Synthetic Unmonitored endpoint",
      kind: "project",
      attention: false,
      sector: "resource:00000000-0000-4000-8000-000000040003",
      opacity: 0,
      x: 63.09353285711854,
      y: 344.84103210404135,
      visible: true,
    },
    {
      id: "reference:deployment%3A00000000-0000-4000-8000-000000040011:00000000-0000-4000-8000-000000040005",
      label: "Synthetic repository 40005",
      kind: "project",
      attention: false,
      sector: "resource:00000000-0000-4000-8000-000000040001",
      opacity: 0,
      x: 446.4318104728112,
      y: 179.25211069392483,
      visible: true,
    },
    {
      id: "reference:operational%3Aproject%3A00000000-0000-4000-8000-000000041000:00000000-0000-4000-8000-000000040005",
      label: "Synthetic repository 40005",
      kind: "project",
      attention: false,
      sector: "group:operational:shared-project-references",
      opacity: 0,
      x: 269.2952145145225,
      y: 173.96672269192723,
      visible: true,
    },
    {
      id: "reference:operational%3Aproject%3A00000000-0000-4000-8000-000000041001:00000000-0000-4000-8000-000000040005",
      label: "Synthetic repository 40005",
      kind: "project",
      attention: false,
      sector: "group:operational:shared-project-references",
      opacity: 0,
      x: 230.59989722247948,
      y: 236.7124021133997,
      visible: true,
    },
    {
      id: "reference:operational%3Aproject%3A00000000-0000-4000-8000-000000041002:00000000-0000-4000-8000-000000040005",
      label: "Synthetic repository 40005",
      kind: "project",
      attention: false,
      sector: "group:operational:shared-project-references",
      opacity: 0,
      x: 198.03723031834517,
      y: 178.83837397119393,
      visible: true,
    },
  ],
  sizes: [
    [1, 187, 49],
    [5, 164, 49],
    [0, 121, 49],
    [2, 191, 49],
    [3, 185, 49],
    [4, 185, 49],
    [6, 164, 49],
    [12, 195, 49],
    [13, 195, 49],
    [14, 195, 49],
    [18, 210, 63],
    [16, 210, 63],
    [17, 180, 49],
    [15, 195, 49],
    [7, 165, 49],
    [8, 165, 49],
    [9, 165, 49],
    [28, 195, 49],
    [29, 195, 49],
    [25, 210, 63],
    [19, 195, 49],
    [20, 210, 49],
    [21, 195, 49],
    [22, 195, 49],
    [23, 180, 49],
    [24, 180, 49],
    [26, 210, 49],
    [27, 195, 49],
    [10, 203, 49],
    [11, 203, 49],
    [30, 195, 49],
  ],
  states: [
    [0, 4.584530857482434, 160.1609362769687, 1, true],
    [1, -5.015495823087974, 153.56293459334722, 1, true],
    [2, -0.1726377588804553, 110.86025168830878, 0, false],
    [3, 0, 25.645228672295843, 0, false],
    [4, 29.37164147919134, 46.11834739769523, 1, true],
    [5, 0, 192.28549987350954, 1, true],
    [6, 0, 17.53508263533172, 0, false],
    [12, 4.924237824979912, 47.60108903051946, 1, true],
    [13, -33.98214479101978, 112.31801101971445, 1, true],
    [14, 0, 204.61492008732972, 0, false],
    [15, 0, -141.83595609935838, 0, false],
    [16, 0, 153.3782164945215, 0, false],
    [17, -4.766516890121068, 91.03362355034074, 0, false],
    [18, -26.558748473393052, 169.29532536215225, 0, false],
    [7, 51.646379800079046, 137.95768023237414, 0, false],
    [8, 4.788561212890386, 100.2414235357094, 0, false],
    [9, 0, -28.09157984681036, 0, false],
    [28, 41.20478548547749, -25.96672269192723, 0, false],
    [29, 0, 12.992551491889259, 0, false],
    [10, 0.1726377588804553, 90.38537742615364, 1, true],
    [11, -15.705906831839584, -83.81620086386891, 1, true],
    [19, 0, 55.68945455542547, 1, true],
    [20, 0, -34.744516874516364, 0, false],
    [21, 4.219413750366201, -126.9728924787052, 0, false],
    [22, 12.854502172385523, 72.8300846226802, 0, false],
    [23, 12.126451892347362, -154.09950973710392, 0, false],
    [24, 22.09938809186258, 73.57578804011467, 1, true],
    [25, -5.526570367402513, -114.67094029232035, 1, true],
    [26, 49.90646714288146, -1.947258354871451, 0, false],
    [27, 0, 0.46262192780321243, 1, true],
    [30, 0, -19.59470606419964, 0, false],
  ],
  separations: [
    [0, 1, "x", 1],
    [0, 4, "x", -1],
    [1, 5, "y", -1],
    [0, 12, "y", 1],
    [0, 13, "y", 1],
    [0, 14, "y", -1],
    [1, 12, "y", 1],
    [1, 14, "y", -1],
    [4, 13, "x", 1],
    [12, 13, "y", -1],
    [1, 13, "y", 1],
    [1, 15, "y", 1],
    [1, 16, "y", 1],
    [1, 17, "y", 1],
    [15, 16, "y", -1],
    [15, 17, "y", -1],
    [15, 18, "y", -1],
    [16, 17, "y", 1],
    [16, 18, "y", 1],
    [17, 18, "y", -1],
    [1, 18, "y", 1],
    [15, 12, "y", -1],
    [16, 13, "y", 1],
    [17, 12, "x", -1],
    [18, 12, "y", 1],
    [18, 13, "x", -1],
    [7, 8, "y", -1],
    [7, 9, "y", 1],
    [7, 2, "y", 1],
    [9, 2, "y", -1],
    [8, 12, "y", -1],
    [9, 28, "y", -1],
    [2, 28, "y", 1],
    [16, 14, "y", -1],
    [7, 29, "y", 1],
    [2, 29, "y", 1],
    [28, 29, "y", -1],
    [17, 21, "y", 1],
    [17, 22, "y", 1],
    [17, 23, "y", 1],
    [17, 25, "y", 1],
    [17, 26, "y", 1],
    [17, 11, "y", 1],
    [18, 11, "y", 1],
    [19, 20, "y", 1],
    [19, 6, "y", 1],
    [20, 6, "y", -1],
    [21, 22, "y", -1],
    [21, 23, "y", -1],
    [21, 24, "y", -1],
    [22, 23, "y", 1],
    [22, 24, "y", 1],
    [22, 25, "y", 1],
    [22, 26, "y", 1],
    [22, 11, "y", 1],
    [23, 24, "y", -1],
    [23, 25, "y", -1],
    [24, 25, "y", 1],
    [24, 26, "y", 1],
    [25, 26, "y", -1],
    [25, 11, "y", -1],
    [26, 11, "y", 1],
    [27, 10, "y", -1],
    [27, 3, "y", -1],
    [10, 3, "y", 1],
    [28, 30, "y", -1],
    [29, 30, "y", 1],
    [8, 29, "y", 1],
    [16, 22, "y", 1],
    [17, 24, "y", 1],
    [18, 24, "y", 1],
    [18, 26, "y", 1],
    [23, 11, "y", -1],
    [2, 10, "x", -1],
    [16, 5, "y", -1],
    [18, 22, "y", 1],
    [21, 25, "y", -1],
    [21, 29, "y", -1],
    [24, 11, "y", 1],
    [27, 28, "y", 1],
    [7, 10, "y", 1],
    [15, 21, "y", 1],
    [8, 24, "y", -1],
    [9, 30, "y", -1],
    [15, 23, "y", -1],
    [15, 25, "y", -1],
    [18, 14, "y", -1],
  ],
};

function capturedLayout(warm: boolean) {
  const layout = new LabelLayout();
  for (const [index, width, height] of stationaryCapture.sizes)
    layout.measure(stationaryCapture.anchors[index]!.id, width, height);
  if (warm)
    Object.assign(layout, {
      states: new Map(
        stationaryCapture.states.map(([index, x, y, opacity, admitted]) => [
          stationaryCapture.anchors[index]!.id,
          { x, y, opacity, admitted },
        ]),
      ),
      separations: new Map(
        stationaryCapture.separations.map(([a, b, axis, direction]) => [
          stationaryCapture.anchors[a]!.id +
            "|" +
            stationaryCapture.anchors[b]!.id,
          { axis, direction },
        ]),
      ),
    });
  return layout;
}

function settleLabels<T extends LabelPosition>(
  layout: LabelLayout,
  anchors: T[],
  motion: boolean,
  width = 900,
  height = 500,
  top = 52,
  selected: string | null = null,
  obstacles: LabelRect[] = [],
) {
  let frames = 0;
  let result: T[];
  do {
    result = layout.layout(
      anchors.map((anchor) => ({ ...anchor })),
      width,
      height,
      1 / 60,
      motion,
      top,
      selected,
      obstacles,
    );
    frames++;
  } while (layout.changing && frames < 600);
  expect(layout.changing).toBe(false);
  expect(frames).toBeLessThan(600);
  return { result, frames };
}

function expectVisibleFit(
  positions: LabelPosition[],
  sizes: Map<string, { width: number; height: number }>,
  width: number,
  height: number,
  top: number,
) {
  const shown = positions.filter((position) => position.opacity > 0.5);
  expect(shown.length).toBeGreaterThan(0);
  shown.forEach((a, index) => {
    const size = sizes.get(a.id)!;
    expect(a.x - size.width / 2).toBeGreaterThanOrEqual(7);
    expect(a.x + size.width / 2).toBeLessThanOrEqual(width - 7);
    expect(a.y - size.height).toBeGreaterThanOrEqual(top - 1);
    expect(a.y).toBeLessThanOrEqual(height - 28);
    for (const b of shown.slice(index + 1)) {
      const other = sizes.get(b.id)!;
      expect(
        Math.abs(a.x - b.x) >= (size.width + other.width) / 2 + 6 ||
          Math.abs(a.y - size.height / 2 - b.y + other.height / 2) >=
            (size.height + other.height) / 2 + 6,
      ).toBe(true);
    }
  });
}

describe("actual stationary D02 label capture", () => {
  it.each([
    [false, false],
    [false, true],
    [true, false],
    [true, true],
  ])(
    "settles all 31 captured identities with motion=%s and warm=%s",
    (motion, warm) => {
      const layout = capturedLayout(warm!);
      const { anchors, width, height, top, selected } = stationaryCapture;
      const before = structuredClone(stationaryCapture);
      const { result } = settleLabels(
        layout,
        anchors,
        motion!,
        width,
        height,
        top,
        selected,
      );
      expect(result.map((position) => position.id).sort()).toEqual(
        anchors.map((anchor) => anchor.id).sort(),
      );
      const sizes = new Map(
        stationaryCapture.sizes.map(([index, width, height]) => [
          anchors[index]!.id,
          { width, height },
        ]),
      );
      expectVisibleFit(result, sizes, width, height, top);
      for (const position of result) {
        const original = anchors.find((anchor) => anchor.id === position.id)!;
        expect(position).toMatchObject({
          label: original.label,
          kind: original.kind,
          sector: original.sector,
          attention: original.attention,
          visible: original.visible,
        });
      }
      for (let refresh = 0; refresh < 12; refresh++) {
        for (const [index, width, height] of stationaryCapture.sizes)
          expect(layout.measure(anchors[index]!.id, width, height)).toBe(false);
        const repeated = layout.layout(
          [...anchors].reverse().map((anchor) => ({ ...anchor })),
          width,
          height,
          1 / 60,
          motion!,
          top,
          selected,
        );
        expect(layout.changing).toBe(false);
        expectStable(result, repeated);
        expectVisibleFit(repeated, sizes, width, height, top);
      }
      expect(stationaryCapture).toEqual(before);
    },
  );
});

const labelScene = (
  patch: Partial<{
    x: number;
    y: number;
    labelWidth: number;
    labelHeight: number;
    width: number;
    height: number;
    top: number;
  }> = {},
) => ({
  x: 300,
  y: 160,
  labelWidth: 110,
  labelHeight: 42,
  width: 900,
  height: 500,
  top: 52,
  ...patch,
});
const sceneChanges = [
  {
    name: "anchor position",
    before: labelScene(),
    after: labelScene({ x: 650, y: 300 }),
    expected: [650, 300],
  },
  {
    name: "measured width",
    before: labelScene({ x: 850 }),
    after: labelScene({ x: 850, labelWidth: 300 }),
    expected: [742, 160],
  },
  {
    name: "measured height",
    before: labelScene({ y: 100 }),
    after: labelScene({ y: 100, labelHeight: 100 }),
    expected: [300, 152],
  },
  {
    name: "viewport width",
    before: labelScene({ x: 700 }),
    after: labelScene({ x: 700, width: 360 }),
    expected: [297, 160],
  },
  {
    name: "viewport height",
    before: labelScene({ y: 400 }),
    after: labelScene({ y: 400, height: 280 }),
    expected: [300, 238],
  },
  {
    name: "top inset",
    before: labelScene({ y: 100 }),
    after: labelScene({ y: 100, top: 150 }),
    expected: [300, 192],
  },
];

describe.each([false, true])(
  "stationary target invalidation with motion=%s",
  (motion) => {
    it.each(sceneChanges)(
      "responds to $name without retaining an obsolete target",
      ({ before, after, expected }) => {
        const layout = new LabelLayout();
        const solve = (scene: ReturnType<typeof labelScene>) => {
          layout.measure("a", scene.labelWidth, scene.labelHeight);
          return settleLabels(
            layout,
            [label("a", scene.x, scene.y)],
            motion,
            scene.width,
            scene.height,
            scene.top,
          ).result;
        };
        const old = solve(before)[0]!;
        const result = solve(after);
        const current = result[0]!;
        expect(
          Math.abs(current.x - expected[0]!) +
            Math.abs(current.y - expected[1]!),
        ).toBeLessThanOrEqual(0.05);
        expect(
          Math.abs(current.x - old.x) + Math.abs(current.y - old.y),
        ).toBeGreaterThan(0.05);
        expect(current.opacity).toBeGreaterThan(0.99);
        expectVisibleFit(
          result,
          new Map([
            ["a", { width: after.labelWidth, height: after.labelHeight }],
          ]),
          after.width,
          after.height,
          after.top,
        );
        for (let refresh = 0; refresh < 6; refresh++) {
          const repeated = layout.layout(
            [label("a", after.x, after.y)],
            after.width,
            after.height,
            1 / 60,
            motion,
            after.top,
          );
          expect(layout.changing).toBe(false);
          expectStable(result, repeated);
        }
      },
    );

    it("reclaims collision offsets after visibility and membership change", () => {
      const layout = new LabelLayout();
      const input = [label("a"), label("b")];
      for (const anchor of input) layout.measure(anchor.id, 110, 42);
      const first = settleLabels(layout, input, motion).result;
      expect(
        Math.abs(first.find((item) => item.id === "a")!.y - 160),
      ).toBeGreaterThan(0.05);
      const hidden = settleLabels(
        layout,
        [input[0]!, { ...input[1]!, visible: false }],
        motion,
      ).result;
      expect(
        Math.abs(hidden.find((item) => item.id === "a")!.y - 160),
      ).toBeLessThanOrEqual(0.05);
      expect(hidden.find((item) => item.id === "b")!.opacity).toBeLessThan(
        0.05,
      );
      expect(hidden.map((item) => item.id).sort()).toEqual(["a", "b"]);
      settleLabels(layout, input, motion);
      const removed = settleLabels(layout, [input[0]!], motion).result;
      expect(removed.map((item) => item.id)).toEqual(["a"]);
      expect(Math.abs(removed[0]!.y - 160)).toBeLessThanOrEqual(0.05);
      expect(layout.measure("b", 110, 42)).toBe(true);
      const added = settleLabels(
        layout,
        [input[0]!, label("c")],
        motion,
      ).result;
      expect(added.map((item) => item.id).sort()).toEqual(["a", "c"]);
      expectVisibleFit(
        added,
        new Map([
          ["a", { width: 110, height: 42 }],
          ["c", { width: 110, height: 42 }],
        ]),
        900,
        500,
        52,
      );
    });

    it("updates selected and attention admission after the target has settled", () => {
      const layout = new LabelLayout();
      const input = [label("a", 160, 100), label("b", 160, 100)];
      for (const anchor of input) layout.measure(anchor.id, 300, 70);
      const solve = (anchors = input, selected: string | null = null) =>
        settleLabels(layout, anchors, motion, 320, 180, 52, selected).result;
      const selectedA = solve(input, "a");
      expect(
        selectedA.find((item) => item.id === "a")!.opacity,
      ).toBeGreaterThan(0.99);
      expect(selectedA.find((item) => item.id === "b")!.opacity).toBeLessThan(
        0.05,
      );
      const selectedB = solve(input, "b");
      expect(
        selectedB.find((item) => item.id === "b")!.opacity,
      ).toBeGreaterThan(0.99);
      expect(selectedB.find((item) => item.id === "a")!.opacity).toBeLessThan(
        0.05,
      );
      const attention = solve([{ ...input[0]!, attention: true }, input[1]!]);
      expect(
        attention.find((item) => item.id === "a")!.opacity,
      ).toBeGreaterThan(0.99);
      expect(attention.find((item) => item.id === "b")!.opacity).toBeLessThan(
        0.05,
      );
    });
  },
);

it("preserves current metadata while reusing stationary positions", () => {
  const layout = capturedLayout(true);
  const { anchors, width, height, top, selected } = stationaryCapture;
  const original = settleLabels(
    layout,
    anchors,
    true,
    width,
    height,
    top,
    selected,
  ).result;
  const refreshed = anchors.map((anchor) => ({
    ...anchor,
    label: "Current " + anchor.label,
    sector: "Current " + anchor.sector,
    currentEvidence: anchor.id,
  }));
  const result = layout.layout(
    refreshed,
    width,
    height,
    1 / 60,
    true,
    top,
    selected,
  );
  expect(layout.changing).toBe(false);
  expectStable(original, result);
  for (const position of result) {
    const current = refreshed.find((anchor) => anchor.id === position.id)!;
    expect(position.label).toBe(current.label);
    expect(position.sector).toBe(current.sector);
    expect(position.currentEvidence).toBe(current.currentEvidence);
  }
});

it("keeps changing true while actual collision offsets remain in motion", () => {
  const layout = new LabelLayout();
  const input = [label("outside", 1000, 160)];
  layout.measure("outside", 110, 42);
  for (let frame = 0; frame < 5; frame++) {
    const position = layout.layout(input, 900, 500, 1 / 60, true)[0]!;
    expect(Math.abs(position.x - 837)).toBeGreaterThan(0.05);
    expect(layout.changing).toBe(true);
  }
  const { result } = settleLabels(layout, input, true);
  expect(Math.abs(result[0]!.x - 837)).toBeLessThanOrEqual(0.05);
  expect(result[0]!.opacity).toBeGreaterThan(0.99);
  const snapped = layout.layout(input, 900, 500, 1 / 60, false);
  expectStable(result, snapped);
  layout.layout(input, 900, 500, 1 / 60, false);
  expect(layout.changing).toBe(false);
});

it("bounds retained collision and measurement maps to the current population during churn", () => {
  const layout = new LabelLayout();
  const retainedMaps = () =>
    Object.values(layout).filter(
      (value): value is Map<unknown, unknown> => value instanceof Map,
    );
  for (let generation = 0; generation < 80; generation++) {
    const input = [label("a-" + generation), label("b-" + generation)];
    for (const anchor of input) layout.measure(anchor.id, 110, 42);
    settleLabels(layout, input, false);
    expect(retainedMaps().length).toBeGreaterThanOrEqual(3);
    for (const map of retainedMaps()) expect(map.size).toBeLessThanOrEqual(2);
  }
  layout.layout([], 900, 500, 1 / 60, false);
  for (const map of retainedMaps()) expect(map.size).toBe(0);
  expect(layout.layout([], 900, 500, 1 / 60, false)).toEqual([]);
  expect(layout.changing).toBe(false);
});

describe("steady admission while the camera moves", () => {
  it("keeps a name through a brief contact and fades it only after the hold", () => {
    const layout = new LabelLayout();
    layout.measure("high", 120, 32);
    layout.measure("low", 120, 32);
    // A leashed label is hidden, not displaced, when it would leave its subject.
    const apart = [
      { ...label("high", 200, 200), rank: 40 },
      { ...label("low", 600, 200), leash: 12 },
    ];
    for (let i = 0; i < 60; i++) layout.layout(apart, 900, 500, 1 / 60, true);
    // The lower-priority label is crowded for a moment, then has room again.
    const crowded = [apart[0]!, { ...apart[1]!, x: 205, y: 205 }];
    let low = layout.layout(crowded, 900, 500, 1 / 60, true)[1]!;
    for (let i = 0; i < 6; i++)
      low = layout
        .layout(crowded, 900, 500, 1 / 60, true)
        .find((item) => item.id === "low")!;
    expect(low.opacity).toBeGreaterThan(0.9);
    for (let i = 0; i < 60; i++)
      low = layout
        .layout(apart, 900, 500, 1 / 60, true)
        .find((item) => item.id === "low")!;
    expect(low.opacity).toBeGreaterThan(0.99);
    // A lasting contact releases it, and it fades rather than vanishing.
    let frames = 0;
    do {
      low = layout
        .layout(crowded, 900, 500, 1 / 60, true)
        .find((item) => item.id === "low")!;
      frames++;
    } while (low.opacity > 0.9 && frames < 120);
    expect(frames).toBeGreaterThanOrEqual(Math.floor(LABEL_RELEASE * 60));
    const fading = layout
      .layout(crowded, 900, 500, 1 / 60, true)
      .find((item) => item.id === "low")!;
    expect(fading.opacity).toBeGreaterThan(0.05);
    // Once released it waits for room to persist before returning.
    const back = layout
      .layout(apart, 900, 500, 1 / 60, true)
      .find((item) => item.id === "low")!;
    expect(back.opacity).toBeLessThan(fading.opacity);
  });

  it("steps labels out from under stage panels and keeps fixed labels where their caller put them", () => {
    const layout = new LabelLayout();
    layout.measure("pin", 120, 32);
    layout.measure("callout", 140, 22);
    const panel = { x: 150, y: 80, width: 300, height: 140 };
    const result = settleLabels(
      layout,
      [
        label("pin", 140, 100),
        { ...label("callout", 700, 300), fixed: true, opacity: 0.6 },
      ],
      false,
      900,
      500,
      12,
      null,
      [panel],
    ).result;
    const pin = result.find((item) => item.id === "pin")!;
    expect(pin.opacity).toBe(1);
    const top = pin.y - 32;
    const left = pin.x - 60;
    expect(
      top >= panel.y + panel.height / 2 || left >= panel.x + panel.width / 2,
    ).toBe(true);
    expect(result.find((item) => item.id === "callout")).toMatchObject({
      x: 700,
      y: 300,
      opacity: 0.6,
    });
  });
});

describe("callout columns", () => {
  const size = () => ({ width: 130, height: 22 });
  const region = { width: 1000, top: 20, bottom: 600 };
  const ring = (count: number, cx = 500, cy = 300, radius = 120) =>
    Array.from({ length: count }, (_, index) => {
      const angle = (index / count) * Math.PI * 2;
      return {
        id: `m${String(index).padStart(2, "0")}`,
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
        visible: true,
      };
    });
  const overlaps = (items: CalloutPlacement[]) =>
    items.some((a, i) =>
      items
        .slice(i + 1)
        .some(
          (b) =>
            a.side === b.side &&
            Math.abs(a.y - b.y) < 22 &&
            Math.abs(a.x - b.x) < 130,
        ),
    );

  it("names every member beside the group without overlap, each side by position", () => {
    const callouts = new CalloutLayout();
    const members = ring(24);
    const { placements, overflow } = callouts.layout(
      members,
      size,
      region,
      { x: 500, y: 300 },
      1,
      false,
    );
    expect(placements).toHaveLength(24);
    expect(overflow).toEqual({ left: 0, right: 0 });
    expect(overlaps(placements)).toBe(false);
    for (const placement of placements) {
      const member = members.find((item) => item.id === placement.id)!;
      if (member.x < 490) expect(placement.side).toBe("left");
      if (member.x > 510) expect(placement.side).toBe("right");
      expect(placement.leader).toMatchObject({ toX: member.x, toY: member.y });
      expect(placement.opacity).toBe(1);
      if (placement.side === "left")
        expect(placement.x + 65).toBeLessThanOrEqual(380 - 25);
      else expect(placement.x - 65).toBeGreaterThanOrEqual(620 + 25);
    }
  });

  it("lends members across a full column, counts real overflow and keeps attention", () => {
    const callouts = new CalloutLayout();
    const members = ring(60).map((member, index) => ({
      ...member,
      attention: index === 30,
    }));
    const panel = { x: 300, y: 120, width: 600, height: 200 };
    const { placements, overflow } = callouts.layout(
      members,
      size,
      { ...region, obstacles: [panel] },
      { x: 500, y: 300 },
      1,
      false,
    );
    expect(overlaps(placements)).toBe(false);
    const left = placements.filter((item) => item.side === "left");
    const right = placements.filter((item) => item.side === "right");
    expect(right.length).toBeGreaterThan(left.length);
    expect(
      left.every((item) => item.y - 11 >= panel.y + panel.height / 2),
    ).toBe(true);
    expect(placements.length + overflow.left + overflow.right).toBe(60);
    expect(overflow.left + overflow.right).toBeGreaterThan(0);
    expect(placements.some((item) => item.id === "m30")).toBe(true);
  });

  it("moves a member to the other side only after it crosses the centre, fading between them", () => {
    const callouts = new CalloutLayout();
    const place = (x: number) =>
      callouts.layout(
        [
          { id: "a", x: 380, y: 300, visible: true },
          { id: "b", x: 620, y: 300, visible: true },
          { id: "moving", x, y: 250, visible: true },
        ],
        size,
        region,
        { x: 500, y: 300 },
        1 / 60,
        true,
      ).placements;
    for (let i = 0; i < 90; i++) place(490);
    expect(place(505).find((item) => item.id === "moving")!.side).toBe("left");
    let seen = place(600).find((item) => item.id === "moving");
    expect(seen!.side).toBe("left");
    for (let i = 0; i < 120 && seen?.side !== "right"; i++)
      seen = place(600).find((item) => item.id === "moving");
    expect(seen?.side).toBe("right");
    expect(seen!.opacity).toBeLessThan(0.5);
    callouts.reset();
    expect(place(600).find((item) => item.id === "moving")!.side).toBe("right");
  });
});
