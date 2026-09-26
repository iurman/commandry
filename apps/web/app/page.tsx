"use client";

import { useEffect, useState } from "react";
import {
  AppShell,
  StatePanel,
  StatusBadge,
  SyntheticAttentionCard,
  SyntheticEventCard,
} from "@commandry/ui";
import { apiJson, type PageResponse } from "./projects/api";
import {
  activityPagePath,
  syntheticPage,
  type SyntheticAttentionRecord,
  type SyntheticEventRecord,
} from "./activity/api";

function message(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback;
}

export default function HomePage() {
  const [attention, setAttention] = useState<SyntheticAttentionRecord[]>([]);
  const [events, setEvents] = useState<SyntheticEventRecord[]>([]);
  const [attentionLoading, setAttentionLoading] = useState(true);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [attentionError, setAttentionError] = useState<string | null>(null);
  const [eventsError, setEventsError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiJson<PageResponse<SyntheticAttentionRecord>>(
      activityPagePath("/api/v1/attention", { limit: 1 }),
    )
      .then(syntheticPage)
      .then((page) => {
        if (active) setAttention(page.items);
      })
      .catch((cause: unknown) => {
        if (active)
          setAttentionError(message(cause, "Attention is unavailable."));
      })
      .finally(() => {
        if (active) setAttentionLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    apiJson<PageResponse<SyntheticEventRecord>>(
      activityPagePath("/api/v1/events", { limit: 1 }),
    )
      .then(syntheticPage)
      .then((page) => {
        if (active) setEvents(page.items);
      })
      .catch((cause: unknown) => {
        if (active)
          setEventsError(message(cause, "Recent activity is unavailable."));
      })
      .finally(() => {
        if (active) setEventsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const currentAttention = attention[0];
  const recentEvent = events[0];

  return (
    <AppShell>
      <header className="cmd-page-header cmd-workspace-heading">
        <div>
          <p className="cmd-eyebrow">Home / Command Center</p>
          <h1>Command Center</h1>
          <p className="cmd-lead">
            Attention and meaningful change stay connected to their source
            evidence.
          </p>
        </div>
        <StatusBadge dimension="sync" label="No live sources" tone="neutral" />
      </header>

      <div className="cmd-notice cmd-synthetic-notice">
        <h2>Local simulation</h2>
        <p>
          No live integrations are connected. Items below, when present, come
          from fixed synthetic fixtures. They do not report project or resource
          health.
        </p>
      </div>

      <div className="cmd-panel-grid">
        <StatePanel
          description={
            attentionError ??
            (!attentionLoading && !currentAttention
              ? "No active synthetic attention has been derived from local fixtures."
              : "")
          }
          id="attention-title"
          state={
            attentionLoading
              ? "loading"
              : attentionError
                ? "error"
                : currentAttention
                  ? "normal"
                  : "empty"
          }
          title="Attention"
        >
          {currentAttention && (
            <>
              <SyntheticAttentionCard {...currentAttention} />
              <p className="cmd-home-panel-link">
                <a href="/activity#attention">Review all synthetic attention</a>
              </p>
            </>
          )}
        </StatePanel>
        <StatePanel
          description={
            eventsError ??
            (!eventsLoading && !recentEvent
              ? "No synthetic events have been normalized by the local worker."
              : "")
          }
          id="change-title"
          state={
            eventsLoading
              ? "loading"
              : eventsError
                ? "error"
                : recentEvent
                  ? "normal"
                  : "empty"
          }
          title="Recent change"
        >
          {recentEvent && (
            <>
              <SyntheticEventCard {...recentEvent} />
              <p className="cmd-home-panel-link">
                <a href="/activity#events">Review all synthetic events</a>
              </p>
            </>
          )}
        </StatePanel>
        <StatePanel
          description="Open Activity to import a fixed synthetic development or operational fixture, then inspect its worker receipt and source envelope."
          id="next-title"
          state="normal"
          title="Local next step"
        >
          <p>
            <a href="/activity">Open the synthetic activity workspace</a>
          </p>
        </StatePanel>
      </div>
    </AppShell>
  );
}
