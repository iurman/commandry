"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { SystemSummary } from "@commandry/contracts";
import { AppShell, Button, StatusBadge } from "@commandry/ui";
import { apiJson } from "../../projects/api";
import SystemAuditPanel from "./SystemAuditPanel";
import SystemDomainPanel from "./SystemDomainPanel";
import SystemProjectPanel from "./SystemProjectPanel";
import SystemResourcePanel from "./SystemResourcePanel";

export default function SystemDetail({ systemId }: { systemId: string }) {
  const path = `/api/v1/systems/${encodeURIComponent(systemId)}`;
  const [system, setSystem] = useState<SystemSummary | null>(null);
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiJson<SystemSummary>(path)
      .then((saved) => {
        if (!active) return;
        setSystem(saved);
        setName(saved.name);
        setSummary(saved.summary ?? "");
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error ? cause.message : "System is unavailable.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path]);

  async function refreshAfterRelation() {
    setRevision((current) => current + 1);
    try {
      const saved = await apiJson<SystemSummary>(path);
      setSystem(saved);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not refresh system record.",
      );
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!system || !name.trim() || busy) return;
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const saved = await apiJson<SystemSummary>(path, {
        method: "PATCH",
        body: JSON.stringify({
          expectedVersion: system.version,
          name: name.trim(),
          summary: summary.trim() || null,
        }),
      });
      setSystem(saved);
      setFeedback("System details saved with a new local revision.");
      await refreshAfterRelation();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not update system.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function archive() {
    if (!system || busy) return;
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const saved = await apiJson<SystemSummary>(`${path}/archive`, {
        method: "PUT",
        body: JSON.stringify({ expectedVersion: system.version }),
      });
      setSystem(saved);
      setRevision((current) => current + 1);
      setFeedback(
        "Empty system archived. Its record and exact link history remain available.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not archive system.",
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
        <a href="/systems">Systems</a>
        <span aria-hidden="true">/</span>
        <span>{system?.name ?? "System"}</span>
      </div>
      {loading && (
        <p className="cmd-inline-state" role="status">
          Loading system...
        </p>
      )}
      {error && (
        <p className="cmd-inline-state cmd-error" role="alert">
          {error}
        </p>
      )}
      {system && (
        <>
          <header className="cmd-page-header cmd-workspace-heading">
            <div>
              <p className="cmd-eyebrow">Operated context / Local record</p>
              <h1>{system.name}</h1>
              <p className="cmd-lead">
                {system.summary || "No system summary recorded."}
              </p>
              <p className="cmd-record-identity cmd-heading-id">
                <span>System ID</span> <code>{system.id}</code>
              </p>
              <p className="cmd-record-identity">
                Manual record. Operational health is unknown until observed by a
                source.
              </p>
            </div>
            <StatusBadge
              dimension="lifecycle"
              label={system.lifecycle}
              tone="neutral"
            />
          </header>
          <SystemDomainPanel
            systemId={system.id}
            archived={system.lifecycle === "archived"}
            onChange={() => void refreshAfterRelation()}
          />
          <div className="cmd-workspace-grid">
            <SystemProjectPanel
              systemId={system.id}
              archived={system.lifecycle === "archived"}
              onChange={() => void refreshAfterRelation()}
            />
            <SystemResourcePanel
              systemId={system.id}
              archived={system.lifecycle === "archived"}
              onChange={() => void refreshAfterRelation()}
            />
          </div>
          <section
            className="cmd-workspace-section"
            aria-labelledby="system-details-heading"
          >
            <p className="cmd-eyebrow">Record / Local source of truth</p>
            <h2 id="system-details-heading">System details</h2>
            <p className="cmd-form-intro">
              Version {system.version}. This record describes a capability; its
              supporting resource links have separate identities and histories.
            </p>
            {system.lifecycle === "active" ? (
              <>
                <form className="cmd-form" onSubmit={save}>
                  <label htmlFor="system-edit-name">Name</label>
                  <input
                    id="system-edit-name"
                    maxLength={200}
                    required
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                  <label htmlFor="system-edit-summary">Summary</label>
                  <textarea
                    id="system-edit-summary"
                    maxLength={4000}
                    rows={4}
                    value={summary}
                    onChange={(event) => setSummary(event.target.value)}
                  />
                  <Button
                    disabled={
                      busy ||
                      !name.trim() ||
                      (name.trim() === system.name &&
                        (summary.trim() || null) === system.summary)
                    }
                    type="submit"
                  >
                    {busy ? "Saving..." : "Save details"}
                  </Button>
                </form>
                <p className="cmd-form-hint">
                  Unlink the domain, projects, and resources before archiving.
                </p>
                <Button disabled={busy} onClick={archive}>
                  Archive empty system
                </Button>
              </>
            ) : (
              <p>
                Archived systems are read-only. Their record and audit history
                remain inspectable.
              </p>
            )}
            {feedback && (
              <p className="cmd-form-success" role="status">
                {feedback}
              </p>
            )}
          </section>
          <SystemAuditPanel systemId={system.id} revision={revision} />
        </>
      )}
    </AppShell>
  );
}
