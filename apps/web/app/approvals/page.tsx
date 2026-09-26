"use client";

import { useEffect, useRef, useState } from "react";
import {
  AppShell,
  Button,
  RecordEmptyState,
  SimulatedApprovalCard,
  type SimulatedApprovalView,
} from "@commandry/ui";
import { apiJson, pagePath, type PageResponse } from "../projects/api";

type ApprovalState = SimulatedApprovalView["state"];
type Filter = "all" | ApprovalState;

function listPath(cursor: string | null, filter: Filter) {
  const url = pagePath("/api/v1/approvals", cursor);
  return filter === "all" ? url : `${url}&state=${filter}`;
}

function message(cause: unknown) {
  return cause instanceof Error ? cause.message : "Could not load approvals.";
}

export default function ApprovalsPage() {
  const [items, setItems] = useState<SimulatedApprovalView[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const version = useRef(0);

  useEffect(() => {
    const currentVersion = ++version.current;
    apiJson<PageResponse<SimulatedApprovalView>>(listPath(null, filter))
      .then((page) => {
        if (version.current !== currentVersion) return;
        setItems(page.items);
        setCursor(page.nextCursor);
      })
      .catch((cause: unknown) => {
        if (version.current === currentVersion) setError(message(cause));
      })
      .finally(() => {
        if (version.current === currentVersion) setLoading(false);
      });
  }, [filter]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    const currentVersion = version.current;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await apiJson<PageResponse<SimulatedApprovalView>>(
        listPath(cursor, filter),
      );
      if (version.current !== currentVersion) return;
      setItems((current) => [
        ...current,
        ...page.items.filter(
          (item) => !current.some((saved) => saved.id === item.id),
        ),
      ]);
      setCursor(page.nextCursor);
    } catch (cause) {
      if (version.current === currentVersion) setError(message(cause));
    } finally {
      if (version.current === currentVersion) setLoadingMore(false);
    }
  }

  function selectFilter(next: Filter) {
    version.current += 1;
    setFilter(next);
    setLoading(true);
    setError(null);
    setItems([]);
    setCursor(null);
  }

  return (
    <AppShell current="Approvals">
      <header className="cmd-page-header cmd-workspace-heading">
        <div>
          <p className="cmd-eyebrow">Agents / Action review</p>
          <h1>Approval requests</h1>
          <p className="cmd-lead">
            Review exact local simulation proposals, decision history, and
            no-effect outcomes.
          </p>
        </div>
        <span className="cmd-headline-mark" aria-hidden="true">
          06 / Governed action
        </span>
      </header>
      <div className="cmd-notice cmd-synthetic-notice">
        <h2>Local simulation only</h2>
        <p>
          These requests come from synthetic local runs. Decisions here do not
          authenticate a human, grant a real capability, or contact an external
          resource.
        </p>
      </div>
      <section aria-labelledby="approval-queue-heading">
        <div className="cmd-section-heading">
          <div>
            <p className="cmd-eyebrow">Review queue</p>
            <h2 id="approval-queue-heading">Proposals and outcomes</h2>
          </div>
          <span className="cmd-count">{items.length} shown</span>
        </div>
        <div className="cmd-form cmd-approval-filter">
          <label htmlFor="approval-state-filter">Decision state</label>
          <select
            id="approval-state-filter"
            value={filter}
            onChange={(event) => selectFilter(event.target.value as Filter)}
          >
            <option value="all">All states</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
            <option value="expired">Expired</option>
          </select>
        </div>
        {loading && (
          <p className="cmd-inline-state" role="status">
            Loading approval requests...
          </p>
        )}
        {error && (
          <p className="cmd-inline-state cmd-error" role="alert">
            {error}
          </p>
        )}
        {!loading && !error && items.length === 0 && (
          <RecordEmptyState
            title="No approval requests in this view"
            description="Finish a fake local run with a packet-selected resource, then create a simulated action proposal from that run."
          />
        )}
        {items.length > 0 && (
          <ol className="cmd-approval-queue" aria-label="Approval requests">
            {items.map((approval) => (
              <li key={approval.id}>
                <SimulatedApprovalCard approval={approval} />
              </li>
            ))}
          </ol>
        )}
        {cursor && (
          <Button disabled={loadingMore} onClick={() => void loadMore()}>
            {loadingMore ? "Loading..." : "Load more approvals"}
          </Button>
        )}
      </section>
    </AppShell>
  );
}
