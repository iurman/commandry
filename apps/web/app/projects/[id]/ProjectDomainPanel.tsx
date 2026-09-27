"use client";

import { useEffect, useState, type FormEvent } from "react";
import type {
  DomainSummary,
  ProjectDomainMembership,
} from "@commandry/contracts";
import { Button } from "@commandry/ui";
import { apiJson, pagePath, type PageResponse } from "../api";

export default function ProjectDomainPanel({
  projectId,
  onMembershipChange,
}: {
  projectId: string;
  onMembershipChange: () => void;
}) {
  const path = `/api/v1/projects/${encodeURIComponent(projectId)}/domain`;
  const [membership, setMembership] = useState<ProjectDomainMembership | null>(
    null,
  );
  const [domains, setDomains] = useState<DomainSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiJson<{ membership: ProjectDomainMembership | null }>(path),
      apiJson<PageResponse<DomainSummary>>(
        `${pagePath("/api/v1/domains")}&lifecycle=active`,
      ),
    ])
      .then(([saved, page]) => {
        if (!active) return;
        setMembership(saved.membership);
        setSelectedId(saved.membership?.domain.id ?? "");
        setDomains(page.items);
        setCursor(page.nextCursor);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Domain context is unavailable.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path]);

  async function loadMore() {
    if (!cursor || busy) return;
    setBusy(true);
    setError(null);
    try {
      const page = await apiJson<PageResponse<DomainSummary>>(
        `${pagePath("/api/v1/domains", cursor)}&lifecycle=active`,
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

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const saved = await apiJson<{
        membership: ProjectDomainMembership | null;
      }>(path, {
        method: "PUT",
        body: JSON.stringify({
          domainId: selectedId || null,
          expectedDomainId: membership?.domain.id ?? null,
        }),
      });
      setMembership(saved.membership);
      setFeedback(
        saved.membership
          ? `Project is now owned by ${saved.membership.domain.name}. The project record and its other links remain the same.`
          : "Project is no longer assigned to a domain. Its record and other links remain the same.",
      );
      onMembershipChange();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not change the project domain.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="cmd-workspace-section"
      aria-labelledby="project-domain-heading"
    >
      <div className="cmd-section-heading">
        <div>
          <p className="cmd-eyebrow">Portfolio / Owning context</p>
          <h2 id="project-domain-heading">Domain</h2>
        </div>
        <a href="/domains">Manage domains</a>
      </div>
      <p className="cmd-section-intro">
        A domain organizes this project in the portfolio. Membership is a typed
        local relationship and does not grant access or change project identity.
      </p>
      {loading && <p role="status">Loading domain context...</p>}
      {error && (
        <p className="cmd-inline-state cmd-error" role="alert">
          {error}
        </p>
      )}
      {!loading && (
        <>
          <p>
            Current owner:{" "}
            {membership ? (
              <a href={`/domains/${membership.domain.id}`}>
                {membership.domain.name}
              </a>
            ) : (
              "Unassigned"
            )}
          </p>
          {membership && (
            <p className="cmd-record-identity">
              <a href={`/api/v1/project-domain-links/${membership.link.id}`}>
                View exact owned-by relationship
              </a>
            </p>
          )}
          <form className="cmd-form" onSubmit={save}>
            <label htmlFor="project-domain-choice">Owning domain</label>
            <select
              id="project-domain-choice"
              onChange={(event) => setSelectedId(event.target.value)}
              value={selectedId}
            >
              <option value="">No domain</option>
              {membership &&
                !domains.some((item) => item.id === membership.domain.id) && (
                  <option value={membership.domain.id}>
                    {membership.domain.name}
                  </option>
                )}
              {domains.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            {cursor && (
              <Button disabled={busy} onClick={loadMore} type="button">
                Load more domain choices
              </Button>
            )}
            <Button
              disabled={busy || selectedId === (membership?.domain.id ?? "")}
              type="submit"
            >
              {busy ? "Saving..." : "Save domain"}
            </Button>
          </form>
          {feedback && (
            <p className="cmd-form-success" role="status">
              {feedback}
            </p>
          )}
        </>
      )}
    </section>
  );
}
