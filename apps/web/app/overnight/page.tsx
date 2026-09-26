"use client";

import { useEffect, useState } from "react";
import type { OvernightQueueEntry } from "@commandry/contracts";
import {
  AppShell,
  Button,
  OvernightQueueCard,
  RecordEmptyState,
} from "@commandry/ui";
import { apiJson, pagePath, type PageResponse } from "../projects/api";

export default function OvernightPage() {
  const [items, setItems] = useState<OvernightQueueEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function load(cursorValue?: string | null) {
    setError(null);
    try {
      const page = await apiJson<PageResponse<OvernightQueueEntry>>(
        pagePath("/api/v1/overnight", cursorValue),
      );
      setItems((current) =>
        cursorValue
          ? [
              ...current,
              ...page.items.filter(
                (item) => !current.some((saved) => saved.id === item.id),
              ),
            ]
          : page.items,
      );
      setCursor(page.nextCursor);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load overnight queue.",
      );
    } finally {
      setLoading(false);
      setBusy(false);
    }
  }

  useEffect(() => {
    let active = true;
    apiJson<PageResponse<OvernightQueueEntry>>(pagePath("/api/v1/overnight"))
      .then((page) => {
        if (!active) return;
        setItems(page.items);
        setCursor(page.nextCursor);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load overnight queue.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function cancel(id: string) {
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const entry = await apiJson<OvernightQueueEntry>(
        `/api/v1/overnight/${id}/cancel`,
        { method: "POST" },
      );
      setItems((current) =>
        current.map((item) => (item.id === id ? entry : item)),
      );
      setFeedback("Scheduled local simulation canceled. No run was started.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not cancel scheduled work.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell current="Overnight">
      <header className="cmd-page-header">
        <div>
          <p className="cmd-eyebrow">Local-only / Packet-bound fake work</p>
          <h1>Overnight Queue</h1>
          <p className="cmd-lead">
            Schedule a saved execution packet with an assigned synthetic agent.
            The worker checks readiness again when due, grants project-scoped
            reads, and records an unverified fake result. It cannot change
            tasks, infrastructure, or external systems.
          </p>
          <p>
            <a href="/work">Choose open work and save a packet</a> ·{" "}
            <a href="/morning">Review the morning digest</a>
          </p>
        </div>
      </header>
      <section
        className="cmd-workspace-section"
        aria-labelledby="overnight-list-heading"
      >
        <div className="cmd-section-heading">
          <div>
            <p className="cmd-eyebrow">Schedule / worker outcome</p>
            <h2 id="overnight-list-heading">Queued work</h2>
          </div>
          <span className="cmd-count">{items.length} shown</span>
        </div>
        <Button
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void load();
          }}
        >
          {busy ? "Refreshing..." : "Refresh status"}
        </Button>
        {loading && (
          <p className="cmd-inline-state" role="status">
            Loading overnight queue...
          </p>
        )}
        {error && (
          <p className="cmd-inline-state cmd-error" role="alert">
            {error}
          </p>
        )}
        {feedback && (
          <p className="cmd-form-success" role="status">
            {feedback}
          </p>
        )}
        {!loading && items.length === 0 && !error && (
          <RecordEmptyState
            title="No overnight work scheduled"
            description="Open a saved execution packet and review readiness before scheduling a fake local run."
          />
        )}
        <ul
          className="cmd-automation-list"
          aria-label="Overnight queue entries"
        >
          {items.map((entry) => (
            <li key={entry.id}>
              <OvernightQueueCard
                entry={entry}
                action={
                  entry.state === "scheduled" ? (
                    <Button
                      disabled={busy}
                      onClick={() => void cancel(entry.id)}
                    >
                      Cancel scheduled run
                    </Button>
                  ) : undefined
                }
              />
            </li>
          ))}
        </ul>
        {cursor && (
          <Button
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void load(cursor);
            }}
          >
            Load more queued work
          </Button>
        )}
      </section>
    </AppShell>
  );
}
