export type Circle = { r: number; x: number; z: number };

const intersects = (a: Circle, b: Circle) => {
  const reach = a.r + b.r - 1e-6;
  return reach > 0 && reach * reach > (b.x - a.x) ** 2 + (b.z - a.z) ** 2;
};
// Put c tangent to both a and b, on the left of the a -> b chain.
function place(b: Circle, a: Circle, c: Circle) {
  const dx = b.x - a.x,
    dz = b.z - a.z,
    d2 = dx * dx + dz * dz;
  if (!d2) {
    c.x = a.x + c.r;
    c.z = a.z;
    return;
  }
  const a2 = (a.r + c.r) ** 2,
    b2 = (b.r + c.r) ** 2;
  if (a2 > b2) {
    const x = (d2 + b2 - a2) / (2 * d2),
      y = Math.sqrt(Math.max(0, b2 / d2 - x * x));
    c.x = b.x - x * dx - y * dz;
    c.z = b.z - x * dz + y * dx;
  } else {
    const x = (d2 + a2 - b2) / (2 * d2),
      y = Math.sqrt(Math.max(0, a2 / d2 - x * x));
    c.x = a.x + x * dx - y * dz;
    c.z = a.z + x * dz + y * dx;
  }
}
type Link = { circle: Circle; next: Link; previous: Link };
const link = (circle: Circle) => {
  const node = { circle } as Link;
  node.next = node.previous = node;
  return node;
};
const score = (node: Link) => {
  const a = node.circle,
    b = node.next.circle,
    ab = a.r + b.r;
  return (
    ((a.x * b.r + b.x * a.r) / ab) ** 2 + ((a.z * b.r + b.z * a.r) / ab) ** 2
  );
};

/** Front-chain sibling packing (Wang et al.), as used by d3-hierarchy. Circles
 * are positioned in place without overlap; the caller chooses their order.
 */
export function packCircles(circles: Circle[]) {
  const n = circles.length;
  if (!n) return;
  const a = circles[0]!;
  a.x = 0;
  a.z = 0;
  if (n === 1) return;
  const b = circles[1]!;
  a.x = -b.r;
  b.x = a.r;
  b.z = 0;
  if (n === 2) return;
  place(b, a, circles[2]!);
  let la = link(a),
    lb = link(b),
    lc = link(circles[2]!);
  la.next = lc.previous = lb;
  lb.next = la.previous = lc;
  lc.next = lb.previous = la;
  pack: for (let i = 3; i < n; i++) {
    const c = circles[i]!;
    place(la.circle, lb.circle, c);
    lc = link(c);
    let j = lb.next,
      k = la.previous,
      sj = lb.circle.r,
      sk = la.circle.r;
    do {
      if (sj <= sk) {
        if (intersects(j.circle, c)) {
          lb = j;
          la.next = lb;
          lb.previous = la;
          i--;
          continue pack;
        }
        sj += j.circle.r;
        j = j.next;
      } else {
        if (intersects(k.circle, c)) {
          la = k;
          la.next = lb;
          lb.previous = la;
          i--;
          continue pack;
        }
        sk += k.circle.r;
        k = k.previous;
      }
    } while (j !== k.next);
    lc.previous = la;
    lc.next = lb;
    la.next = lb.previous = lb = lc;
    let best = score(la);
    for (let node = lc.next; node !== lb; node = node.next) {
      const value = score(node);
      if (value < best) {
        la = node;
        best = value;
      }
    }
    lb = la.next;
  }
}

const reach = (circles: readonly Circle[], x: number, z: number) => {
  let r = 0;
  for (const circle of circles)
    r = Math.max(r, Math.hypot(circle.x - x, circle.z - z) + circle.r);
  return r;
};

/** A bounding circle that contains every circle. It is close to minimal for
 * packed siblings and deterministic for identical input.
 */
export function enclose(circles: readonly Circle[]): Circle {
  if (!circles.length) return { r: 0, x: 0, z: 0 };
  let minX = Infinity,
    maxX = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  for (const circle of circles) {
    minX = Math.min(minX, circle.x - circle.r);
    maxX = Math.max(maxX, circle.x + circle.r);
    minZ = Math.min(minZ, circle.z - circle.r);
    maxZ = Math.max(maxZ, circle.z + circle.r);
  }
  const box = { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 };
  // Badoiu-Clarkson: step toward the farthest boundary point with shrinking steps.
  let x = box.x,
    z = box.z;
  for (let step = 0; step < 96; step++) {
    let farX = x,
      farZ = z,
      best = -1;
    for (const circle of circles) {
      const dx = circle.x - x,
        dz = circle.z - z,
        distance = Math.hypot(dx, dz);
      if (distance + circle.r <= best) continue;
      best = distance + circle.r;
      farX = distance
        ? circle.x + (dx / distance) * circle.r
        : circle.x + circle.r;
      farZ = distance ? circle.z + (dz / distance) * circle.r : circle.z;
    }
    x += (farX - x) / (step + 2);
    z += (farZ - z) / (step + 2);
  }
  const fromBox = reach(circles, box.x, box.z),
    fromSearch = reach(circles, x, z);
  return fromSearch < fromBox
    ? { r: fromSearch, x, z }
    : { r: fromBox, x: box.x, z: box.z };
}
