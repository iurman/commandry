"use client";

import { useEffect, useState, type FormEvent } from "react";
import type {
  DomainAuditEvent,
  DomainSummary,
  ProjectSummary,
  SystemSummary,
} from "@commandry/contracts";
import { AppShell, Button, RecordEmptyState } from "@commandry/ui";
import { apiJson, pagePath, type PageResponse } from "../../projects/api";

export default function DomainDetail({ domainId }: { domainId: string }) {
  const path = `/api/v1/domains/${encodeURIComponent(domainId)}`;
  const [domain, setDomain] = useState<DomainSummary | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectCursor, setProjectCursor] = useState<string | null>(null);
  const [systems, setSystems] = useState<SystemSummary[]>([]);
  const [systemCursor, setSystemCursor] = useState<string | null>(null);
  const [audit, setAudit] = useState<DomainAuditEvent[]>([]);
  const [auditCursor, setAuditCursor] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiJson<DomainSummary>(path),
      apiJson<PageResponse<ProjectSummary>>(pagePath(`${path}/projects`)),
      apiJson<PageResponse<SystemSummary>>(pagePath(`${path}/systems`)),
      apiJson<PageResponse<DomainAuditEvent>>(pagePath(`${path}/audit`)),
    ])
      .then(([saved, projectPage, systemPage, auditPage]) => {
        if (!active) return;
        setDomain(saved);
        setName(saved.name);
        setDescription(saved.description ?? "");
        setProjects(projectPage.items);
        setProjectCursor(projectPage.nextCursor);
        setSystems(systemPage.items);
        setSystemCursor(systemPage.nextCursor);
        setAudit(auditPage.items);
        setAuditCursor(auditPage.nextCursor);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error ? cause.message : "Domain is unavailable.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path]);

  async function loadMoreProjects() {
    if (!projectCursor || busy) return;
    setBusy(true);
    setError(null);
    try {
      const page = await apiJson<PageResponse<ProjectSummary>>(
        pagePath(`${path}/projects`, projectCursor),
      );
      setProjects((current) => [
        ...current,
        ...page.items.filter(
          (item) => !current.some((saved) => saved.id === item.id),
        ),
      ]);
      setProjectCursor(page.nextCursor);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load more projects.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function loadMoreSystems() {
    if (!systemCursor || busy) return;
    setBusy(true);
    setError(null);
    try {
      const page = await apiJson<PageResponse<SystemSummary>>(
        pagePath(`${path}/systems`, systemCursor),
      );
      setSystems((current) => [
        ...current,
        ...page.items.filter(
          (item) => !current.some((saved) => saved.id === item.id),
        ),
      ]);
      setSystemCursor(page.nextCursor);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load more systems.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function refreshAudit(cursor?: string, duringMutation = false) {
    if (busy && !duringMutation) return;
    setBusy(true);
    setError(null);
    try {
      const page = await apiJson<PageResponse<DomainAuditEvent>>(
        pagePath(`${path}/audit`, cursor),
      );
      setAudit((current) =>
        cursor
          ? [
              ...current,
              ...page.items.filter(
                (item) => !current.some((saved) => saved.id === item.id),
              ),
            ]
          : page.items,
      );
      setAuditCursor(page.nextCursor);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load domain history.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!domain || busy || !name.trim()) return;
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const saved = await apiJson<DomainSummary>(path, {
        method: "PATCH",
        body: JSON.stringify({
          expectedVersion: domain.version,
          name: name.trim(),
          description: description.trim() || null,
        }),
      });
      setDomain(saved);
      setFeedback("Domain details saved with a new local revision.");
      await refreshAudit(undefined, true);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not update domain.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function archive() {
    if (!domain || busy) return;
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const saved = await apiJson<DomainSummary>(`${path}/archive`, {
        method: "PUT",
        body: JSON.stringify({ expectedVersion: domain.version }),
      });
      setDomain(saved);
      setFeedback(
        "Empty domain archived. Its record and audit history remain available.",
      );
      await refreshAudit(undefined, true);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not archive domain.",
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
        <a href="/domains">Domains</a>
        <span aria-hidden="true">/</span>
        <span>{domain?.name ?? "Domain"}</span>
      </div>
      {loading && (
        <p className="cmd-inline-state" role="status">
          Loading domain...
        </p>
      )}
      {error && (
        <p className="cmd-inline-state cmd-error" role="alert">
          {error}
        </p>
      )}
      {domain && (
        <>
          <header className="cmd-page-header">
            <div>
              <p className="cmd-eyebrow">Portfolio / Local domain</p>
              <h1>{domain.name}</h1>
              <p className="cmd-lead">
                {domain.description || "No description recorded."}
              </p>
              <p className="cmd-record-identity">
                Domain ID <code>{domain.id}</code>
              </p>
            </div>
            <span className="cmd-count">{domain.lifecycle}</span>
          </header>
          <div className="cmd-workspace-grid">
            <section
              className="cmd-workspace-section"
              aria-labelledby="domain-projects-heading"
            >
              <div className="cmd-section-heading">
                <h2 id="domain-projects-heading">Owned projects</h2>
                <span className="cmd-count">{projects.length} shown</span>
              </div>
              <p className="cmd-section-intro">
                Projects keep their own identity and other relationships. Set
                the owning domain in a project workspace.
              </p>
              {projects.length === 0 && (
                <RecordEmptyState
                  title="No owned projects"
                  description="Open a project and choose this domain in its portfolio panel."
                />
              )}
              <ul className="cmd-record-list" aria-label="Domain projects">
                {projects.map((item) => (
                  <li key={item.id}>
                    <a href={`/projects/${item.id}`}>{item.name}</a>
                    <p>{item.summary || "No project summary recorded."}</p>
                  </li>
                ))}
              </ul>
              {projectCursor && (
                <Button disabled={busy} onClick={loadMoreProjects}>
                  Load more projects
                </Button>
              )}
              <p>
                <a href="/projects">Open the project portfolio</a>
              </p>
            </section>
            <section
              className="cmd-workspace-section"
              aria-labelledby="domain-systems-heading"
            >
              <div className="cmd-section-heading">
                <h2 id="domain-systems-heading">Owned systems</h2>
                <span className="cmd-count">{systems.length} shown</span>
              </div>
              <p className="cmd-section-intro">
                Systems are continuing operated capabilities, separate from the
                projects that change them and resources that support them.
              </p>
              {systems.length === 0 && (
                <RecordEmptyState
                  title="No owned systems"
                  description="Open a system and choose this domain in its portfolio panel."
                />
              )}
              <ul className="cmd-record-list" aria-label="Domain systems">
                {systems.map((item) => (
                  <li key={item.id}>
                    <a href={`/systems/${item.id}`}>{item.name}</a>
                    <p>{item.summary || "No system summary recorded."}</p>
                  </li>
                ))}
              </ul>
              {systemCursor && (
                <Button disabled={busy} onClick={loadMoreSystems}>
                  Load more systems
                </Button>
              )}
              <p>
                <a href="/systems">Open the system portfolio</a>
              </p>
            </section>
            <section
              className="cmd-workspace-section"
              aria-labelledby="domain-edit-heading"
            >
              <p className="cmd-eyebrow">Record / Local source of truth</p>
              <h2 id="domain-edit-heading">Domain details</h2>
              <p className="cmd-form-intro">
                Version {domain.version}. This portfolio grouping does not grant
                access or imply live system health.
              </p>
              {domain.lifecycle === "active" ? (
                <>
                  <form className="cmd-form" onSubmit={save}>
                    <label htmlFor="domain-edit-name">Name</label>
                    <input
                      id="domain-edit-name"
                      maxLength={200}
                      required
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                    />
                    <label htmlFor="domain-edit-description">Description</label>
                    <textarea
                      id="domain-edit-description"
                      maxLength={4000}
                      rows={4}
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                    />
                    <Button
                      disabled={
                        busy ||
                        !name.trim() ||
                        (name.trim() === domain.name &&
                          (description.trim() || null) === domain.description)
                      }
                      type="submit"
                    >
                      Save details
                    </Button>
                  </form>
                  <p className="cmd-form-hint">
                    Archiving is available after every project and system has
                    been moved or unlinked. Audit history is kept.
                  </p>
                  <Button
                    disabled={
                      busy ||
                      projects.length > 0 ||
                      Boolean(projectCursor) ||
                      systems.length > 0 ||
                      Boolean(systemCursor)
                    }
                    onClick={archive}
                  >
                    Archive empty domain
                  </Button>
                </>
              ) : (
                <p>
                  Archived domains are read-only. Their context links and audit
                  remain inspectable.
                </p>
              )}
              {feedback && (
                <p className="cmd-form-success" role="status">
                  {feedback}
                </p>
              )}
            </section>
          </div>
          <section
            className="cmd-workspace-section"
            aria-labelledby="domain-audit-heading"
          >
            <div className="cmd-section-heading">
              <h2 id="domain-audit-heading">Audit history</h2>
              <Button disabled={busy} onClick={() => refreshAudit()}>
                Refresh history
              </Button>
            </div>
            <ul
              className="cmd-automation-audit-list"
              aria-label="Domain audit events"
            >
              {audit.map((item) => (
                <li key={item.id}>
                  <strong>{item.operation}</strong>
                  {item.projectId && (
                    <p>
                      Project{" "}
                      <a href={`/projects/${item.projectId}`}>
                        {item.projectId}
                      </a>
                    </p>
                  )}
                  <p>{item.actor}</p>
                  <time dateTime={item.createdAt}>{item.createdAt}</time>
                </li>
              ))}
            </ul>
            {auditCursor && (
              <Button disabled={busy} onClick={() => refreshAudit(auditCursor)}>
                Load more audit events
              </Button>
            )}
          </section>
        </>
      )}
    </AppShell>
  );
}
