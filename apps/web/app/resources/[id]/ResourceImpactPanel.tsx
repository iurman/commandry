"use client";

import { useEffect, useState } from "react";
import type { ResourceImpactResponse } from "@commandry/contracts";
import { Button, ResourceImpactCard } from "@commandry/ui";
import { apiJson } from "../../projects/api";

function impactPath(resourceId: string, cursor?: string | null) {
  const query = new URLSearchParams({ limit: "20" });
  if (cursor) query.set("cursor", cursor);
  return `/api/v1/resources/${encodeURIComponent(resourceId)}/impact?${query}`;
}

export default function ResourceImpactPanel({
  resourceId,
}: {
  resourceId: string;
}) {
  const [impact, setImpact] = useState<ResourceImpactResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiJson<ResourceImpactResponse>(impactPath(resourceId))
      .then((page) => {
        if (!active) return;
        setImpact(page);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Potential impact is unavailable.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [resourceId]);

  async function loadMore() {
    if (!impact?.nextCursor || busy) return;
    setBusy(true);
    setError(null);
    try {
      const page = await apiJson<ResourceImpactResponse>(
        impactPath(resourceId, impact.nextCursor),
      );
      setImpact((current) =>
        current
          ? {
              ...page,
              items: [...current.items, ...page.items],
            }
          : page,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load more potential impact paths.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      id="dependency-impact"
      className="cmd-workspace-section"
      aria-labelledby="dependency-impact-title"
    >
      <p className="cmd-eyebrow">Derived local context / Potential only</p>
      <h2 id="dependency-impact-title">Potential dependency impact</h2>
      <p>
        Paths use manually recorded depends-on links, up to six hops. Supporting
        projects have explicit active links. This view does not assert an outage
        or real resource health.
      </p>
      {loading && <p role="status">Loading recorded impact paths...</p>}
      {error && (
        <p className="cmd-inline-state cmd-error" role="alert">
          {error}
        </p>
      )}
      {impact && (
        <>
          <p>
            Source: {impact.sourceLabel}. Real health: {impact.realHealth}.
          </p>
          {impact.sourceProjects.length > 0 && (
            <p>
              This resource supports:{" "}
              {impact.sourceProjects.map((project, index) => (
                <span key={project.id}>
                  {index > 0 ? ", " : ""}
                  <a href={`/projects/${project.id}`}>{project.name}</a>
                </span>
              ))}
              .
            </p>
          )}
          {impact.latestSyntheticDrop ? (
            <article className="cmd-record-card">
              <p className="cmd-eyebrow">
                Latest active synthetic anomaly / Fixture only
              </p>
              <h3 className="cmd-record-title">Availability drop to review</h3>
              <p>{impact.latestSyntheticDrop.reason}</p>
              <p>
                <a href={impact.latestSyntheticDrop.previousEvidenceHref}>
                  Previous metric
                </a>{" "}
                /{" "}
                <a href={impact.latestSyntheticDrop.evidenceHref}>
                  Latest metric
                </a>{" "}
                /{" "}
                <a
                  href={`/attention-signals?resourceId=${encodeURIComponent(resourceId)}`}
                >
                  Review this resource&apos;s signal history
                </a>
              </p>
            </article>
          ) : (
            <p>
              No active synthetic metric-drop signal is recorded for this
              resource. This does not establish health.{" "}
              <a
                href={`/attention-signals?resourceId=${encodeURIComponent(resourceId)}`}
              >
                Review signal history
              </a>
              .
            </p>
          )}
          {impact.items.length === 0 && (
            <p>No downstream depends-on path is recorded within six hops.</p>
          )}
          <div className="cmd-record-list">
            {impact.items.map((item) => (
              <ResourceImpactCard key={item.resource.id} impact={item} />
            ))}
          </div>
          {impact.nextCursor && (
            <Button disabled={busy} onClick={() => void loadMore()}>
              {busy ? "Loading..." : "Load more impact paths"}
            </Button>
          )}
        </>
      )}
    </section>
  );
}
