"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  AppShell,
  Button,
  LocalAgentAuditList,
  LocalAgentReadReceipt,
  LocalAgentRunPanel,
  type LocalAgentAuditView,
  type LocalAgentProfileView,
  type LocalAgentReadView,
  type LocalAgentRunView,
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
  const [projectId, setProjectId] = useState("");
  const [operation, setOperation] = useState("project.brief.read");
  const [reason, setReason] = useState("");
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [readReceipt, setReadReceipt] = useState<LocalAgentReadView | null>(
    null,
  );

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
  }, [runId, loadAudit]);

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
