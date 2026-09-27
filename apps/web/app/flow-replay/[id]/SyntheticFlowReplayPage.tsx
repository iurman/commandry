"use client";

import { useEffect, useState } from "react";
import type {
  SyntheticFlowReplay,
  SyntheticFlowReplayStage,
} from "@commandry/contracts";
import { AppShell, Button, SyntheticFlowTimeline } from "@commandry/ui";
import { apiJson } from "../../projects/api";

function replayPath(importId: string, cursor?: string | null) {
  const params = new URLSearchParams({ limit: "20" });
  if (cursor) params.set("cursor", cursor);
  return `/api/v1/synthetic-event-imports/${encodeURIComponent(importId)}/replay?${params}`;
}

export default function SyntheticFlowReplayPage({
  importId,
}: {
  importId: string;
}) {
  const [replay, setReplay] = useState<SyntheticFlowReplay | null>(null);
  const [stages, setStages] = useState<SyntheticFlowReplayStage[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiJson<SyntheticFlowReplay>(replayPath(importId))
      .then((page) => {
        if (!active) return;
        setReplay(page);
        setStages(page.stages);
        setCursor(page.nextCursor);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error ? cause.message : "Replay is unavailable.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [importId]);

  async function loadMore() {
    if (!cursor || busy) return;
    setBusy(true);
    setError(null);
    try {
      const page = await apiJson<SyntheticFlowReplay>(
        replayPath(importId, cursor),
      );
      setReplay(page);
      setStages((current) => {
        const combined = new Map(current.map((stage) => [stage.id, stage]));
        for (const stage of page.stages) combined.set(stage.id, stage);
        return [...combined.values()].sort(
          (left, right) =>
            left.recordedAt.localeCompare(right.recordedAt) ||
            left.id.localeCompare(right.id),
        );
      });
      setCursor(page.nextCursor);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load more replay.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell current="Activity">
      <header className="cmd-page-header">
        <p className="cmd-eyebrow">
          Historical replay / Synthetic fixture only
        </p>
        <h1>Synthetic flow replay</h1>
        <p>
          This view replays persisted records for one fixture import. It is not
          a live stream or proof of external delivery. Stages are ordered by
          Commandry recorded time; source occurrence time is shown separately.
        </p>
      </header>
      {loading && <p role="status">Loading stored replay...</p>}
      {error && (
        <p className="cmd-form-error" role="alert">
          {error}
        </p>
      )}
      {replay && (
        <>
          <section className="cmd-workspace-section">
            <h2>Replay scope</h2>
            <dl className="cmd-automation-facts">
              <div>
                <dt>Fixture source</dt>
                <dd>{replay.sourceLabel}</dd>
              </div>
              <div>
                <dt>Scenario</dt>
                <dd>{replay.scenarioId}</dd>
              </div>
              <div>
                <dt>Stored import state</dt>
                <dd>{replay.importState}</dd>
              </div>
              <div>
                <dt>Replay generated</dt>
                <dd>
                  <time dateTime={replay.generatedAt}>
                    {replay.generatedAt}
                  </time>
                </dd>
              </div>
            </dl>
            <p>
              <a href={`/projects/${replay.projectId}`}>Open project</a> /{" "}
              <a href={`/activity?projectId=${replay.projectId}`}>
                Project activity
              </a>
            </p>
          </section>
          <section className="cmd-workspace-section">
            <div className="cmd-section-heading">
              <h2>Persisted stages</h2>
              <span className="cmd-count">{stages.length} shown</span>
            </div>
            <SyntheticFlowTimeline stages={stages} />
            {cursor && (
              <Button disabled={busy} onClick={() => void loadMore()}>
                Load more linked automation runs
              </Button>
            )}
          </section>
        </>
      )}
    </AppShell>
  );
}
