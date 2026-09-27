"use client";

import { useEffect, useState } from "react";
import type {
  LocalRecoveryDrill,
  LocalRecoveryStatus,
} from "@commandry/contracts";
import {
  AppShell,
  Button,
  LocalRecoveryDrillCard,
  RecordEmptyState,
} from "@commandry/ui";
import { apiJson, pagePath, type PageResponse } from "../../projects/api";

const gateNames: Record<
  LocalRecoveryStatus["productionGates"][number]["code"],
  string
> = {
  vps_inventory: "VPS inventory and capacity",
  offsite_backup_restore: "Encrypted offsite backup and restore",
  deployment_control: "Constrained deployment controls",
  human_sign_in_recovery: "Human sign-in and account recovery",
};

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Recovery evidence is unavailable.";
}

export default function LocalRecoveryPage() {
  const [status, setStatus] = useState<LocalRecoveryStatus | null>(null);
  const [drills, setDrills] = useState<LocalRecoveryDrill[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [newStatus, page] = await Promise.all([
        apiJson<LocalRecoveryStatus>("/api/v1/local-recovery-status"),
        apiJson<PageResponse<LocalRecoveryDrill>>(
          pagePath("/api/v1/local-recovery-drills"),
        ),
      ]);
      setStatus(newStatus);
      setDrills(page.items);
      setNextCursor(page.nextCursor);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    void Promise.all([
      apiJson<LocalRecoveryStatus>("/api/v1/local-recovery-status"),
      apiJson<PageResponse<LocalRecoveryDrill>>(
        pagePath("/api/v1/local-recovery-drills"),
      ),
    ])
      .then(([newStatus, page]) => {
        if (!active) return;
        setStatus(newStatus);
        setDrills(page.items);
        setNextCursor(page.nextCursor);
      })
      .catch((cause: unknown) => {
        if (active) setError(errorMessage(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await apiJson<PageResponse<LocalRecoveryDrill>>(
        pagePath("/api/v1/local-recovery-drills", nextCursor),
      );
      setDrills((current) => [
        ...current,
        ...page.items.filter(
          (item) => !current.some((saved) => saved.id === item.id),
        ),
      ]);
      setNextCursor(page.nextCursor);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <AppShell current="Infrastructure">
      <header className="cmd-page-header cmd-workspace-heading">
        <div>
          <p className="cmd-eyebrow">Infrastructure / Recovery evidence</p>
          <h1>Local recovery rehearsal</h1>
          <p className="cmd-lead">
            A disposable PostgreSQL backup and restore exercise with an original
            capture fixture. This page reports local evidence only.
          </p>
          <p className="cmd-record-identity">
            <a href="/infrastructure">Return to infrastructure</a>
          </p>
        </div>
        <span className="cmd-headline-mark" aria-hidden="true">
          03 / Recover
        </span>
      </header>
      {error && (
        <p className="cmd-inline-state cmd-error" role="alert">
          {error}
        </p>
      )}
      <div className="cmd-panel-grid">
        <section className="cmd-panel" aria-labelledby="local-recovery-status">
          <div className="cmd-panel-heading">
            <h2 id="local-recovery-status">Local evidence</h2>
            <Button disabled={loading} onClick={refresh} type="button">
              {loading ? "Loading..." : "Refresh evidence"}
            </Button>
          </div>
          {loading && <p role="status">Loading recovery evidence...</p>}
          {status && (
            <div className="cmd-panel-content">
              <p>
                Latest rehearsal: <strong>{status.localRehearsal}</strong>
              </p>
              <p>
                A passed local rehearsal verifies a disposable restore and
                original capture bytes. It does not verify a VPS restore or an
                offsite backup.
              </p>
              <p>
                Run a fresh rehearsal from this local checkout with{" "}
                <code>pnpm recovery:rehearse</code>.
              </p>
            </div>
          )}
        </section>
        <section className="cmd-panel" aria-labelledby="production-gates">
          <div className="cmd-panel-heading">
            <h2 id="production-gates">Production gates</h2>
            <span className="cmd-panel-state">Not verified</span>
          </div>
          <p>
            The production Compose template is preparation for a later VPS
            handoff. These checks require real infrastructure and credentials.
          </p>
          <ul className="cmd-recovery-gates">
            {(status?.productionGates ?? []).map((gate) => (
              <li key={gate.code}>
                <span>{gateNames[gate.code]}</span>
                <span className="cmd-panel-state">{gate.status}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="cmd-panel" aria-labelledby="recovery-history">
          <div className="cmd-panel-heading">
            <h2 id="recovery-history">Rehearsal history</h2>
          </div>
          {drills.length === 0 && !loading && !error && (
            <RecordEmptyState
              title="No local rehearsal recorded"
              description="Run the local recovery command to create a source-backed record."
            />
          )}
          {drills.map((drill) => (
            <LocalRecoveryDrillCard drill={drill} key={drill.id} />
          ))}
          {nextCursor && (
            <Button disabled={loadingMore} onClick={loadMore} type="button">
              {loadingMore ? "Loading..." : "Load more rehearsals"}
            </Button>
          )}
        </section>
      </div>
    </AppShell>
  );
}
