"use client";

import { useEffect, useState } from "react";
import {
  AppShell,
  Button,
  StatusBadge,
  SyntheticEventCard,
} from "@commandry/ui";
import {
  activityPagePath,
  syntheticPage,
  type SyntheticEventRecord,
} from "../../activity/api";
import {
  apiJson,
  type PageResponse,
  type ResourceRecord,
} from "../../projects/api";
import ResourceTopologyPanel from "./ResourceTopologyPanel";
import SyntheticMetricsPanel from "../../SyntheticMetricsPanel";
import styles from "./resource.module.css";

export default function ResourceDetail({ resourceId }: { resourceId: string }) {
  const [resource, setResource] = useState<ResourceRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<SyntheticEventRecord[]>([]);
  const [eventCursor, setEventCursor] = useState<string | null>(null);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsMoreLoading, setEventsMoreLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);

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

  useEffect(() => {
    let active = true;
    apiJson<PageResponse<SyntheticEventRecord>>(
      activityPagePath("/api/v1/events", { resourceId }),
    )
      .then((page) => {
        if (!active) return;
        const checked = syntheticPage(page);
        setEvents(checked.items);
        setEventCursor(checked.nextCursor);
        setEventsError(null);
      })
      .catch((cause: unknown) => {
        if (active)
          setEventsError(
            cause instanceof Error
              ? cause.message
              : "Synthetic event history is unavailable.",
          );
      })
      .finally(() => {
        if (active) setEventsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [resourceId]);

  async function loadMoreEvents() {
    if (!eventCursor || eventsMoreLoading) return;
    setEventsMoreLoading(true);
    setEventsError(null);
    try {
      const page = syntheticPage(
        await apiJson<PageResponse<SyntheticEventRecord>>(
          activityPagePath("/api/v1/events", {
            resourceId,
            cursor: eventCursor,
          }),
        ),
      );
      setEvents((current) => [...current, ...page.items]);
      setEventCursor(page.nextCursor);
    } catch (cause) {
      setEventsError(
        cause instanceof Error ? cause.message : "Could not load more events.",
      );
    } finally {
      setEventsMoreLoading(false);
    }
  }

  const observed = Boolean(resource?.lastObservedAt);

  return (
    <AppShell current="Infrastructure">
      <div className="cmd-breadcrumb">
        <a href="/infrastructure">Infrastructure</a>
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
          <ResourceTopologyPanel
            key={resource.id}
            onResourceChange={setResource}
            resource={resource}
          />
          <SyntheticMetricsPanel resourceId={resource.id} />
          <section
            className="cmd-workspace-section"
            aria-labelledby="resource-synthetic-heading"
          >
            <p className="cmd-eyebrow">
              Historical fixtures / Never live health
            </p>
            <h2 id="resource-synthetic-heading">Synthetic context</h2>
            <p>
              These local development and operational events are labeled
              synthetic. They do not change the resource health above.
            </p>
            {eventsLoading && <p role="status">Loading synthetic events...</p>}
            {eventsError && (
              <p className="cmd-inline-state cmd-error" role="alert">
                {eventsError}
              </p>
            )}
            {!eventsLoading && events.length === 0 && !eventsError && (
              <p>No synthetic events are linked to this resource.</p>
            )}
            {events.length > 0 && (
              <div className="cmd-resource-events">
                {events.map((event) => (
                  <SyntheticEventCard
                    alertId={event.alertId}
                    evidenceHref={event.evidenceHref}
                    id={event.id}
                    ingestedAt={event.ingestedAt}
                    key={event.id}
                    occurredAt={event.occurredAt}
                    resourceName={resource.name}
                    severity={event.severity}
                    sourceLabel={event.sourceLabel}
                    summary={event.summary}
                    type={event.type}
                  />
                ))}
              </div>
            )}
            {eventCursor && (
              <Button
                disabled={eventsMoreLoading}
                onClick={loadMoreEvents}
                type="button"
              >
                {eventsMoreLoading
                  ? "Loading..."
                  : "Load more synthetic events"}
              </Button>
            )}
          </section>
        </>
      )}
    </AppShell>
  );
}
