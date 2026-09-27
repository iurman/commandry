"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { SystemSummary } from "@commandry/contracts";
import { AppShell, Button, RecordEmptyState, SystemCard } from "@commandry/ui";
import { apiJson, pagePath, type PageResponse } from "../projects/api";

export default function SystemsPage() {
  const [systems, setSystems] = useState<SystemSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiJson<PageResponse<SystemSummary>>(pagePath("/api/v1/systems"))
      .then((page) => {
        if (!active) return;
        setSystems(page.items);
        setCursor(page.nextCursor);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error ? cause.message : "Systems are unavailable.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function loadMore() {
    if (!cursor || busy) return;
    setBusy(true);
    setError(null);
    try {
      const page = await apiJson<PageResponse<SystemSummary>>(
        pagePath("/api/v1/systems", cursor),
      );
      setSystems((current) => [
        ...current,
        ...page.items.filter(
          (item) => !current.some((saved) => saved.id === item.id),
        ),
      ]);
      setCursor(page.nextCursor);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load more systems.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const saved = await apiJson<SystemSummary>("/api/v1/systems", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          ...(summary.trim() ? { summary: summary.trim() } : {}),
        }),
      });
      setSystems((current) => [saved, ...current]);
      setName("");
      setSummary("");
      setFeedback(
        `Created ${saved.name}. Open it to connect a domain, projects, and supporting resources.`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not create system.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell current="Infrastructure">
      <div className="cmd-breadcrumb">
        <a href="/infrastructure">Infrastructure</a>
        <span aria-hidden="true">/</span>
        <span>Systems</span>
      </div>
      <header className="cmd-page-header">
        <div>
          <p className="cmd-eyebrow">Operated context / Local model</p>
          <h1>Systems</h1>
          <p className="cmd-lead">
            Model a continuing capability separately from the projects that
            change it and the resources that support it. These manual records do
            not report live health.
          </p>
        </div>
      </header>
      <div className="cmd-workspace-grid">
        <section
          className="cmd-workspace-section"
          aria-labelledby="systems-list-heading"
        >
          <div className="cmd-section-heading">
            <h2 id="systems-list-heading">Systems</h2>
            <span className="cmd-count">{systems.length} shown</span>
          </div>
          {loading && <p role="status">Loading systems...</p>}
          {error && (
            <p className="cmd-inline-state cmd-error" role="alert">
              {error}
            </p>
          )}
          {!loading && systems.length === 0 && !error && (
            <RecordEmptyState
              title="No systems yet"
              description="Create one to connect an operated capability to its projects and resources."
            />
          )}
          <ul className="cmd-record-list" aria-label="Systems">
            {systems.map((item) => (
              <li key={item.id}>
                <SystemCard system={item} />
              </li>
            ))}
          </ul>
          {cursor && (
            <Button disabled={busy} onClick={loadMore}>
              Load more systems
            </Button>
          )}
        </section>
        <section
          className="cmd-workspace-section cmd-create-panel"
          aria-labelledby="system-create-heading"
        >
          <p className="cmd-eyebrow">Create / Local</p>
          <h2 id="system-create-heading">New system</h2>
          <p className="cmd-form-intro">
            Examples include Home Automation, Game Hosting, or an application
            that is operated over time. Choose the actual boundary you maintain.
          </p>
          <form className="cmd-form" onSubmit={create}>
            <label htmlFor="system-name">Name</label>
            <input
              id="system-name"
              maxLength={200}
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <label htmlFor="system-summary">Summary</label>
            <textarea
              id="system-summary"
              maxLength={4000}
              rows={4}
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
            />
            <Button
              disabled={busy || !name.trim()}
              type="submit"
              variant="primary"
            >
              {busy ? "Creating..." : "Create system"}
            </Button>
          </form>
          {feedback && (
            <p className="cmd-form-success" role="status">
              {feedback}
            </p>
          )}
          <p>
            <a href="/domains">Browse portfolio domains</a>
          </p>
        </section>
      </div>
    </AppShell>
  );
}
