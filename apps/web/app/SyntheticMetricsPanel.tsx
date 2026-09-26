"use client";

import { useEffect, useState } from "react";
import type { SyntheticMetricSample } from "@commandry/contracts";
import { Button, SyntheticMetricCard } from "@commandry/ui";
import { apiJson, pagePath, type PageResponse } from "./projects/api";

export default function SyntheticMetricsPanel({
  projectId,
  resourceId,
}: {
  projectId?: string;
  resourceId?: string;
}) {
  const [samples, setSamples] = useState<SyntheticMetricSample[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const filter = `${projectId ? `&projectId=${encodeURIComponent(projectId)}` : ""}${resourceId ? `&resourceId=${encodeURIComponent(resourceId)}` : ""}`;

  useEffect(() => {
    let active = true;
    apiJson<PageResponse<SyntheticMetricSample>>(
      `${pagePath("/api/v1/metrics")}${filter}`,
    )
      .then((page) => {
        if (!active) return;
        setSamples(page.items);
        setCursor(page.nextCursor);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Synthetic measurements are unavailable.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [filter]);

  async function loadMore() {
    if (!cursor || busy) return;
    setBusy(true);
    setError(null);
    try {
      const page = await apiJson<PageResponse<SyntheticMetricSample>>(
        `${pagePath("/api/v1/metrics", cursor)}${filter}`,
      );
      setSamples((current) => [...current, ...page.items]);
      setCursor(page.nextCursor);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load older synthetic samples.",
      );
    } finally {
      setBusy(false);
    }
  }

  const latest = samples[0];
  const previous = latest
    ? samples.slice(1).find((sample) => sample.resourceId === latest.resourceId)
    : null;
  return (
    <section
      className="cmd-workspace-section"
      aria-labelledby={`synthetic-metrics-${resourceId ?? projectId}`}
    >
      <p className="cmd-eyebrow">
        Operational measurements / Historical fixture
      </p>
      <h2 id={`synthetic-metrics-${resourceId ?? projectId}`}>
        Synthetic availability
      </h2>
      <p className="cmd-section-intro">
        Normalized samples from the local monitor fixture. These values are
        historical and never update the resource&apos;s real health.
      </p>
      {loading && <p role="status">Loading synthetic measurements...</p>}
      {error && (
        <p className="cmd-inline-state cmd-error" role="alert">
          {error}
        </p>
      )}
      {!loading && !error && !latest && (
        <p>No synthetic availability samples are linked here.</p>
      )}
      {latest && (
        <>
          <SyntheticMetricCard
            sample={latest}
            previousValue={previous?.value ?? null}
          />
          <h3>Sample history</h3>
          <ol className="cmd-metric-history">
            {samples.map((sample) => (
              <li key={sample.id}>
                <strong>{sample.value}%</strong> for{" "}
                <a href={`/resources/${sample.resourceId}`}>
                  {sample.resourceName}
                </a>
                {" at "}
                <time dateTime={sample.sampledAt}>{sample.sampledAt}</time>
                {" · "}
                <a href={sample.evidenceHref}>Synthetic source</a>
              </li>
            ))}
          </ol>
          {cursor && (
            <Button disabled={busy} onClick={loadMore}>
              {busy ? "Loading..." : "Load older samples"}
            </Button>
          )}
        </>
      )}
    </section>
  );
}
