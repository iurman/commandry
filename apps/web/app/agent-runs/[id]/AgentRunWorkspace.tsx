"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { LocalAgentCallbackEvent } from "@commandry/contracts";
import {
  AppShell,
  Button,
  LocalAgentAuditList,
  LocalAgentCallbackTimeline,
  LocalAgentReadReceipt,
  LocalAgentRunPanel,
  type ExecutionPacketView,
  type LocalAgentAuditView,
  type LocalAgentProfileView,
  type LocalAgentReadView,
  type LocalAgentRunView,
  type SimulatedApprovalView,
} from "@commandry/ui";
import { apiJson, pagePath, type PageResponse } from "../../projects/api";

function message(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback;
}

export default function AgentRunWorkspace({ runId }: { runId: string }) {
  const [run, setRun] = useState<LocalAgentRunView | null>(null);
  const [agent, setAgent] = useState<LocalAgentProfileView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [audit, setAudit] = useState<LocalAgentAuditView[]>([]);
  const [auditCursor, setAuditCursor] = useState<string | null>(null);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [callbacks, setCallbacks] = useState<LocalAgentCallbackEvent[]>([]);
  const [callbackCursor, setCallbackCursor] = useState<string | null>(null);
  const [callbackLoading, setCallbackLoading] = useState(true);
  const [callbackError, setCallbackError] = useState<string | null>(null);
  const [projectId, setProjectId] = useState("");
  const [operation, setOperation] = useState("project.brief.read");
  const [reason, setReason] = useState("");
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [readReceipt, setReadReceipt] = useState<LocalAgentReadView | null>(
    null,
  );
  const [packetResources, setPacketResources] = useState<
    ExecutionPacketView["snapshot"]["selectedResources"]
  >([]);
  const [packetResourcesLoading, setPacketResourcesLoading] = useState(true);
  const [packetResourcesError, setPacketResourcesError] = useState<
    string | null
  >(null);
  const [selectedResourceLinkId, setSelectedResourceLinkId] = useState("");
  const [proposing, setProposing] = useState(false);
  const [proposalError, setProposalError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<SimulatedApprovalView | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelFeedback, setCancelFeedback] = useState<string | null>(null);

  const loadAudit = useCallback(
    async (cursor?: string | null) => {
      setAuditLoading(true);
      setAuditError(null);
      try {
        const page = await apiJson<PageResponse<LocalAgentAuditView>>(
          pagePath(
            `/api/v1/agent-runs/${encodeURIComponent(runId)}/audit`,
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
        setAuditError(message(cause, "Could not load audit history."));
      } finally {
        setAuditLoading(false);
      }
    },
    [runId],
  );

  const loadCallbacks = useCallback(
    async (cursor?: string | null) => {
      setCallbackLoading(true);
      setCallbackError(null);
      try {
        const page = await apiJson<PageResponse<LocalAgentCallbackEvent>>(
          pagePath(
            `/api/v1/agent-runs/${encodeURIComponent(runId)}/callbacks`,
            cursor,
          ),
        );
        setCallbacks((current) =>
          cursor
            ? [
                ...current,
                ...page.items.filter(
                  (item) => !current.some((saved) => saved.id === item.id),
                ),
              ]
            : page.items,
        );
        setCallbackCursor(page.nextCursor);
      } catch (cause) {
        setCallbackError(message(cause, "Could not load runner callbacks."));
      } finally {
        setCallbackLoading(false);
      }
    },
    [runId],
  );

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      try {
        const record = await apiJson<LocalAgentRunView>(
          `/api/v1/agent-runs/${encodeURIComponent(runId)}`,
        );
        if (!active) return;
        setRun(record);
        setProjectId((current) => current || record.projectId);
        setError(null);
        if (record.state === "queued" || record.state === "running") {
          timer = setTimeout(() => void poll(), 2000);
        }
        void loadAudit();
        void loadCallbacks();
      } catch (cause) {
        if (active) setError(message(cause, "Agent run is unavailable."));
      } finally {
        if (active) setLoading(false);
      }
    }
    void poll();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [runId, loadAudit, loadCallbacks]);

  useEffect(() => {
    if (!run?.agentId) return;
    let active = true;
    apiJson<LocalAgentProfileView>(
      `/api/v1/agents/${encodeURIComponent(run.agentId)}`,
    )
      .then((record) => {
        if (active) setAgent(record);
      })
      .catch(() => {
        if (active) setAgent(null);
      });
    return () => {
      active = false;
    };
  }, [run?.agentId]);

  useEffect(() => {
    if (run?.state !== "succeeded") return;
    let active = true;
    apiJson<ExecutionPacketView>(
      `/api/v1/execution-packets/${encodeURIComponent(run.packetId)}`,
    )
      .then((packet) => {
        if (!active) return;
        setPacketResources(packet.snapshot.selectedResources);
        setSelectedResourceLinkId((current) =>
          packet.snapshot.selectedResources.some(
            (resource) => resource.linkId === current,
          )
            ? current
            : "",
        );
      })
      .catch((cause: unknown) => {
        if (active)
          setPacketResourcesError(
            message(cause, "Could not read packet-selected resources."),
          );
      })
      .finally(() => {
        if (active) setPacketResourcesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [run?.packetId, run?.state]);

  async function proposeAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !run ||
      run.state !== "succeeded" ||
      !selectedResourceLinkId ||
      proposing
    )
      return;
    setProposing(true);
    setProposalError(null);
    setProposal(null);
    try {
      const created = await apiJson<SimulatedApprovalView>(
        `/api/v1/agent-runs/${encodeURIComponent(run.id)}/simulated-actions`,
        {
          method: "POST",
          body: JSON.stringify({
            projectResourceLinkId: selectedResourceLinkId,
            mode: "graceful",
            occurrenceId: crypto.randomUUID(),
          }),
        },
      );
      setProposal(created);
    } catch (cause) {
      setProposalError(message(cause, "Could not create the local proposal."));
    } finally {
      setProposing(false);
    }
  }

  async function readContext(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!run || !projectId.trim() || !reason.trim() || reading) return;
    setReading(true);
    setReadError(null);
    setReadReceipt(null);
    try {
      const receipt = await apiJson<LocalAgentReadView>(
        `/api/v1/agent-runs/${encodeURIComponent(run.id)}/context-reads`,
        {
          method: "POST",
          body: JSON.stringify({
            projectId: projectId.trim(),
            operation,
            reason: reason.trim(),
          }),
        },
      );
      setReadReceipt(receipt);
      setReason("");
    } catch (cause) {
      setReadError(message(cause, "Context read was denied or unavailable."));
    } finally {
      setReading(false);
      await loadAudit();
      await loadCallbacks();
    }
  }

  async function cancelRun() {
    if (!run || cancelling) return;
    setCancelling(true);
    setCancelFeedback(null);
    try {
      const current = await apiJson<LocalAgentRunView>(
        `/api/v1/agent-runs/${encodeURIComponent(run.id)}/cancel`,
        { method: "POST" },
      );
      setRun(current);
      setCancelFeedback(
        current.state === "canceled"
          ? "Synthetic run canceled. No result or external action was produced."
          : `Run already ${current.state}; its recorded outcome was preserved.`,
      );
      await loadAudit();
    } catch (cause) {
      setCancelFeedback(message(cause, "Could not cancel the local run."));
    } finally {
      setCancelling(false);
    }
  }

  return (
    <AppShell current="Agents">
      <nav className="cmd-breadcrumb" aria-label="Breadcrumb">
        <a href="/agents">Agents</a>
        <span aria-hidden="true">/</span>
        <span>Agent run</span>
      </nav>
      {loading && (
        <p className="cmd-inline-state" role="status">
          Loading fake local run...
        </p>
      )}
      {error && (
        <p className="cmd-inline-state cmd-error" role="alert">
          {error}
        </p>
      )}
      {run && (
        <>
          <LocalAgentRunPanel
            run={run}
            {...(agent ? { agentName: agent.name } : {})}
          />
          {callbackError && (
            <p className="cmd-inline-state cmd-error" role="alert">
              {callbackError}
            </p>
          )}
          {callbackLoading && callbacks.length === 0 && (
            <p className="cmd-inline-state" role="status">
              Loading local runner callbacks...
            </p>
          )}
          <LocalAgentCallbackTimeline runId={run.id} events={callbacks} />
          {callbackCursor && (
            <Button
              type="button"
              disabled={callbackLoading}
              onClick={() => void loadCallbacks(callbackCursor)}
            >
              {callbackLoading ? "Loading..." : "Load more runner callbacks"}
            </Button>
          )}
          <section className="cmd-local-run-audit" aria-label="Run control">
            <h2>Local run control</h2>
            <p>
              Cancellation closes the synthetic run and its read grant. A worker
              already finishing may complete first; the recorded state is
              returned without changing its result.
            </p>
            {(run.state === "queued" || run.state === "running") && (
              <Button
                type="button"
                disabled={cancelling}
                onClick={() => void cancelRun()}
              >
                {cancelling ? "Canceling..." : "Cancel synthetic run"}
              </Button>
            )}
            {cancelFeedback && <p role="status">{cancelFeedback}</p>}
          </section>
          <section
            className="cmd-approval-proposal"
            aria-labelledby="proposal-heading"
          >
            <p className="cmd-eyebrow">Governed action / Local simulation</p>
            <h2 id="proposal-heading">Create simulated action proposal</h2>
            <p>
              A completed fake run can propose only a graceful simulated restart
              for a resource selected in its immutable packet. The review
              request is sensitive, requires a local decision, and has no
              external effect. The run&apos;s read grant does not become a write
              capability.
            </p>
            {run.state !== "succeeded" && (
              <p className="cmd-inline-state">
                Proposal creation opens after this fake run succeeds.
              </p>
            )}
            {packetResourcesLoading && (
              <p className="cmd-inline-state" role="status">
                Loading packet-selected resources...
              </p>
            )}
            {packetResourcesError && (
              <p className="cmd-inline-state cmd-error" role="alert">
                {packetResourcesError}
              </p>
            )}
            {run.state === "succeeded" &&
              !packetResourcesLoading &&
              !packetResourcesError &&
              packetResources.length === 0 && (
                <p className="cmd-inline-state">
                  This packet selected no resource. Review the packet and
                  generate a new version with an explicit resource selection.
                </p>
              )}
            {run.state === "succeeded" && packetResources.length > 0 && (
              <form
                className="cmd-form"
                onSubmit={(event) => void proposeAction(event)}
              >
                <label htmlFor="proposal-resource-link">
                  Packet-selected resource link
                </label>
                <select
                  id="proposal-resource-link"
                  required
                  value={selectedResourceLinkId}
                  onChange={(event) =>
                    setSelectedResourceLinkId(event.target.value)
                  }
                >
                  <option value="">Select exact resource link</option>
                  {packetResources.map((resource) => (
                    <option key={resource.linkId} value={resource.linkId}>
                      {resource.id} / {resource.linkType} / link{" "}
                      {resource.linkId}
                    </option>
                  ))}
                </select>
                <p className="cmd-form-hint">
                  Exact parameter: <code>mode=graceful</code>. Reason and
                  expected result are fixed in the descriptor for this local
                  simulation.
                </p>
                <Button
                  type="submit"
                  disabled={proposing || !selectedResourceLinkId}
                >
                  {proposing
                    ? "Creating proposal..."
                    : "Create proposal for review"}
                </Button>
              </form>
            )}
            {proposalError && (
              <p className="cmd-form-error" role="alert">
                {proposalError}
              </p>
            )}
            {proposal && (
              <p className="cmd-form-success" role="status">
                Synthetic proposal recorded.{" "}
                <a href={`/approvals/${encodeURIComponent(proposal.id)}`}>
                  Review approval request
                </a>
              </p>
            )}
          </section>
          <section
            className="cmd-local-run-assignment"
            aria-labelledby="run-read-heading"
          >
            <p className="cmd-eyebrow">Run capability / Read only</p>
            <h2 id="run-read-heading">Read scoped context</h2>
            <p className="cmd-section-intro">
              A manual read is allowed only while this run is active, before its
              grant expires, for its assigned project and listed operations.
              Each allowed or denied request is audited. The worker&apos;s own
              scoped reads appear in the audit and result evidence.
            </p>
            {run.state !== "queued" && run.state !== "running" && (
              <p className="cmd-inline-state">
                This run is {run.state}; its manual read grant is closed. A new
                request will be denied and recorded.
              </p>
            )}
            <form
              className="cmd-form cmd-local-run-read-form"
              onSubmit={(event) => void readContext(event)}
            >
              <label htmlFor="read-project-id">Project ID</label>
              <input
                id="read-project-id"
                required
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
              />
              <p className="cmd-form-hint">
                Grant project: {run.grant.projectId}. A different project is
                denied by policy.
              </p>
              <label htmlFor="read-operation">Operation</label>
              <select
                id="read-operation"
                value={operation}
                onChange={(event) => setOperation(event.target.value)}
              >
                <option value="project.brief.read">project.brief.read</option>
                <option value="work.read">work.read</option>
                <option value="resource.write">
                  resource.write (not granted)
                </option>
              </select>
              <label htmlFor="read-reason">Reason *</label>
              <textarea
                id="read-reason"
                required
                rows={2}
                maxLength={500}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Why is this context needed for the packet?"
              />
              <Button
                type="submit"
                disabled={reading || !reason.trim() || !projectId.trim()}
              >
                {reading ? "Checking grant..." : "Read scoped context"}
              </Button>
            </form>
            {readError && (
              <p className="cmd-form-error" role="alert">
                {readError}
              </p>
            )}
            {readReceipt && <LocalAgentReadReceipt read={readReceipt} />}
          </section>
          {auditLoading && audit.length === 0 && (
            <p className="cmd-inline-state" role="status">
              Loading audit history...
            </p>
          )}
          {auditError && (
            <p className="cmd-inline-state cmd-error" role="alert">
              {auditError}
            </p>
          )}
          <LocalAgentAuditList items={audit}>
            {auditCursor && (
              <Button
                disabled={auditLoading}
                onClick={() => void loadAudit(auditCursor)}
              >
                {auditLoading ? "Loading..." : "Load more audit events"}
              </Button>
            )}
            <Button disabled={auditLoading} onClick={() => void loadAudit()}>
              Refresh audit
            </Button>
          </LocalAgentAuditList>
        </>
      )}
    </AppShell>
  );
}
