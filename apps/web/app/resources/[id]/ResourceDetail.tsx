"use client";

import { useEffect, useState } from "react";
import { AppShell, StatusBadge } from "@commandry/ui";
import { apiJson, type ResourceRecord } from "../../projects/api";
import styles from "./resource.module.css";

export default function ResourceDetail({ resourceId }: { resourceId: string }) {
  const [resource, setResource] = useState<ResourceRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void apiJson<ResourceRecord>(
      `/api/v1/resources/${encodeURIComponent(resourceId)}`,
    )
      .then((record) => {
        if (!active) return;
        setResource(record);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error ? cause.message : "Resource is unavailable.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [resourceId]);

  const observed = Boolean(resource?.lastObservedAt);

  return (
    <AppShell current="Projects">
      <div className="cmd-breadcrumb">
        <a href="/projects">Projects</a>
        <span aria-hidden="true">/</span>
        <span>Resource</span>
      </div>
      {loading && (
        <p className="cmd-inline-state" role="status">
          Loading resource...
        </p>
      )}
      {error && (
        <p className="cmd-inline-state cmd-error" role="alert">
          {error}
        </p>
      )}
      {resource && (
        <>
          <header className="cmd-page-header cmd-workspace-heading">
            <div>
              <p className="cmd-eyebrow">
                Canonical resource / {resource.kind}
              </p>
              <h1>{resource.name}</h1>
              <p className="cmd-lead">
                {resource.subtype ||
                  "A shared resource record in the local catalog."}
              </p>
              <p className="cmd-record-identity cmd-heading-id">
                <span>Resource ID</span> <code>{resource.id}</code>
              </p>
            </div>
            <StatusBadge
              dimension="health"
              label={observed ? (resource.state ?? "Unknown") : "Unknown"}
              tone="neutral"
            />
          </header>
          <section className={`cmd-workspace-section ${styles.section}`}>
            <p className="cmd-eyebrow">Record context</p>
            <h2>Source and freshness</h2>
            {observed ? (
              <p>
                Last observed{" "}
                <time dateTime={resource.lastObservedAt!}>
                  {new Date(resource.lastObservedAt!).toLocaleString()}
                </time>
                .
              </p>
            ) : (
              <p>
                Manual record. No operational observation has been recorded.
              </p>
            )}
            {resource.externalUrl && (
              <p className={styles.external}>
                External reference: {resource.externalUrl}
              </p>
            )}
            <a
              className={styles.searchLink}
              href={`/search?q=${encodeURIComponent(resource.name)}`}
            >
              Search related records
            </a>
          </section>
        </>
      )}
    </AppShell>
  );
}
