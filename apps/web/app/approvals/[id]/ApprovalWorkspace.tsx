"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AppShell,
  Button,
  SimulatedApprovalAuditList,
  SimulatedApprovalPanel,
  type SimulatedApprovalAuditView,
  type SimulatedApprovalView,
} from "@commandry/ui";
import {
  apiJson,
  pagePath,
  type PageResponse,
  type ProjectRecord,
  type ResourceRecord,
} from "../../projects/api";

function message(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback;
}

export default function ApprovalWorkspace({
  approvalId,
}: {
  approvalId: string;
}) {
  const [approval, setApproval] = useState<SimulatedApprovalView | null>(null);
  const [projectName, setProjectName] = useState<string>();
  const [resourceName, setResourceName] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [audit, setAudit] = useState<SimulatedApprovalAuditView[]>([]);
  const [auditCursor, setAuditCursor] = useState<string | null>(null);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [deciding, setDeciding] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [decisionNotice, setDecisionNotice] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const noticeRef = useRef<HTMLParagraphElement>(null);

  const loadAudit = useCallback(
    async (cursor?: string | null) => {
      setAuditLoading(true);
      setAuditError(null);
      try {
        const page = await apiJson<PageResponse<SimulatedApprovalAuditView>>(
          pagePath(
            `/api/v1/approvals/${encodeURIComponent(approvalId)}/audit`,
            cursor,
          ),
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
        setAuditError(message(cause, "Could not load approval history."));
      } finally {
        setAuditLoading(false);
      }
    },
    [approvalId],
  );

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll(first: boolean) {
      try {
        const record = await apiJson<SimulatedApprovalView>(
          `/api/v1/approvals/${encodeURIComponent(approvalId)}`,
        );
        if (!active) return;
        setApproval(record);
        setError(null);
        if (first || record.outcome) void loadAudit();
        if (record.state === "approved" && !record.outcome) {
          timer = setTimeout(() => void poll(false), 2000);
        }
      } catch (cause) {
        if (active) setError(message(cause, "Approval is unavailable."));
      } finally {
        if (active) setLoading(false);
      }
    }
    void poll(true);
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [approvalId, refreshVersion, loadAudit]);

  const targetProjectId = approval?.descriptor.target.projectId;
  const targetResourceId = approval?.descriptor.target.resourceId;
  useEffect(() => {
    if (!targetProjectId || !targetResourceId) return;
    let active = true;
    void Promise.allSettled([
      apiJson<ProjectRecord>(
        `/api/v1/projects/${encodeURIComponent(targetProjectId)}`,
      ),
      apiJson<ResourceRecord>(
        `/api/v1/resources/${encodeURIComponent(targetResourceId)}`,
      ),
    ]).then(([project, resource]) => {
      if (!active) return;
      setProjectName(
        project.status === "fulfilled" ? project.value.name : undefined,
      );
      setResourceName(
        resource.status === "fulfilled" ? resource.value.name : undefined,
      );
    });
    return () => {
      active = false;
    };
  }, [targetProjectId, targetResourceId]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  async function decide(decision: "approve" | "reject" | "cancel") {
    if (!approval || approval.state !== "pending" || deciding) return;
    setDeciding(true);
    setDecisionError(null);
    setDecisionNotice(null);
    try {
      const record = await apiJson<SimulatedApprovalView>(
        `/api/v1/approvals/${encodeURIComponent(approval.id)}/decisions`,
        {
          method: "POST",
          body: JSON.stringify({
            decision,
            expectedDigest: approval.descriptorDigest,
            occurrenceId: crypto.randomUUID(),
          }),
        },
      );
      setApproval(record);
      setDecisionNotice(
        decision === "approve"
          ? "Local simulation approved. Waiting for the separate worker to record its no-effect outcome."
          : decision === "reject"
            ? "Proposal rejected. No simulation was queued."
            : "Proposal cancelled. No simulation was queued.",
      );
      setRefreshVersion((value) => value + 1);
      void loadAudit();
      queueMicrotask(() => noticeRef.current?.focus());
    } catch (cause) {
      setDecisionError(
        `${message(cause, "Decision was not accepted.")} The latest descriptor and state are being reloaded.`,
      );
      setRefreshVersion((value) => value + 1);
      void loadAudit();
    } finally {
      setDeciding(false);
    }
  }

  const expiredLocally =
    approval?.state === "pending" &&
    now >= Date.parse(approval.descriptor.expiresAt);
  const canDecide =
    approval?.state === "pending" && !expiredLocally && !deciding;

  return (
    <AppShell current="Approvals">
      <nav className="cmd-breadcrumb" aria-label="Breadcrumb">
        <a href="/approvals">Approvals</a>
        <span aria-hidden="true">/</span>
        <span>Exact review</span>
      </nav>
      {loading && !approval && (
        <p className="cmd-inline-state" role="status">
          Loading exact action review...
        </p>
      )}
      {error && (
        <p className="cmd-inline-state cmd-error" role="alert">
          {error}
        </p>
      )}
      {approval && (
        <>
          <SimulatedApprovalPanel
            approval={approval}
            {...(projectName ? { projectName } : {})}
            {...(resourceName ? { resourceName } : {})}
          />
          <section
            className="cmd-approval-decision"
            aria-labelledby="decision-heading"
          >
            <p className="cmd-eyebrow">Digest-bound local decision</p>
            <h2 id="decision-heading">Decide this exact proposal</h2>
            <p>
              The decision applies only to descriptor digest{" "}
              <code>{approval.descriptorDigest}</code>. A changed target,
              parameter, or descriptor requires a new proposal. This local
              review is unattributed and does not establish product human
              authentication.
            </p>
            {expiredLocally && (
              <p className="cmd-inline-state">
                This request has passed its expiry. Refresh to reconcile the
                recorded state.
              </p>
            )}
            {approval.state !== "pending" && (
              <p className="cmd-inline-state">
                This proposal is {approval.state}. Decision controls are closed.
              </p>
            )}
            <div className="cmd-approval-decision-actions">
              <Button
                disabled={!canDecide}
                onClick={() => void decide("approve")}
              >
                {deciding ? "Saving decision..." : "Approve local simulation"}
              </Button>
              <Button
                disabled={!canDecide}
                onClick={() => void decide("reject")}
              >
                Reject proposal
              </Button>
              <Button
                disabled={!canDecide}
                onClick={() => void decide("cancel")}
              >
                Cancel proposal
              </Button>
              <Button onClick={() => setRefreshVersion((value) => value + 1)}>
                Refresh review
              </Button>
            </div>
            {decisionNotice && (
              <p
                className="cmd-form-success"
                role="status"
                tabIndex={-1}
                ref={noticeRef}
              >
                {decisionNotice}
              </p>
            )}
            {decisionError && (
              <p className="cmd-form-error" role="alert">
                {decisionError}
              </p>
            )}
          </section>
          {auditLoading && audit.length === 0 && (
            <p className="cmd-inline-state" role="status">
              Loading approval history...
            </p>
          )}
          {auditError && (
            <p className="cmd-inline-state cmd-error" role="alert">
              {auditError}
            </p>
          )}
          <SimulatedApprovalAuditList items={audit}>
            {auditCursor && (
              <Button
                disabled={auditLoading}
                onClick={() => void loadAudit(auditCursor)}
              >
                {auditLoading ? "Loading..." : "Load more approval events"}
              </Button>
            )}
            <Button disabled={auditLoading} onClick={() => void loadAudit()}>
              Refresh approval history
            </Button>
          </SimulatedApprovalAuditList>
        </>
      )}
    </AppShell>
  );
}
