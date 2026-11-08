import type { ReactNode } from "react";
import type { RecordKind } from "../content/world";

// Small line glyphs drawn on a 20-unit grid, one per record kind. They share
// the mark's stroke language: round caps, a single weight, terminal dots.
export function Glyph({ kind }: { kind: RecordKind }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="20"
      height="20"
      aria-hidden="true"
      focusable="false"
      className="glyph"
    >
      {paths[kind]}
    </svg>
  );
}

const paths: Record<RecordKind, ReactNode> = {
  check: (
    <>
      <circle cx="10" cy="10" r="6.5" className="g-line" />
      <circle cx="10" cy="10" r="2.2" className="g-fill" />
    </>
  ),
  service: (
    <>
      <rect x="3.5" y="4" width="13" height="5" rx="1.6" className="g-line" />
      <rect x="3.5" y="11" width="13" height="5" rx="1.6" className="g-line" />
      <circle cx="13.4" cy="6.5" r="1" className="g-fill" />
      <circle cx="13.4" cy="13.5" r="1" className="g-fill" />
    </>
  ),
  host: (
    <>
      <rect x="3" y="3.5" width="14" height="10" rx="1.8" className="g-line" />
      <path d="M7 16.5h6M10 13.5v3" className="g-line" />
    </>
  ),
  project: (
    <>
      <path d="M14 5H9.6C7 5 5 7.2 5 10s2 5 4.6 5H14" className="g-line" />
      <circle cx="14.2" cy="5" r="1.8" className="g-fill" />
      <circle cx="14.2" cy="15" r="1.8" className="g-fill" />
    </>
  ),
  repository: (
    <>
      <circle cx="6" cy="5" r="1.9" className="g-line" />
      <circle cx="6" cy="15" r="1.9" className="g-line" />
      <circle cx="14" cy="8" r="1.9" className="g-line" />
      <path d="M6 6.9v6.2M14 9.9c0 2.6-3.4 2.4-6.6 4" className="g-line" />
    </>
  ),
  capture: (
    <>
      <path d="M4.5 4.5h11v8.2L11.7 16H4.5z" className="g-line" />
      <path d="M7.5 8h5M7.5 11h3" className="g-line" />
    </>
  ),
  runbook: (
    <>
      <path d="M5 3.8h8.6l1.9 1.9v10.5H5z" className="g-line" />
      <path d="M8 8.2h5M8 11.2h5M8 14h2.6" className="g-line" />
    </>
  ),
  work: (
    <>
      <rect
        x="3.8"
        y="3.8"
        width="12.4"
        height="12.4"
        rx="3"
        className="g-line"
      />
      <path d="M7.3 10.2l2 2 3.6-4.2" className="g-line" />
    </>
  ),
  brief: (
    <>
      <path d="M4 5.5h12M4 10h12M4 14.5h7" className="g-line" />
      <circle cx="15" cy="14.5" r="1.6" className="g-fill" />
    </>
  ),
};
