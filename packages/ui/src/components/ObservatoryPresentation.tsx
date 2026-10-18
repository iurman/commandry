"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import type { BriefingTone, ObservatoryBriefing } from "../gravity/briefing";
import type { OperationalRepresentation } from "../gravity/operational-layout";

const glyphs = "01<>/{}[]=+*#%&$";

/** Text that resolves from code glyphs, left to right. The complete text is in
 * the accessible tree from the start; without motion it is shown at once. */
export function DecodeText({
  text,
  active,
  delay = 0,
}: {
  text: string;
  active: boolean;
  /** Milliseconds before this line starts resolving. */
  delay?: number;
}) {
  const shown = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const element = shown.current;
    if (!element) return;
    if (!active || typeof requestAnimationFrame !== "function") {
      element.textContent = text;
      return;
    }
    const duration = Math.min(1400, Math.max(380, text.length * 20));
    let frame = 0,
      start: number | null = null;
    const step = (now: number) => {
      start ??= now + delay;
      const progress = (now - start) / duration;
      if (progress >= 1) {
        element.textContent = text;
        return;
      }
      const resolved = Math.max(0, Math.floor(progress * text.length));
      let next = text.slice(0, resolved);
      for (let i = resolved; i < Math.min(text.length, resolved + 6); i++)
        next +=
          text[i] === " "
            ? " "
            : glyphs[Math.floor(Math.random() * glyphs.length)];
      element.textContent = next;
      frame = requestAnimationFrame(step);
    };
    element.textContent = "";
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [text, active, delay]);
  if (!active) return <span>{text}</span>;
  return (
    <span className="cmd-op-decode">
      <span className="cmd-op-visually-hidden">{text}</span>
      <span aria-hidden="true" ref={shown} />
    </span>
  );
}

const toneText: Record<BriefingTone, string> = {
  impact: "Impact",
  exposure: "Exposure",
  notice: "Notice",
};
const worst = (briefing: ObservatoryBriefing) =>
  briefing.issues[0]?.tone ?? "neutral";

/** The stage's briefing for the framed subject. Labels avoid it. */
export function ObservatoryBriefingCard({
  briefing,
  eyebrow,
  motion,
  revision,
}: {
  briefing: ObservatoryBriefing;
  eyebrow: string;
  motion: boolean;
  /** Changes whenever the briefing should resolve again, such as a new stop. */
  revision: string;
}) {
  const issues = briefing.issues.slice(0, 3);
  return (
    <div
      className="cmd-op-stage-caption cmd-op-briefing-card"
      data-gravity-obstacle
      data-tone={worst(briefing)}
      aria-live="polite"
    >
      <span>{eyebrow}</span>
      <strong>{briefing.title}</strong>
      <p key={`headline:${revision}`} className="cmd-op-briefing-headline">
        <DecodeText text={briefing.headline} active={motion} />
      </p>
      <ul className="cmd-op-briefing-facts">
        {/* The overview stays compact; the inspector holds landscape facts. */}
        {briefing.facts
          .slice(0, briefing.subjectId ? 3 : 0)
          .map((fact, index) => (
            <li key={`${revision}:${index}`}>
              <DecodeText
                text={fact}
                active={motion}
                delay={(index + 1) * 260}
              />
            </li>
          ))}
      </ul>
      {issues.length > 0 && (
        <ul className="cmd-op-briefing-issues">
          {issues.map((issue) => (
            <li key={`${issue.id}:${issue.text}`} data-tone={issue.tone}>
              <span>{toneText[issue.tone]}</span> {issue.label}: {issue.text}
            </li>
          ))}
          {briefing.issues.length > issues.length && (
            <li>
              {briefing.issues.length - issues.length} more in the inspector
              briefing
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/** The complete briefing: every member group in full, each selectable. */
export function ObservatoryBriefingDetails({
  briefing,
  activate,
}: {
  briefing: ObservatoryBriefing;
  activate: (id: string) => void;
}) {
  return (
    <details className="cmd-op-briefing-details" open>
      <summary>Briefing</summary>
      <p>{briefing.headline}</p>
      <ul className="cmd-op-briefing-facts">
        {briefing.facts.map((fact) => (
          <li key={fact}>{fact}</li>
        ))}
      </ul>
      {briefing.issues.length > 0 && (
        <div className="cmd-op-briefing-group">
          <p className="cmd-op-briefing-group-title">
            Needs attention ({briefing.issues.length})
          </p>
          <ul aria-label="Needs attention">
            {briefing.issues.map((issue) => (
              <li key={`${issue.id}:${issue.text}`} data-tone={issue.tone}>
                <button type="button" onClick={() => activate(issue.id)}>
                  {issue.label}
                  <small>
                    {toneText[issue.tone]}: {issue.text}
                  </small>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {briefing.groups.map((group) => (
        <div className="cmd-op-briefing-group" key={group.title}>
          <p className="cmd-op-briefing-group-title">
            {group.title} ({group.items.length})
          </p>
          <ul aria-label={group.title}>
            {group.items.map((item) => (
              <li key={item.id} data-tone={item.tone}>
                <button type="button" onClick={() => activate(item.id)}>
                  {item.label}
                  {(item.note || item.tone) && (
                    <small>
                      {[item.note, item.tone && toneText[item.tone]]
                        .filter(Boolean)
                        .join(" / ")}
                    </small>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {briefing.activity.length > 0 && (
        <div className="cmd-op-briefing-group">
          <p className="cmd-op-briefing-group-title">
            Recent recorded activity
          </p>
          <ul aria-label="Recent recorded activity">
            {briefing.activity.map((event) => (
              <li key={event.id}>
                <button type="button" onClick={() => activate(event.subjectId)}>
                  {event.label}
                  <small>
                    {event.summary} / {event.age || event.occurredAt}
                  </small>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </details>
  );
}

/** Every primary group along the stage bottom, in visiting order. */
export function ObservatoryRoster({
  groups,
  activeId,
  progress,
  attentionFor,
  kindName,
  mark,
  activate,
  highlight,
  children,
}: {
  groups: OperationalRepresentation[];
  activeId: string | null;
  /** The current presentation stop, whose chip shows its progress. */
  progress: { id: string; seconds: number; sequence: number } | null;
  attentionFor: (
    node: OperationalRepresentation,
  ) => "impact" | "exposure" | "neutral";
  kindName: (node: OperationalRepresentation) => string;
  mark: (node: OperationalRepresentation) => ReactNode;
  activate: (id: string) => void;
  highlight: (id: string | null) => void;
  /** Stage controls at the rail's start. */
  children: ReactNode;
}) {
  return (
    <div className="cmd-op-roster" data-gravity-obstacle>
      <div className="cmd-op-stage-actions">{children}</div>
      {groups.length > 0 && (
        <nav aria-label="Primary groups">
          <ol>
            {groups.map((node) => {
              const attention = attentionFor(node);
              return (
                <li key={node.id}>
                  <button
                    type="button"
                    data-attention={attention}
                    aria-current={node.id === activeId ? "true" : undefined}
                    aria-label={`${node.label}: ${kindName(node)}, ${node.memberCount} unique resources${
                      attention === "impact"
                        ? ", confirmed impact"
                        : attention === "exposure"
                          ? ", potential exposure"
                          : ""
                    }`}
                    onClick={() => activate(node.id)}
                    onPointerEnter={() => highlight(node.id)}
                    onPointerLeave={() => highlight(null)}
                    onFocus={() => highlight(node.id)}
                    onBlur={() => highlight(null)}
                  >
                    {mark(node)}
                    <span>{node.label}</span>
                    <small>{node.memberCount}</small>
                    {attention !== "neutral" && (
                      <small className="cmd-op-roster-attention">
                        {attention === "impact" ? "Impact" : "Exposure"}
                      </small>
                    )}
                    {progress?.id === node.id && (
                      <span
                        key={progress.sequence}
                        className="cmd-op-roster-progress"
                        aria-hidden="true"
                        style={{ animationDuration: `${progress.seconds}s` }}
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
      )}
    </div>
  );
}
