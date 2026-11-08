import { steps } from "./world";

// The mark's open stroke at hero scale, used as a timeline for the example
// sequence. Its proportions follow apps/web/public/icon.svg.
export const emblem = {
  width: 470,
  height: 520,
  d: "M 404 70 H 250 C 140 70 60 154 60 260 C 60 366 140 450 250 450 H 404",
  delayMs: 250,
  drawMs: 2300,
};

type P = { x: number; y: number };

const cubic = (a: P, b: P, c: P, d: P, t: number): P => {
  const u = 1 - t;
  return {
    x:
      u * u * u * a.x +
      3 * u * u * t * b.x +
      3 * u * t * t * c.x +
      t * t * t * d.x,
    y:
      u * u * u * a.y +
      3 * u * u * t * b.y +
      3 * u * t * t * c.y +
      t * t * t * d.y,
  };
};

// Dense polyline of the path above, for placing ticks by arc length.
const samples: P[] = (() => {
  const out: P[] = [];
  for (let i = 0; i <= 40; i += 1) out.push({ x: 404 - (154 * i) / 40, y: 70 });
  for (let i = 1; i <= 200; i += 1)
    out.push(
      cubic(
        { x: 250, y: 70 },
        { x: 140, y: 70 },
        { x: 60, y: 154 },
        { x: 60, y: 260 },
        i / 200,
      ),
    );
  for (let i = 1; i <= 200; i += 1)
    out.push(
      cubic(
        { x: 60, y: 260 },
        { x: 60, y: 366 },
        { x: 140, y: 450 },
        { x: 250, y: 450 },
        i / 200,
      ),
    );
  for (let i = 1; i <= 40; i += 1)
    out.push({ x: 250 + (154 * i) / 40, y: 450 });
  return out;
})();

const cumulative = samples.map((_, index) =>
  samples
    .slice(1, index + 1)
    .reduce(
      (sum, point, i) =>
        sum + Math.hypot(point.x - samples[i]!.x, point.y - samples[i]!.y),
      0,
    ),
);
const total = cumulative[cumulative.length - 1] ?? 1;

function pointAt(fraction: number): P {
  const target = fraction * total;
  const index = cumulative.findIndex((length) => length >= target);
  return samples[index === -1 ? samples.length - 1 : index]!;
}

// Inverse of the CSS easing cubic-bezier(0.65, 0, 0.35, 1), so each tick
// appears exactly when the drawn stroke reaches it.
function bezier(t: number, p1: number, p2: number) {
  const u = 1 - t;
  return 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t;
}

function timeForProgress(progress: number) {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2;
    const y = bezier(findT(mid), 0, 1);
    if (y < progress) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function findT(x: number) {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2;
    if (bezier(mid, 0.65, 0.35) < x) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

const fractions = [0, 0.3, 0.5, 0.7, 1];

export const emblemTicks = steps.map((step, index) => {
  const fraction = fractions[index] ?? 1;
  const point = pointAt(fraction);
  const end = index === 0 || index === steps.length - 1;
  return {
    id: step.id,
    label: step.title,
    time: step.time,
    x: point.x,
    y: point.y,
    end,
    labelX: end ? 404 : point.x + 22,
    labelY: index === 0 ? 40 : index === steps.length - 1 ? 492 : point.y + 4,
    anchor: end ? ("end" as const) : ("start" as const),
    delayMs: Math.round(
      emblem.delayMs + emblem.drawMs * timeForProgress(fraction),
    ),
  };
});
