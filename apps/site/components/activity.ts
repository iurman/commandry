"use client";

import {
  useEffect,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

// Server render assumes motion is reduced, so nothing animates before the
// client has actually read the preference.
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => true,
  );
}

function subscribeVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

export function usePageVisible(): boolean {
  return useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState === "visible",
    () => false,
  );
}

export function useInView(
  ref: RefObject<Element | null>,
  threshold = 0.25,
): boolean {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) setInView(entry.isIntersecting);
      },
      { threshold },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, threshold]);
  return inView;
}

// Draws Observatory-style check marks: a compact head with two diminishing
// trail points behind it, and a restrained ring on arrival.
export type Trail = {
  head: SVGCircleElement;
  trail: [SVGCircleElement, SVGCircleElement];
  ring: SVGCircleElement;
};

const SVG_NS = "http://www.w3.org/2000/svg";

export function createTrail(layer: SVGGElement, tone: string): Trail {
  const make = (className: string) => {
    const circle = document.createElementNS(SVG_NS, "circle");
    circle.setAttribute("class", `${className} ${tone}`);
    circle.setAttribute("r", "0");
    layer.appendChild(circle);
    return circle;
  };
  return {
    ring: make("pk-ring"),
    trail: [make("pk-trail pk-trail-2"), make("pk-trail pk-trail-1")],
    head: make("pk-head"),
  };
}

export function removeTrail(trail: Trail) {
  trail.head.remove();
  trail.ring.remove();
  for (const point of trail.trail) point.remove();
}

const ease = (t: number) => 1 - Math.pow(1 - t, 3);

// progress: 0..1 along the path; arrival: 0..1 after reaching the end.
export function drawTrail(
  trail: Trail,
  path: SVGPathElement,
  progress: number,
  arrival: number,
  reverse = false,
) {
  const length = path.getTotalLength();
  const at = (t: number) => {
    const clamped = Math.min(1, Math.max(0, t));
    return path.getPointAtLength((reverse ? 1 - clamped : clamped) * length);
  };
  const moving = progress > 0 && progress < 1;
  const eased = ease(progress);
  const place = (circle: SVGCircleElement, t: number, r: number) => {
    const point = at(t);
    circle.setAttribute("cx", point.x.toFixed(2));
    circle.setAttribute("cy", point.y.toFixed(2));
    circle.setAttribute("r", moving ? String(r) : "0");
  };
  const spacing = 14 / Math.max(length, 1);
  place(trail.head, eased, 3.6);
  place(trail.trail[1], eased - spacing, 2.4);
  place(trail.trail[0], eased - spacing * 2, 1.5);
  if (arrival > 0 && arrival < 1) {
    const end = at(1);
    trail.ring.setAttribute("cx", end.x.toFixed(2));
    trail.ring.setAttribute("cy", end.y.toFixed(2));
    trail.ring.setAttribute("r", (5 + 13 * ease(arrival)).toFixed(2));
    trail.ring.style.opacity = String(0.7 * (1 - arrival));
  } else {
    trail.ring.setAttribute("r", "0");
  }
}
