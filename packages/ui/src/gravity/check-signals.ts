import { activeTransfers, type ActivitySnapshot } from "./activity-types";

export type RecordedCheckRoute = {
  id: string;
  from: string;
  to: string;
  protocol: "http" | "tcp";
  responseTimeMs: number;
  observedAt: string;
  failed: boolean;
};
export type CheckEndpoint = {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
};
type Point = { x: number; y: number };
type Curve = [Point, Point, Point, Point];

/** Route through the free outside margin, beyond the resource pins. */
export function checkSignalCurve(
  from: CheckEndpoint,
  to: CheckEndpoint,
  width: number,
  lane = 0,
): Curve {
  const same = from.id === to.id;
  const a = {
    x: Math.min(width - 14, from.x + from.width / 2 + 5),
    y: from.y - from.height / 2 - (same ? 9 : 0),
  };
  const b = {
    x: Math.min(width - 14, to.x + to.width / 2 + 5),
    y: to.y - to.height / 2 + (same ? 9 : 0),
  };
  const outside = Math.max(18, width - 18 - lane * 12);
  const control = (outside - (a.x + b.x) / 8) / 0.75;
  return [
    a,
    { x: control, y: a.y - (same ? 85 : 30) },
    { x: control, y: b.y + (same ? 85 : 30) },
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

/** Foreground evidence paths. Terrain depth and pin backgrounds cannot bury packets. */
export class CheckSignalOverlay {
  readonly element: SVGSVGElement;
  private layer: SVGGElement;
  private exclusions: SVGPathElement;
  private mask: SVGMaskElement;
  private maskBackground: SVGRectElement;
  private routes = new Map<
    string,
    { group: SVGGElement; path: SVGPathElement; title: SVGTitleElement }
  >();
  private packets = new Map<
    string,
    { group: SVGGElement; text: SVGTextElement }
  >();
  constructor(container: HTMLElement) {
    const doc = container.ownerDocument;
    this.element = doc.createElementNS(svgNamespace, "svg");
    this.element.classList.add("cmd-check-signals");
    this.element.style.display = "none";
    this.element.setAttribute("role", "img");
    this.element.setAttribute(
      "aria-label",
      "Recorded health-check routes and moving request and response signals",
    );
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
    this.element.append(definitions, this.layer);
    container.append(this.element);
  }
  update(
    routes: readonly RecordedCheckRoute[],
    snapshot: ActivitySnapshot,
    endpoint: (id: string) => CheckEndpoint | null,
    width: number,
    height: number,
    animate: boolean,
    pins: readonly CheckEndpoint[] = [],
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
    const grouped = new Map<
      string,
      { from: CheckEndpoint; to: CheckEndpoint; routes: RecordedCheckRoute[] }
    >();
    const routeGroups = new Map<string, string>();
    for (const route of routes) {
      const from = endpoint(route.from),
        to = endpoint(route.to);
      if (!from || !to) continue;
      const key = `${from.id}\n${to.id}`;
      const group = grouped.get(key) ?? { from, to, routes: [] };
      group.routes.push(route);
      grouped.set(key, group);
      routeGroups.set(route.id, key);
    }
    const display = grouped.size ? "" : "none";
    if (this.element.style.display !== display)
      this.element.style.display = display;
    const curves = new Map<string, Curve>();
    let lane = 0;
    for (const [key, group] of [...grouped].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      const curve = checkSignalCurve(group.from, group.to, width, lane++ % 6);
      curves.set(key, curve);
      let entry = this.routes.get(key);
      if (!entry) {
        const node = this.element.ownerDocument.createElementNS(
          svgNamespace,
          "g",
        );
        const title = this.element.ownerDocument.createElementNS(
          svgNamespace,
          "title",
        );
        const path = this.element.ownerDocument.createElementNS(
          svgNamespace,
          "path",
        );
        node.append(title, path);
        this.layer.prepend(node);
        entry = { group: node, path, title };
        this.routes.set(key, entry);
      }
      const [a, b, c, d] = curve;
      attribute(
        entry.path,
        "d",
        `M${a.x},${a.y} C${b.x},${b.y} ${c.x},${c.y} ${d.x},${d.y}`,
      );
      attribute(entry.group, "data-check-route", key);
      attribute(
        entry.group,
        "data-failed",
        String(group.routes.some((route) => route.failed)),
      );
      const title =
        `${group.from.label} to ${group.to.label}: ${group.routes.length} recorded checks. ` +
        group.routes
          .map(
            (route) =>
              `${route.protocol.toUpperCase()}, ${route.failed ? "failing" : "passing"}, ${Math.round(route.responseTimeMs)} ms, ${route.observedAt}`,
          )
          .join("; ");
      if (entry.title.textContent !== title) entry.title.textContent = title;
    }
    for (const [key, entry] of this.routes)
      if (!grouped.has(key)) {
        entry.group.remove();
        this.routes.delete(key);
      }
    const active = animate
      ? activeTransfers(snapshot).filter((flow) => flow.recorded)
      : [];
    const activeKeys = new Set<string>();
    const activeGroups = new Set<string>();
    for (const flow of active) {
      const key = routeGroups.get(flow.correlationId);
      const curve = key ? curves.get(key) : undefined;
      const route = routes.find((item) => item.id === flow.correlationId);
      if (!curve || !route || !key) continue;
      activeKeys.add(flow.id);
      activeGroups.add(key);
      let entry = this.packets.get(flow.id);
      if (!entry) {
        const doc = this.element.ownerDocument;
        const group = doc.createElementNS(svgNamespace, "g");
        const arrow = doc.createElementNS(svgNamespace, "path");
        arrow.setAttribute("d", "M11 0 L-8 -7 L-4 0 L-8 7 Z");
        arrow.classList.add("cmd-check-packet-arrow");
        const text = doc.createElementNS(svgNamespace, "text");
        group.append(arrow, text);
        this.layer.append(group);
        entry = { group, text };
        this.packets.set(flow.id, entry);
      }
      const reverse = flow.phase === "response";
      const progress = (snapshot.time - flow.start) / flow.duration;
      const t = reverse ? 1 - progress : progress;
      const point = checkSignalPoint(curve, t);
      const ahead = checkSignalPoint(curve, t + (reverse ? -0.005 : 0.005));
      const angle =
        (Math.atan2(ahead.y - point.y, ahead.x - point.x) * 180) / Math.PI;
      attribute(entry.group, "transform", `translate(${point.x},${point.y})`);
      attribute(entry.group, "data-check-packet", flow.phase);
      attribute(entry.group, "data-failed", String(route.failed));
      attribute(
        entry.group.firstElementChild!,
        "transform",
        `rotate(${angle})`,
      );
      const textX =
        width < 220 ? width / 2 : Math.max(110, Math.min(width - 110, point.x));
      attribute(entry.text, "x", String(textX - point.x));
      attribute(entry.text, "y", "-12");
      attribute(entry.text, "text-anchor", "middle");
      const label = `${route.protocol.toUpperCase()} ${reverse ? "response" : "request"}: ${grouped.get(key)!.to.label}`;
      if (entry.text.textContent !== label) entry.text.textContent = label;
    }
    for (const [key, entry] of this.packets)
      if (!activeKeys.has(key)) {
        entry.group.remove();
        this.packets.delete(key);
      }
    for (const [key, entry] of this.routes)
      attribute(entry.group, "data-active", String(activeGroups.has(key)));
    attribute(this.element, "data-route-count", String(grouped.size));
    attribute(this.element, "data-packet-count", String(activeKeys.size));
  }
  dispose() {
    this.element.remove();
  }
}
