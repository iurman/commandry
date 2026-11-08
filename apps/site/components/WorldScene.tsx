"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  edgeGeometry,
  exampleCounts,
  layouts,
  recordById,
  records,
  relationById,
  relations,
  relationsOf,
  steps,
  type LayoutName,
} from "../content/world";
import {
  createTrail,
  drawTrail,
  removeTrail,
  useInView,
  usePageVisible,
  useReducedMotion,
  type Trail,
} from "./activity";
import { Glyph } from "./Glyph";

const STEP_MS = 4200;
const TRAVEL_MS = 1150;
const ARRIVAL_MS = 650;
const layoutNames = Object.keys(layouts) as LayoutName[];
const hiddenUntilRevealed = new Set(steps.flatMap((step) => step.reveals));

function stateAt(index: number) {
  const visited = steps.slice(0, index + 1);
  const current = steps[index] ?? steps[0]!;
  return {
    current,
    focus: new Set(current.focus),
    seen: new Set(visited.flatMap((step) => step.focus)),
    active: new Set(current.edges),
    visitedEdges: new Set(visited.flatMap((step) => step.edges)),
    revealed: new Set(visited.flatMap((step) => step.reveals)),
  };
}

export function WorldScene() {
  const frame = useRef<HTMLDivElement>(null);
  const stages = useRef<Partial<Record<LayoutName, SVGSVGElement | null>>>({});
  const inspector = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const visible = usePageVisible();
  const inView = useInView(frame, 0.3);

  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [finished, setFinished] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const autoplayed = useRef(false);
  // Bumped on every (re)start so packets replay for the same step.
  const [run, setRun] = useState(0);

  const view = useMemo(() => stateAt(step), [step]);
  const running = playing && inView && visible && !selected;

  // Start once, the first time the instrument is meaningfully in view.
  useEffect(() => {
    if (inView && visible && !reduced && !autoplayed.current) {
      autoplayed.current = true;
      setPlaying(true);
      setRun((value) => value + 1);
    }
  }, [inView, visible, reduced]);

  // Finite sequence: advance until the brief, then stop.
  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => {
      if (step >= steps.length - 1) {
        setPlaying(false);
        setFinished(true);
      } else {
        setStep(step + 1);
        setRun((value) => value + 1);
      }
    }, STEP_MS);
    return () => window.clearTimeout(timer);
  }, [running, step, run]);

  // Packets for the current step travel once along their relations.
  useEffect(() => {
    if (!running || reduced) return;
    const svg = layoutNames
      .map((name) => stages.current[name])
      .find((element) => element && element.getBoundingClientRect().width > 0);
    const layer = svg?.querySelector<SVGGElement>("[data-packets]");
    if (!svg || !layer) return;
    const trails: Array<{
      trail: Trail;
      path: SVGPathElement;
      reverse: boolean;
      delay: number;
    }> = [];
    for (const packet of view.current.packets) {
      const path = svg.querySelector<SVGPathElement>(
        `[data-edge="${packet.edge}"]`,
      );
      if (!path) continue;
      trails.push({
        trail: createTrail(layer, "tone-signal"),
        path,
        reverse: packet.reverse ?? false,
        delay: packet.delay,
      });
    }
    const started = performance.now();
    let handle = 0;
    const tick = (now: number) => {
      let pending = false;
      for (const item of trails) {
        const elapsed = now - started - item.delay;
        const progress = Math.min(1, Math.max(0, elapsed / TRAVEL_MS));
        const arrival = Math.min(
          1,
          Math.max(0, (elapsed - TRAVEL_MS) / ARRIVAL_MS),
        );
        drawTrail(item.trail, item.path, progress, arrival, item.reverse);
        if (arrival < 1) pending = true;
      }
      if (pending) handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(handle);
      for (const item of trails) removeTrail(item.trail);
    };
  }, [running, reduced, view, run]);

  const goTo = (index: number) => {
    setSelected(null);
    setPlaying(false);
    setFinished(index === steps.length - 1);
    setStep(index);
  };

  const togglePlay = () => {
    setSelected(null);
    if (playing) {
      setPlaying(false);
      return;
    }
    if (finished || step >= steps.length - 1) {
      setStep(0);
      setFinished(false);
    }
    setPlaying(true);
    setRun((value) => value + 1);
  };

  const select = (id: string) => {
    setPlaying(false);
    setSelected((current) => (current === id ? null : id));
  };

  useEffect(() => {
    if (!selected || !inspector.current) return;
    const rect = inspector.current.getBoundingClientRect();
    if (rect.top > window.innerHeight || rect.bottom < 0) {
      inspector.current.scrollIntoView({
        block: "nearest",
        behavior: reduced ? "auto" : "smooth",
      });
    }
  }, [selected, reduced]);

  const selectedRecord = selected ? recordById(selected) : null;
  const playLabel = playing ? "Pause" : finished ? "Replay" : "Play";

  return (
    <div className="instrument" ref={frame} data-running={running || undefined}>
      <div className="instrument-bar">
        <p className="eyebrow">
          <span className="eyebrow-dot" aria-hidden="true" />
          Illustrative example, fictional records
        </p>
        <button
          type="button"
          className="control"
          onClick={togglePlay}
          aria-label={`${playLabel} the example sequence`}
        >
          <PlayGlyph state={playing ? "pause" : finished ? "replay" : "play"} />
          <span>{playLabel}</span>
        </button>
      </div>

      <div className="instrument-body">
        <div className="scene" aria-label="Lantern project relationship map">
          {layoutNames.map((name) => (
            <SceneStage
              key={name}
              name={name}
              view={view}
              selected={selected}
              onSelect={select}
              svgRef={(element) => {
                stages.current[name] = element;
              }}
            />
          ))}
        </div>

        <div className="rail" ref={inspector}>
          {selectedRecord ? (
            <div className="inspector" aria-live="polite">
              <p className="mono-label">
                <Glyph kind={selectedRecord.kind} />
                {selectedRecord.kindLabel}
              </p>
              <h3 className="inspector-title">{selectedRecord.name}</h3>
              <p className="inspector-copy">{selectedRecord.summary}</p>
              <dl className="inspector-facts">
                <div>
                  <dt>Related</dt>
                  <dd>
                    <ul>
                      {relationsOf(selectedRecord.id).map((relation) => {
                        const outgoing = relation.from === selectedRecord.id;
                        const other = recordById(
                          outgoing ? relation.to : relation.from,
                        );
                        return (
                          <li key={relation.id}>
                            {outgoing ? (
                              <>
                                <span className="rel-verb">
                                  {relation.label}
                                </span>{" "}
                                {other.name}
                              </>
                            ) : (
                              <>
                                {other.name}{" "}
                                <span className="rel-verb">
                                  {relation.label} it
                                </span>
                              </>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </dd>
                </div>
                <div>
                  <dt>What changed</dt>
                  <dd>{selectedRecord.changed}</dd>
                </div>
              </dl>
              <button
                type="button"
                className="text-button"
                onClick={() => setSelected(null)}
              >
                Back to the sequence
              </button>
            </div>
          ) : (
            <ol className="steps" aria-label="Example sequence">
              {steps.map((item, index) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="step"
                    aria-current={index === step ? "step" : undefined}
                    data-done={index < step || undefined}
                    onClick={() => goTo(index)}
                  >
                    <span className="step-head">
                      <span className="step-time">{item.time}</span>
                      <span className="step-title">{item.title}</span>
                    </span>
                    <span className="step-body">{item.body}</span>
                    {index === step ? (
                      <span
                        key={`${item.id}-${run}`}
                        className="step-progress"
                        data-paused={!running || undefined}
                        style={{ animationDuration: `${STEP_MS}ms` }}
                        aria-hidden="true"
                      />
                    ) : null}
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      <dl className="tally">
        <div>
          <dt>Records</dt>
          <dd>{exampleCounts.records}</dd>
        </div>
        <div>
          <dt>Relations</dt>
          <dd>{exampleCounts.relations}</dd>
        </div>
        <div>
          <dt>Resources</dt>
          <dd>{exampleCounts.resources}</dd>
        </div>
        <div>
          <dt>Knowledge</dt>
          <dd>{exampleCounts.knowledge}</dd>
        </div>
        <div>
          <dt>Signal</dt>
          <dd>{exampleCounts.signals}</dd>
        </div>
      </dl>
    </div>
  );
}

type View = ReturnType<typeof stateAt>;

function SceneStage({
  name,
  view,
  selected,
  onSelect,
  svgRef,
}: {
  name: LayoutName;
  view: View;
  selected: string | null;
  onSelect: (id: string) => void;
  svgRef: (element: SVGSVGElement | null) => void;
}) {
  const layout = layouts[name];
  const points: Record<string, { x: number; y: number }> = layout.points;
  const isHidden = (id: string) =>
    hiddenUntilRevealed.has(id) && !view.revealed.has(id);

  return (
    <div
      className="stage"
      data-layout={name}
      style={{ aspectRatio: `${layout.width} / ${layout.height}` }}
    >
      <svg
        ref={svgRef}
        className="stage-svg"
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        aria-hidden="true"
        focusable="false"
      >
        <g>
          {relations.map((relation) => {
            const geometry = edgeGeometry(name, relation);
            const hidden = isHidden(relation.from) || isHidden(relation.to);
            const state = view.active.has(relation.id)
              ? "active"
              : view.visitedEdges.has(relation.id)
                ? "visited"
                : "idle";
            const touchesSelection =
              selected !== null &&
              (relation.from === selected || relation.to === selected);
            return (
              <g
                key={relation.id}
                className="edge"
                data-state={state}
                data-hidden={hidden || undefined}
                data-selected={touchesSelection || undefined}
              >
                <path d={geometry.d} className="edge-base" pathLength={1} />
                <path d={geometry.d} className="edge-live" pathLength={1} />
                <path
                  d={geometry.d}
                  data-edge={relation.id}
                  className="edge-track"
                />
                <text
                  x={geometry.mid.x}
                  y={geometry.mid.y - 7}
                  className="edge-label"
                  textAnchor="middle"
                >
                  {relationById(relation.id).label}
                </text>
              </g>
            );
          })}
        </g>
        <g data-packets="" />
      </svg>

      {records.map((record) => {
        const point = points[record.id];
        if (!point) return null;
        const hidden = isHidden(record.id);
        const state = view.focus.has(record.id)
          ? "focus"
          : view.seen.has(record.id)
            ? "seen"
            : "idle";
        const attention = record.id === "service" || record.id === "check";
        return (
          <button
            key={record.id}
            type="button"
            className="node"
            data-kind={record.kind}
            data-state={state}
            data-hidden={hidden || undefined}
            data-attention={attention || undefined}
            aria-pressed={selected === record.id}
            aria-hidden={hidden || undefined}
            tabIndex={hidden ? -1 : 0}
            onClick={() => onSelect(record.id)}
            style={{
              left: `${(point.x / layout.width) * 100}%`,
              top: `${(point.y / layout.height) * 100}%`,
            }}
          >
            <span className="node-tile">
              <Glyph kind={record.kind} />
            </span>
            <span className="node-text">
              <span className="node-name">
                {name === "tall" ? record.short : record.name}
              </span>
              <span className="node-kind">{record.kindLabel}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function PlayGlyph({ state }: { state: "play" | "pause" | "replay" }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      aria-hidden="true"
      focusable="false"
    >
      {state === "pause" ? (
        <path d="M5.5 3.5v9M10.5 3.5v9" className="g-line" />
      ) : state === "replay" ? (
        <>
          <path d="M12.6 8.6A4.7 4.7 0 1 1 11 4.6" className="g-line" />
          <path d="M11.4 2.2v2.7H8.7" className="g-line" />
        </>
      ) : (
        <path d="M5 3.2l7.4 4.8L5 12.8z" className="g-fill" />
      )}
    </svg>
  );
}
