"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { DomainSummary } from "@commandry/contracts";
import { AppShell, Button, DomainCard, RecordEmptyState } from "@commandry/ui";
import { apiJson, pagePath, type PageResponse } from "../projects/api";

export default function DomainsPage() {
  const [domains, setDomains] = useState<DomainSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiJson<PageResponse<DomainSummary>>(pagePath("/api/v1/domains"))
      .then((page) => {
        if (!active) return;
        setDomains(page.items);
        setCursor(page.nextCursor);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error ? cause.message : "Domains are unavailable.",
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
      const page = await apiJson<PageResponse<DomainSummary>>(
        pagePath("/api/v1/domains", cursor),
      );
      setDomains((current) => [
        ...current,
        ...page.items.filter(
          (item) => !current.some((saved) => saved.id === item.id),
        ),
      ]);
      setCursor(page.nextCursor);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load more domains.",
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
      const saved = await apiJson<DomainSummary>("/api/v1/domains", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          ...(description.trim() ? { description: description.trim() } : {}),
        }),
      });
      setDomains((current) => [saved, ...current]);
      setName("");
      setDescription("");
      setFeedback(
        `Created ${saved.name}. Assign projects from each project workspace.`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not create domain.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell current="Projects">
      <div className="cmd-breadcrumb">
        <a href="/projects">Projects</a>
        <span aria-hidden="true">/</span>
        <span>Domains</span>
      </div>
      <header className="cmd-page-header">
        <div>
          <p className="cmd-eyebrow">Portfolio / Durable context</p>
          <h1>Domains</h1>
          <p className="cmd-lead">
            Organize projects by area of responsibility. A domain is a distinct
            local record; it is not a project, resource, or access boundary.
          </p>
        </div>
      </header>
      <div className="cmd-workspace-grid">
        <section
          className="cmd-workspace-section"
          aria-labelledby="domain-list-heading"
        >
          <div className="cmd-section-heading">
            <h2 id="domain-list-heading">Portfolio domains</h2>
            <span className="cmd-count">{domains.length} shown</span>
          </div>
          {loading && <p role="status">Loading domains...</p>}
          {error && (
            <p className="cmd-inline-state cmd-error" role="alert">
              {error}
            </p>
          )}
          {!loading && domains.length === 0 && !error && (
            <RecordEmptyState
              title="No domains yet"
              description="Create one to group related projects without changing their records."
            />
          )}
          <ul className="cmd-record-list" aria-label="Domains">
            {domains.map((item) => (
              <li key={item.id}>
                <DomainCard domain={item} />
              </li>
            ))}
          </ul>
          {cursor && (
            <Button disabled={busy} onClick={loadMore}>
              Load more domains
            </Button>
          )}
        </section>
        <section
          className="cmd-workspace-section cmd-create-panel"
          aria-labelledby="domain-create-heading"
        >
          <p className="cmd-eyebrow">Create / Local</p>
          <h2 id="domain-create-heading">New domain</h2>
          <p className="cmd-form-intro">
            Examples include Personal, Home, Software, or Infrastructure. These
            names are yours to choose.
          </p>
          <form className="cmd-form" onSubmit={create}>
            <label htmlFor="domain-name">Name</label>
            <input
              id="domain-name"
              maxLength={200}
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <label htmlFor="domain-description">Description</label>
            <textarea
              id="domain-description"
              maxLength={4000}
              rows={4}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
            <Button
              disabled={busy || !name.trim()}
              type="submit"
              variant="primary"
            >
              {busy ? "Creating..." : "Create domain"}
            </Button>
          </form>
          {feedback && (
            <p className="cmd-form-success" role="status">
              {feedback}
            </p>
          )}
        </section>
      </div>
    </AppShell>
  );
}
