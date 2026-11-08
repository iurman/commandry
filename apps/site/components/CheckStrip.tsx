"use client";

import { useEffect, useRef, useState } from "react";
import { checkedResources, type CheckedResource } from "../content/world";
import {
  createTrail,
  drawTrail,
  removeTrail,
  useInView,
  usePageVisible,
  useReducedMotion,
  type Trail,
} from "./activity";

const TRAVEL_MS = 1500;
const ARRIVAL_MS = 700;
const CYCLE_MS = 5200;

type Group = { label: string; x: number; y: number; w: number; h: number };
type CheckLayout = {
  width: number;
  height: number;
  origin: { x: number; y: number };
  label: { x: number; y: number };
  groups: Group[];
  slots: Record<string, { x: number; y: number }>;
};

// Resources are grouped by the project that owns them. The check worker sits
// apart; its dots travel to each checked resource and never to unknown ones.
const checkLayouts: Record<"wide" | "tall", CheckLayout> = {
  wide: {
    width: 720,
    height: 330,
    origin: { x: 96, y: 165 },
    label: { x: 96, y: 205 },
    groups: [
      { label: "Lantern", x: 452, y: 18, w: 236, h: 176 },
      { label: "Shared", x: 452, y: 210, w: 236, h: 104 },
    ],
    slots: {
      atlas: { x: 478, y: 72 },
      "lantern-api": { x: 478, y: 116 },
      "reader-web": { x: 478, y: 160 },
      "edge-dns": { x: 478, y: 252 },
      "backup-target": { x: 478, y: 292 },
    },
  },
  tall: {
    width: 320,
    height: 430,
    origin: { x: 44, y: 215 },
    label: { x: 44, y: 250 },
    groups: [
      { label: "Lantern", x: 112, y: 14, w: 196, h: 186 },
      { label: "Shared", x: 112, y: 222, w: 196, h: 128 },
    ],
    slots: {
      atlas: { x: 134, y: 70 },
      "lantern-api": { x: 134, y: 116 },
      "reader-web": { x: 134, y: 162 },
      "edge-dns": { x: 134, y: 276 },
      "backup-target": { x: 134, y: 318 },
    },
  },
};

function guide(layout: CheckLayout, x: number, y: number) {
  const { origin } = layout;
  const k = (x - origin.x) * 0.55;
  return `M ${origin.x} ${origin.y} C ${origin.x + k} ${origin.y}, ${x - k} ${y}, ${x} ${y}`;
}

const stateText = (resource: CheckedResource) =>
  resource.state === "unknown"
    ? "Unknown"
    : resource.state === "attention"
      ? "Needs attention"
      : "Passing";

export function CheckStrip() {
  const root = useRef<HTMLDivElement>(null);
  const svgs = useRef<Partial<Record<string, SVGSVGElement | null>>>({});
  const reduced = useReducedMotion();
  const visible = usePageVisible();
  const inView = useInView(root, 0.2);
  const [paused, setPaused] = useState(false);
  const [inspected, setInspected] = useState<string | null>("lantern-api");

  const running = !paused && !reduced && inView && visible;

  useEffect(() => {
    if (!running) return;
    const svg = Object.values(svgs.current).find(
      (element) => element && element.getBoundingClientRect().width > 0,
    );
    const group = svg?.querySelector<SVGGElement>("[data-packets]");
    if (!svg || !group) return;
    const checked = checkedResources.filter(
      (resource) => resource.state !== "unknown",
    );
    const trails: Array<{
      trail: Trail;
      path: SVGPathElement;
      offset: number;
    }> = [];
    checked.forEach((resource, index) => {
      const path = svg.querySelector<SVGPathElement>(
        `[data-check="${resource.id}"]`,
      );
      if (!path) return;
      const tone =
        resource.state === "attention" ? "tone-attention" : "tone-signal";
      trails.push({
        trail: createTrail(group, tone),
        path,
        offset: (index * CYCLE_MS) / checked.length + index * 170,
      });
    });
    const started = performance.now();
    let handle = 0;
    const tick = (now: number) => {
      for (const item of trails) {
        const local = (now - started + CYCLE_MS - item.offset) % CYCLE_MS;
        const progress = Math.min(1, local / TRAVEL_MS);
        const arrival =
          local < TRAVEL_MS ? 0 : Math.min(1, (local - TRAVEL_MS) / ARRIVAL_MS);
        drawTrail(item.trail, item.path, progress, arrival);
      }
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(handle);
      for (const item of trails) removeTrail(item.trail);
    };
  }, [running]);

  const current =
    checkedResources.find((resource) => resource.id === inspected) ?? null;
  const toggle = (id: string) =>
    setInspected((value) => (value === id ? null : id));

  return (
    <div className="checks" ref={root}>
      <div className="checks-head">
        <p className="eyebrow">
          <span className="eyebrow-dot" aria-hidden="true" />
          Illustrative example, fictional resources
        </p>
        {reduced ? null : (
          <button
            type="button"
            className="control"
            aria-pressed={paused}
            onClick={() => setPaused((value) => !value)}
          >
            <span
              className="control-dot"
              data-on={!paused || undefined}
              aria-hidden="true"
            />
            <span>{paused ? "Resume checks" : "Pause checks"}</span>
          </button>
        )}
      </div>

      <div className="checks-body">
        <div className="checks-stages">
          {(Object.keys(checkLayouts) as Array<keyof typeof checkLayouts>).map(
            (name) => {
              const layout = checkLayouts[name];
              const pct = (x: number, y: number) => ({
                left: `${(x / layout.width) * 100}%`,
                top: `${(y / layout.height) * 100}%`,
              });
              return (
                <div
                  key={name}
                  className="checks-scene"
                  data-layout={name}
                  style={{ aspectRatio: `${layout.width} / ${layout.height}` }}
                >
                  <svg
                    ref={(element) => {
                      svgs.current[name] = element;
                    }}
                    viewBox={`0 0 ${layout.width} ${layout.height}`}
                    aria-hidden="true"
                    focusable="false"
                  >
                    {layout.groups.map((group) => (
                      <rect
                        key={group.label}
                        className="check-group"
                        x={group.x}
                        y={group.y}
                        width={group.w}
                        height={group.h}
                        rx="12"
                      />
                    ))}
                    {checkedResources.map((resource) => {
                      const slot = layout.slots[resource.id];
                      if (!slot) return null;
                      return (
                        <path
                          key={resource.id}
                          d={guide(layout, slot.x, slot.y)}
                          data-check={resource.id}
                          className="check-guide"
                          data-visible={
                            inspected === resource.id &&
                            resource.state !== "unknown"
                              ? ""
                              : undefined
                          }
                        />
                      );
                    })}
                    <g data-packets="" />
                    <circle
                      cx={layout.origin.x}
                      cy={layout.origin.y}
                      r="22"
                      className="origin-halo"
                    />
                    <circle
                      cx={layout.origin.x}
                      cy={layout.origin.y}
                      r="6"
                      className="origin-core"
                    />
                  </svg>
                  {layout.groups.map((group) => (
                    <p
                      key={group.label}
                      className="group-label"
                      style={pct(group.x + 14, group.y + 12)}
                    >
                      {group.label}
                    </p>
                  ))}
                  <p
                    className="origin-label"
                    style={pct(layout.label.x, layout.label.y)}
                  >
                    Check worker
                  </p>
                  {checkedResources.map((resource) => {
                    const slot = layout.slots[resource.id];
                    if (!slot) return null;
                    return (
                      <button
                        key={resource.id}
                        type="button"
                        className="badge"
                        data-state={resource.state}
                        aria-pressed={inspected === resource.id}
                        onClick={() => toggle(resource.id)}
                        style={pct(slot.x, slot.y)}
                      >
                        <span className="badge-state" aria-hidden="true" />
                        <span className="badge-name">{resource.name}</span>
                        <span className="sr-only">
                          , {stateText(resource).toLowerCase()}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            },
          )}
        </div>

        <div className="checks-readout" aria-live="polite">
          {current ? (
            <>
              <p className="mono-label">{current.kind}</p>
              <p className="readout-name">{current.name}</p>
              <p className="readout-state" data-state={current.state}>
                {stateText(current)}
              </p>
              <p className="readout-reading">{current.reading}</p>
            </>
          ) : (
            <p className="readout-reading">
              Select a resource to see its latest observation.
            </p>
          )}
          <ul className="readout-list">
            {checkedResources.map((resource) => (
              <li key={resource.id} data-state={resource.state}>
                <span className="badge-state" aria-hidden="true" />
                <span className="readout-list-name">{resource.name}</span>
                <span className="readout-list-reading">{resource.reading}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
