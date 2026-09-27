"use client";

import { useEffect, useState } from "react";
import type {
  ListProjectAgentFindingsResponse,
  ProjectAgentFinding,
} from "@commandry/contracts";
import { Button, ProjectAgentFindingCard } from "@commandry/ui";
import { apiJson } from "../api";

function findingsPath(projectId: string, cursor?: string | null) {
  const params = new URLSearchParams({ limit: "5" });
  if (cursor) params.set("cursor", cursor);
  return `/api/v1/projects/${encodeURIComponent(projectId)}/agent-findings?${params}`;
}

export default function ProjectAgentFindingsPanel({
  projectId,
}: {
  projectId: string;
}) {
  const [findings, setFindings] = useState<ProjectAgentFinding[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiJson<ListProjectAgentFindingsResponse>(findingsPath(projectId))
      .then((page) => {
        if (!active) return;
        setFindings(page.items);
        setCursor(page.nextCursor);
        setAsOf(page.asOf);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load saved local agent findings.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [projectId]);

  async function load(nextCursor?: string | null) {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const page = await apiJson<ListProjectAgentFindingsResponse>(
        findingsPath(projectId, nextCursor),
      );
      setFindings((current) =>
        nextCursor
          ? [
              ...current,
              ...page.items.filter(
                (item) => !current.some((saved) => saved.runId === item.runId),
              ),
            ]
          : page.items,
      );
      setCursor(page.nextCursor);
      setAsOf(page.asOf);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load saved local agent findings.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      className="cmd-workspace-section"
      aria-labelledby="project-agent-findings-title"
    >
      <div className="cmd-section-heading">
        <div>
          <p className="cmd-eyebrow">Cached structured output</p>
          <h2 id="project-agent-findings-title">Saved local agent findings</h2>
        </div>
        <span className="cmd-count">{findings.length} shown</span>
      </div>
      <p>
        These are worker-saved fake run results for this project. They are
        synthetic, unverified, and tied to their original packet digests. No
        external agent or browser action ran.
        {asOf && <> Last page read at {asOf}.</>}
      </p>
      <Button disabled={loading} onClick={() => void load()}>
        Refresh agent findings
      </Button>
      {loading && <p role="status">Loading saved local agent findings...</p>}
      {error && <p role="alert">{error}</p>}
      {!loading && !error && findings.length === 0 && (
        <p>No saved fake agent results are recorded for this project.</p>
      )}
      {findings.length > 0 && (
        <ul className="cmd-notification-list">
          {findings.map((finding) => (
            <li key={finding.runId}>
              <ProjectAgentFindingCard finding={finding} />
            </li>
          ))}
        </ul>
      )}
      {cursor && (
        <Button disabled={loading} onClick={() => void load(cursor)}>
          Load more agent findings
        </Button>
      )}
    </section>
  );
}
