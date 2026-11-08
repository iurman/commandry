"use client";

import { useId, useState, type CSSProperties, type KeyboardEvent } from "react";
import { lensRecords, lenses, recordById } from "../content/world";
import { Glyph } from "./Glyph";

export function LensStudy() {
  const [index, setIndex] = useState(0);
  const lens = lenses[index] ?? lenses[0]!;
  const baseId = useId();

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const last = lenses.length - 1;
    const next =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? index === last
          ? 0
          : index + 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? index === 0
            ? last
            : index - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    setIndex(next);
    document.getElementById(`${baseId}-tab-${next}`)?.focus();
  };

  return (
    <div className="lens">
      <div
        className="lens-tabs"
        role="tablist"
        aria-label="Views of the same records"
      >
        {lenses.map((item, position) => (
          <button
            key={item.id}
            id={`${baseId}-tab-${position}`}
            type="button"
            role="tab"
            className="lens-tab"
            aria-selected={position === index}
            aria-controls={`${baseId}-panel`}
            tabIndex={position === index ? 0 : -1}
            onClick={() => setIndex(position)}
            onKeyDown={onKeyDown}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div
        className="lens-panel"
        id={`${baseId}-panel`}
        role="tabpanel"
        aria-labelledby={`${baseId}-tab-${index}`}
      >
        <div className="lens-copy">
          <h3 className="lens-title" key={`t-${lens.id}`}>
            {lens.title}
          </h3>
          <p className="lens-body" key={`b-${lens.id}`}>
            {lens.body}
          </p>
          <ul className="sr-only">
            {lensRecords.map((id) => {
              const record = recordById(id);
              const tag = lens.focus.includes(id) ? "in focus" : lens.tags[id];
              return (
                <li key={id}>
                  {record.name}, {record.kindLabel}: {tag}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="lens-stage" aria-hidden="true">
          <p className="lens-stage-label mono-label">Illustrative example</p>
          <span className="lens-orbit" data-lens={lens.id} />
          <svg
            className="lens-lines"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            {lensRecords.map((id) => {
              const line = connector(lens, id);
              return (
                <path
                  key={id}
                  className="lens-line"
                  data-off={line.off || undefined}
                  d={line.d}
                  style={{ d: `path("${line.d}")` } as CSSProperties}
                />
              );
            })}
          </svg>
          {lensRecords.map((id) => {
            const record = recordById(id);
            const point = lens.positions[id] ?? { x: 50, y: 50 };
            const focus = lens.focus.includes(id);
            const tag = focus ? record.kindLabel : lens.tags[id];
            const unrelated = tag === "unrelated" || tag === "not related";
            return (
              <div
                key={id}
                className="chip"
                data-kind={record.kind}
                data-focus={focus || undefined}
                data-unrelated={unrelated || undefined}
                style={{
                  transform: `translate(clamp(0.5rem, calc(${point.x}cqw - 50%), calc(100cqw - 100% - 0.5rem)), clamp(0.5rem, calc(${point.y}cqh - 50%), calc(100cqh - 100% - 2rem)))`,
                }}
              >
                <span className="chip-tile">
                  <Glyph kind={record.kind} />
                </span>
                <span className="chip-text">
                  <span className="chip-name">{record.name}</span>
                  <span className="chip-tag">{tag}</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Each record connects to the nearest record in focus. Focus records connect
// to each other; unrelated records keep a collapsed, invisible line so the
// path can animate when the lens changes.
function connector(lens: (typeof lenses)[number], id: string) {
  const at = (key: string) => lens.positions[key] ?? { x: 50, y: 50 };
  const self = at(id);
  const focus = lens.focus.filter((key) => key !== id);
  const tag = lens.tags[id];
  const unrelated = tag === "unrelated" || tag === "not related";
  const target = focus
    .map((key) => at(key))
    .sort(
      (a, b) =>
        Math.hypot(a.x - self.x, a.y - self.y) -
        Math.hypot(b.x - self.x, b.y - self.y),
    )[0];
  if (!target || unrelated) {
    return { d: `M ${self.x} ${self.y} L ${self.x} ${self.y}`, off: true };
  }
  return { d: `M ${self.x} ${self.y} L ${target.x} ${target.y}`, off: false };
}
