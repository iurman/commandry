"use client";
import { useEffect, useState } from "react";
import { captureTriageReviewSchema } from "@commandry/contracts";
import { FoundationTaskProposalPanel } from "./FoundationTaskProposalPanel";
import { FoundationFindingProposalPanel } from "./FoundationFindingProposalPanel";

type Selection = { captureId: string; projectId: string };
type Kind = "task" | "finding";
export function FoundationCaptureProposalRouter({
  captureId,
  projectId,
  active = true,
  onReviewed,
}: Selection & {
  active?: boolean;
  onReviewed: () => void;
}) {
  const scope = JSON.stringify([captureId, projectId]);
  const [reload, setReload] = useState(0);
  const [loaded, setLoaded] = useState<{
    scope: string;
    kind: Kind | null;
    error: boolean;
  }>({ scope: "", kind: null, error: false });
  const [retained, setRetained] = useState<Partial<Record<Kind, Selection>>>(
    {},
  );
  useEffect(() => {
    if (!active) return;
    let current = true;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(
          `/api/v1/captures/${encodeURIComponent(captureId)}/triage`,
          {
            cache: "no-store",
            credentials: "same-origin",
            signal: controller.signal,
          },
        );
        if (!response.ok) throw new Error("Unavailable proposal kind");
        const review = captureTriageReviewSchema.parse(await response.json());
        if (review.suggestion?.captureId !== captureId)
          throw new Error("Unavailable proposal kind");
        const rule = review.suggestion.ruleVersion;
        const kind: Kind | null =
          rule === "agent-task-proposal/v1"
            ? "task"
            : rule === "agent-finding-proposal/v1"
              ? "finding"
              : null;
        if (!kind) throw new Error("Unknown proposal kind");
        if (!current) return;
        setRetained((previous) => ({
          ...previous,
          [kind]: { captureId, projectId },
        }));
        setLoaded({ scope, kind, error: false });
      } catch {
        if (current) setLoaded({ scope, kind: null, error: true });
      }
    })();
    return () => {
      current = false;
      controller.abort();
    };
  }, [captureId, projectId, active, reload, scope]);
  const selected = active && loaded.scope === scope ? loaded.kind : null;
  return (
    <>
      {active &&
        !selected &&
        (loaded.scope === scope && loaded.error ? (
          <div>
            <p role="alert">
              Could not identify this agent proposal. Reload to try again.
            </p>
            <button
              type="button"
              onClick={() => setReload((value) => value + 1)}
            >
              Reload proposal
            </button>
          </div>
        ) : (
          <p role="status">Loading agent proposal...</p>
        ))}
      {retained.task && (
        <FoundationTaskProposalPanel
          {...retained.task}
          active={selected === "task"}
          onReviewed={onReviewed}
        />
      )}
      {retained.finding && (
        <FoundationFindingProposalPanel
          {...retained.finding}
          active={selected === "finding"}
          onReviewed={onReviewed}
        />
      )}
    </>
  );
}
