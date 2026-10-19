import { activeTransfers, type ActivitySnapshot } from "./activity-types";

export type RecordedCheckRoute = {
  id: string;
  from: string;
  to: string;
  protocol: "http" | "tcp";
  responseTimeMs: number;
  observedAt: string;
  failed: boolean;
  fromLabel?: string;
  toLabel?: string;
};
export type CheckEndpoint = {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
};
export type CheckSignalSelection = {
  route: RecordedCheckRoute;
  fromLabel: string;
  toLabel: string;
  phase: "outbound" | "response";
};
type Point = { x: number; y: number };
type Curve = [Point, Point, Point, Point];

/** Short, local arcs below the pins, with a contained loop for one group. */
export function checkSignalCurve(
  from: CheckEndpoint,
  to: CheckEndpoint,
  width: number,
  lane = 0,
): Curve {
  const clamp = (x: number) => Math.max(10, Math.min(width - 10, x));
  if (from.id === to.id) {
    const y = from.y + 9;
    return [
      { x: clamp(from.x - 14), y },
      { x: clamp(from.x - 44), y: y + 56 },
      { x: clamp(from.x + 44), y: y + 56 },
      { x: clamp(from.x + 14), y },
    ];
  }
  const a = { x: clamp(from.x), y: from.y + 9 };
  const b = { x: clamp(to.x), y: to.y + 9 };
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const bend = Math.min(24, distance * 0.12) * (lane % 2 ? -1 : 1);
  const nx = (-dy / distance) * bend,
    ny = (dx / distance) * bend;
  return [
    a,
    { x: clamp(a.x + dx / 3 + nx), y: a.y + dy / 3 + ny },
    { x: clamp(b.x - dx / 3 + nx), y: b.y - dy / 3 + ny },
    b,
  ];
}

export function checkSignalPoint(curve: Curve, progress: number) {
  const t = Math.max(0, Math.min(1, progress)),
    s = 1 - t;
  const [a, b, c, d] = curve;
  return {
    x:
      s ** 3 * a.x + 3 * s ** 2 * t * b.x + 3 * s * t ** 2 * c.x + t ** 3 * d.x,
    y:
      s ** 3 * a.y + 3 * s ** 2 * t * b.y + 3 * s * t ** 2 * c.y + t ** 3 * d.y,
  };
}

const svgNamespace = "http://www.w3.org/2000/svg";
let overlaySequence = 0;
function attribute(element: Element, name: string, value: string) {
  if (element.getAttribute(name) !== value) element.setAttribute(name, value);
}
type Packet = {
  group: SVGGElement;
  marks: SVGCircleElement[];
  ripple: SVGCircleElement;
  hit: HTMLButtonElement;
  selection: CheckSignalSelection;
  curve: Curve;
  progress: number;
};

/** Theme-native dots and short trails. A guide exists only during inspection. */
export class CheckSignalOverlay {
  readonly element: SVGSVGElement;
  private layer: SVGGElement;
  private guide: SVGPathElement;
  private hits: HTMLDivElement;
  private exclusions: SVGPathElement;
  private mask: SVGMaskElement;
  private maskBackground: SVGRectElement;
  private hovered: string | null = null;
  private packets = new Map<string, Packet>();
  constructor(
    container: HTMLElement,
    inspect?: (selection: CheckSignalSelection) => void,
    private invalidate?: () => void,
  ) {
    const doc = container.ownerDocument;
    this.element = doc.createElementNS(svgNamespace, "svg");
    this.element.classList.add("cmd-check-signals");
    this.element.style.display = "none";
    this.element.setAttribute("aria-hidden", "true");
    const definitions = doc.createElementNS(svgNamespace, "defs");
    this.mask = doc.createElementNS(svgNamespace, "mask");
    this.mask.id = `cmd-check-pin-mask-${++overlaySequence}`;
    this.mask.setAttribute("maskUnits", "userSpaceOnUse");
    this.maskBackground = doc.createElementNS(svgNamespace, "rect");
    this.maskBackground.setAttribute("fill", "white");
    this.exclusions = doc.createElementNS(svgNamespace, "path");
    this.exclusions.setAttribute("fill", "black");
    this.mask.append(this.maskBackground, this.exclusions);
    definitions.append(this.mask);
    this.layer = doc.createElementNS(svgNamespace, "g");
    this.layer.setAttribute("mask", `url(#${this.mask.id})`);
    this.guide = doc.createElementNS(svgNamespace, "path");
    this.guide.classList.add("cmd-check-inspection-guide");
    this.layer.append(this.guide);
    this.element.append(definitions, this.layer);
    this.hits = doc.createElement("div");
    this.hits.className = "cmd-check-hits";
    this.hits.setAttribute("aria-label", "Recorded check signals");
    container.append(this.element, this.hits);
    this.inspect = inspect;
  }
  private inspect: ((selection: CheckSignalSelection) => void) | undefined;
  update(
    routes: readonly RecordedCheckRoute[],
    snapshot: ActivitySnapshot,
    endpoint: (id: string) => CheckEndpoint | null,
    width: number,
    height: number,
    animate: boolean,
    pins: readonly CheckEndpoint[] = [],
    inspected?: Pick<RecordedCheckRoute, "from" | "to"> | null,
  ) {
    attribute(this.element, "viewBox", `0 0 ${width} ${height}`);
    for (const element of [this.mask, this.maskBackground]) {
      attribute(element, "x", "0");
      attribute(element, "y", "0");
      attribute(element, "width", String(width));
      attribute(element, "height", String(height));
    }
    attribute(
      this.exclusions,
      "d",
      pins
        .map(
          (pin) =>
            `M${pin.x - pin.width / 2 - 3},${pin.y - pin.height - 3}h${pin.width + 6}v${pin.height + 6}h-${pin.width + 6}Z`,
        )
        .join(" "),
    );
    const resolved = new Map<
      string,
      {
        route: RecordedCheckRoute;
        from: CheckEndpoint;
        to: CheckEndpoint;
        curve: Curve;
      }
    >();
    const lanes = new Map<string, number>();
    for (const route of [...routes].sort((a, b) => a.id.localeCompare(b.id))) {
      const from = endpoint(route.from),
        to = endpoint(route.to);
      if (!from || !to) continue;
      const key = `${from.id}\n${to.id}`;
      if (!lanes.has(key)) lanes.set(key, lanes.size);
      resolved.set(route.id, {
        route,
        from,
        to,
        curve: checkSignalCurve(from, to, width, lanes.get(key)),
      });
    }
    if (!animate) this.hovered = null;
    const active = animate
      ? activeTransfers(snapshot).filter((flow) => flow.recorded)
      : [];
    const retained = new Set<string>();
    for (const flow of active) {
      if (flow.phase === "processing") continue;
      const info = resolved.get(flow.correlationId);
      if (!info) continue;
      retained.add(flow.id);
      let entry = this.packets.get(flow.id);
      if (!entry) {
        const doc = this.element.ownerDocument;
        const group = doc.createElementNS(svgNamespace, "g");
        const marks = [1.5, 2.1, 3.2].map((r) => {
          const mark = doc.createElementNS(svgNamespace, "circle");
          mark.setAttribute("r", String(r));
          group.append(mark);
          return mark;
        });
        const ripple = doc.createElementNS(svgNamespace, "circle");
        ripple.classList.add("cmd-check-arrival");
        group.prepend(ripple);
        const hit = doc.createElement("button");
        hit.type = "button";
        hit.className = "cmd-check-hit";
        hit.addEventListener("pointerdown", (event) => event.stopPropagation());
        hit.addEventListener("pointerenter", () => {
          this.hovered = flow.id;
          this.invalidate?.();
        });
        hit.addEventListener("pointerleave", () => {
          if (this.hovered === flow.id) {
            this.hovered = null;
            this.invalidate?.();
          }
        });
        hit.addEventListener("focus", () => {
          this.hovered = flow.id;
          this.invalidate?.();
        });
        hit.addEventListener("blur", () => {
          if (this.hovered === flow.id) {
            this.hovered = null;
            this.invalidate?.();
          }
        });
        hit.addEventListener("click", () => {
          const packet = this.packets.get(flow.id);
          if (packet) this.inspect?.(packet.selection);
        });
        this.hits.append(hit);
        this.layer.append(group);
        entry = {
          group,
          marks,
          ripple,
          hit,
          selection: {
            route: info.route,
            fromLabel: info.route.fromLabel ?? info.from.label,
            toLabel: info.route.toLabel ?? info.to.label,
            phase: flow.phase,
          },
          curve: info.curve,
          progress: 0,
        };
        this.packets.set(flow.id, entry);
      }
      if (this.hovered !== flow.id) {
        entry.progress = (snapshot.time - flow.start) / flow.duration;
        entry.curve = info.curve;
      }
      entry.selection = {
        route: info.route,
        fromLabel: info.route.fromLabel ?? info.from.label,
        toLabel: info.route.toLabel ?? info.to.label,
        phase: flow.phase,
      };
    }
    // A hovered dot holds its last recorded position, including after its phase ends.
    if (animate && this.hovered) {
      const entry = this.packets.get(this.hovered);
      if (entry && resolved.has(entry.selection.route.id))
        retained.add(this.hovered);
    }
    for (const [id, entry] of this.packets) {
      if (!retained.has(id)) {
        entry.group.remove();
        entry.hit.remove();
        this.packets.delete(id);
        if (this.hovered === id) this.hovered = null;
        continue;
      }
      const reverse = entry.selection.phase === "response";
      const t = reverse ? 1 - entry.progress : entry.progress;
      const point = checkSignalPoint(entry.curve, t);
      attribute(entry.group, "transform", `translate(${point.x},${point.y})`);
      attribute(entry.group, "data-check-packet", entry.selection.phase);
      attribute(
        entry.group,
        "data-failed",
        String(entry.selection.route.failed),
      );
      attribute(entry.group, "data-held", String(this.hovered === id));
      entry.marks.forEach((mark, index) => {
        const tail = checkSignalPoint(
          entry.curve,
          t + (reverse ? 1 : -1) * (2 - index) * 0.026,
        );
        attribute(mark, "cx", String(tail.x - point.x));
        attribute(mark, "cy", String(tail.y - point.y));
        attribute(mark, "opacity", String([0.2, 0.42, 1][index]));
      });
      const arrival = Math.max(0, (entry.progress - 0.88) / 0.12);
      attribute(entry.ripple, "r", String(5 + arrival * 7));
      attribute(
        entry.ripple,
        "opacity",
        String(arrival > 0 ? (1 - arrival) * 0.45 : 0),
      );
      entry.hit.style.left = `${point.x}px`;
      entry.hit.style.top = `${point.y}px`;
      entry.hit.hidden = pins.some(
        (pin) =>
          point.x >= pin.x - pin.width / 2 - 3 &&
          point.x <= pin.x + pin.width / 2 + 3 &&
          point.y >= pin.y - pin.height - 3 &&
          point.y <= pin.y + 3,
      );
      const selection = entry.selection;
      attribute(
        entry.hit,
        "aria-label",
        `Inspect ${selection.route.protocol.toUpperCase()} ${reverse ? "response" : "request"}: ${selection.fromLabel} to ${selection.toLabel}, ${Math.round(selection.route.responseTimeMs)} ms, ${selection.route.failed ? "failing" : "passing"}`,
      );
    }
    const selected = this.hovered
      ? this.packets.get(this.hovered)?.selection.route
      : inspected;
    const info = selected
      ? [...resolved.values()].find(
          (item) =>
            item.route.from === selected.from && item.route.to === selected.to,
        )
      : undefined;
    const curve = info?.curve;
    attribute(
      this.guide,
      "d",
      curve
        ? `M${curve[0].x},${curve[0].y} C${curve[1].x},${curve[1].y} ${curve[2].x},${curve[2].y} ${curve[3].x},${curve[3].y}`
        : "",
    );
    const display = this.packets.size || curve ? "" : "none";
    if (this.element.style.display !== display)
      this.element.style.display = display;
    attribute(this.element, "data-route-count", String(lanes.size));
    attribute(this.element, "data-packet-count", String(this.packets.size));
  }
  dispose() {
    this.element.remove();
    this.hits.remove();
    this.packets.clear();
  }
}
