"use client";

import { useEffect, useState } from "react";
import type {
  LocalBackupEvidence,
  LocalRecoveryDrill,
  LocalRecoveryStatus,
} from "@commandry/contracts";
import {
  AppShell,
  Button,
  LocalBackupCard,
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
  const [backups, setBackups] = useState<LocalBackupEvidence[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [backupCursor, setBackupCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingMoreBackups, setLoadingMoreBackups] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [newStatus, page, backupPage] = await Promise.all([
        apiJson<LocalRecoveryStatus>("/api/v1/local-recovery-status"),
        apiJson<PageResponse<LocalRecoveryDrill>>(
          pagePath("/api/v1/local-recovery-drills"),
        ),
        apiJson<PageResponse<LocalBackupEvidence>>(
          pagePath("/api/v1/local-backups"),
        ),
      ]);
      setStatus(newStatus);
      setDrills(page.items);
      setNextCursor(page.nextCursor);
      setBackups(backupPage.items);
      setBackupCursor(backupPage.nextCursor);
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
      apiJson<PageResponse<LocalBackupEvidence>>(
        pagePath("/api/v1/local-backups"),
      ),
    ])
      .then(([newStatus, page, backupPage]) => {
        if (!active) return;
        setStatus(newStatus);
        setDrills(page.items);
        setNextCursor(page.nextCursor);
        setBackups(backupPage.items);
        setBackupCursor(backupPage.nextCursor);
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

  async function loadMoreBackups() {
    if (!backupCursor || loadingMoreBackups) return;
    setLoadingMoreBackups(true);
    setError(null);
    try {
      const page = await apiJson<PageResponse<LocalBackupEvidence>>(
        pagePath("/api/v1/local-backups", backupCursor),
      );
      setBackups((current) => [
        ...current,
        ...page.items.filter(
          (item) => !current.some((saved) => saved.id === item.id),
        ),
      ]);
      setBackupCursor(page.nextCursor);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoadingMoreBackups(false);
    }
  }

  return (
    <AppShell current="Infrastructure">
      <header className="cmd-page-header cmd-workspace-heading">
        <div>
          <p className="cmd-eyebrow">Infrastructure / Recovery evidence</p>
          <h1>Local recovery evidence</h1>
          <p className="cmd-lead">
            A disposable schema and fixture rehearsal, plus an encrypted backup
            of the current local PostgreSQL database. Neither verifies VPS or
            offsite recovery.
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
        <section className="cmd-panel" aria-labelledby="local-backup-history">
          <div className="cmd-panel-heading">
            <h2 id="local-backup-history">Encrypted local backups</h2>
          </div>
          <p>
            A local CLI encrypts the actual PostgreSQL archive and verifies it
            by restoring into a disposable database. Evidence records the result
            at creation. This page does not recheck the file or establish an
            offsite copy, a VPS restore, or production readiness.
          </p>
          <p>
            From this checkout run <code>pnpm backup:local</code>. Recheck an
            archive with <code>pnpm backup:local:verify &lt;backup-id&gt;</code>
            . Keep the local encryption key to open it later.
          </p>
          {backups.length === 0 && !loading && !error && (
            <RecordEmptyState
              title="No local backup recorded"
              description="Run the local backup command to encrypt the current database and record its disposable restore result."
            />
          )}
          {backups.map((backup) => (
            <LocalBackupCard backup={backup} key={backup.id} />
          ))}
          {backupCursor && (
            <Button
              disabled={loadingMoreBackups}
              onClick={loadMoreBackups}
              type="button"
            >
              {loadingMoreBackups ? "Loading..." : "Load more backups"}
            </Button>
          )}
        </section>
      </div>
    </AppShell>
  );
}
