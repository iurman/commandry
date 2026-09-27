"use client";

import { useEffect, useRef, useState } from "react";
import type {
  CachedLocalAgentResultResponse,
  EvidenceReference,
  ExecutionPacket as ExecutionPacketRecord,
  LocalAgentRoutingCandidate,
  LocalAgentRoutingResponse,
  OvernightQueueEntry,
  OvernightReadiness,
} from "@commandry/contracts";
import {
  AppShell,
  Button,
  CachedLocalResultCard,
  ExecutionPacket,
  LocalAgentRouteCard,
  type LocalAgentRunView,
} from "@commandry/ui";
import { apiJson, pagePath } from "../../projects/api";
import LocalMcpAccess from "./LocalMcpAccess";

export default function ExecutionPacketWorkspace({
  packetId,
}: {
  packetId: string;
}) {
  const [packet, setPacket] = useState<ExecutionPacketRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agents, setAgents] = useState<LocalAgentRoutingCandidate[]>([]);
  const [agentCursor, setAgentCursor] = useState<string | null>(null);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [agentsError, setAgentsError] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [startedRun, setStartedRun] = useState<LocalAgentRunView | null>(null);
  const [cached, setCached] =
    useState<CachedLocalAgentResultResponse["result"]>(null);
  const [cachedEvidence, setCachedEvidence] = useState<EvidenceReference[]>([]);
  const [cacheCursor, setCacheCursor] = useState<number | null>(null);
  const [cacheLoading, setCacheLoading] = useState(false);
  const [cacheError, setCacheError] = useState<string | null>(null);
  const [cacheRefresh, setCacheRefresh] = useState(0);
  const cacheRequestVersion = useRef(0);
  const [readiness, setReadiness] = useState<OvernightReadiness | null>(null);
  const [runAfterLocal, setRunAfterLocal] = useState("");
  const [scheduling, setScheduling] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduledEntry, setScheduledEntry] =
    useState<OvernightQueueEntry | null>(null);

  async function loadAgents(packetId: string, cursor?: string | null) {
    setAgentsLoading(true);
    setAgentsError(null);
    try {
      const page = await apiJson<LocalAgentRoutingResponse>(
        pagePath(
          `/api/v1/execution-packets/${encodeURIComponent(packetId)}/agent-routing`,
          cursor,
        ),
      );
      setAgents((current) =>
        cursor
          ? [
              ...current,
              ...page.items.filter(
                (choice) =>
                  !current.some((saved) => saved.agent.id === choice.agent.id),
              ),
            ]
          : page.items,
      );
      setAgentCursor(page.nextCursor);
    } catch (cause) {
      setAgentsError(
        cause instanceof Error ? cause.message : "Could not load local agents.",
      );
    } finally {
      setAgentsLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    apiJson<ExecutionPacketRecord>(
      `/api/v1/execution-packets/${encodeURIComponent(packetId)}`,
    )
      .then((record) => {
        if (active) {
          setPacket(record);
          void loadAgents(record.id);
        }
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Execution packet is unavailable.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [packetId]);

  useEffect(() => {
    if (!packet || !selectedAgentId) return;
    let active = true;
    const params = new URLSearchParams({ agentId: selectedAgentId });
    apiJson<CachedLocalAgentResultResponse>(
      `/api/v1/execution-packets/${encodeURIComponent(packet.id)}/cached-local-result?${params}`,
    )
      .then((page) => {
        if (!active) return;
        setCached(page.result);
        setCachedEvidence(page.items);
        setCacheCursor(page.nextCursor);
      })
      .catch((cause: unknown) => {
        if (active)
          setCacheError(
            cause instanceof Error
              ? cause.message
              : "Could not load saved fake-run result.",
          );
      })
      .finally(() => {
        if (active) setCacheLoading(false);
      });
    return () => {
      active = false;
    };
  }, [packet, selectedAgentId, cacheRefresh]);

  async function loadMoreCachedEvidence() {
    if (!packet || !selectedAgentId || cacheCursor === null || cacheLoading)
      return;
    const requestVersion = cacheRequestVersion.current;
    setCacheLoading(true);
    setCacheError(null);
    try {
      const params = new URLSearchParams({
        agentId: selectedAgentId,
        cursor: String(cacheCursor),
      });
      const page = await apiJson<CachedLocalAgentResultResponse>(
        `/api/v1/execution-packets/${encodeURIComponent(packet.id)}/cached-local-result?${params}`,
      );
      if (requestVersion !== cacheRequestVersion.current) return;
      if (page.result?.runId !== cached?.runId)
        throw new Error("Saved result changed. Refresh the evidence page.");
      setCachedEvidence((current) => [...current, ...page.items]);
      setCacheCursor(page.nextCursor);
    } catch (cause) {
      if (requestVersion === cacheRequestVersion.current)
        setCacheError(
          cause instanceof Error
            ? cause.message
            : "Could not load more evidence.",
        );
    } finally {
      if (requestVersion === cacheRequestVersion.current)
        setCacheLoading(false);
    }
  }

  useEffect(() => {
    if (!packet || !selectedAgentId) return;
    let active = true;
    const params = new URLSearchParams({
      packetId: packet.id,
      agentId: selectedAgentId,
    });
    apiJson<OvernightReadiness>(`/api/v1/overnight/readiness?${params}`)
      .then((result) => {
        if (active) setReadiness(result);
      })
      .catch(() => {
        if (active) setReadiness(null);
      });
    return () => {
      active = false;
    };
  }, [packet, selectedAgentId]);

  return (
    <AppShell current="Projects">
      <nav className="cmd-breadcrumb" aria-label="Breadcrumb">
        <a href="/projects">Projects</a>
        <span aria-hidden="true">/</span>
        {packet && (
          <a href={`/projects/${encodeURIComponent(packet.projectId)}`}>
            Project
          </a>
        )}
        {packet && <span aria-hidden="true">/</span>}
        {packet && (
          <a href={`/work-items/${encodeURIComponent(packet.workItemId)}`}>
            Work item
          </a>
        )}
        {packet && <span aria-hidden="true">/</span>}
        <span>Execution packet</span>
      </nav>
      {loading && (
        <p className="cmd-inline-state" role="status">
          Loading execution packet...
        </p>
      )}
      {error && (
        <p className="cmd-inline-state cmd-error" role="alert">
          {error}
        </p>
      )}
      {packet && (
        <>
          <ExecutionPacket packet={packet} />
          <section
            className="cmd-local-run-assignment"
            aria-labelledby="start-local-run-heading"
          >
            <p className="cmd-eyebrow">Next step / Local simulation</p>
            <h2 id="start-local-run-heading">Start fake local run</h2>
            <p className="cmd-section-intro">
              Choose an agent assigned to this packet&apos;s project. Starting a
              run creates a short-lived read grant for the saved packet version.
              The local worker makes a deterministic, unverified result and
              takes no external action.
            </p>
            {agentsLoading && (
              <p className="cmd-inline-state" role="status">
                Checking project-scoped agents...
              </p>
            )}
            {agentsError && (
              <p className="cmd-inline-state cmd-error" role="alert">
                {agentsError}
              </p>
            )}
            {!agentsLoading && agents.length === 0 && !agentsError && (
              <p>
                No agent is assigned to this packet&apos;s project.{" "}
                <a href="/agents">
                  Create a synthetic agent and assign this project.
                </a>
              </p>
            )}
            <p className="cmd-form-hint">
              Routing uses recorded project assignment and current fake-run
              load. Skills, budget, and provider capacity are unassessed.
              Selection is manual; no external runner or action capability is
              connected.
            </p>
            {agents.length > 0 && (
              <form
                className="cmd-form"
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (!selectedAgentId || starting) return;
                  setStarting(true);
                  setStartError(null);
                  setStartedRun(null);
                  try {
                    const run = await apiJson<LocalAgentRunView>(
                      `/api/v1/execution-packets/${encodeURIComponent(packet.id)}/agent-runs`,
                      {
                        method: "POST",
                        body: JSON.stringify({
                          agentId: selectedAgentId,
                          occurrenceId: crypto.randomUUID(),
                        }),
                      },
                    );
                    setStartedRun(run);
                  } catch (cause) {
                    setStartError(
                      cause instanceof Error
                        ? cause.message
                        : "Could not start fake local run.",
                    );
                  } finally {
                    setStarting(false);
                  }
                }}
              >
                <label htmlFor="packet-agent-choice">
                  Eligible project-scoped agent
                </label>
                <select
                  id="packet-agent-choice"
                  value={selectedAgentId}
                  onChange={(event) => {
                    cacheRequestVersion.current += 1;
                    setReadiness(null);
                    setSelectedAgentId(event.target.value);
                    setCached(null);
                    setCachedEvidence([]);
                    setCacheCursor(null);
                    setCacheError(null);
                    setCacheLoading(Boolean(event.target.value));
                  }}
                >
                  <option value="">Choose an eligible local agent</option>
                  {agents.map(({ agent, activeRunCount }) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name} / project-scoped read / {activeRunCount}{" "}
                      active fake jobs
                    </option>
                  ))}
                </select>
                <p className="cmd-form-hint">
                  {agents.length} assigned profiles shown. Only assigned agents
                  can start this packet.
                </p>
                {agents
                  .filter(({ agent }) => agent.id === selectedAgentId)
                  .map((choice) => (
                    <LocalAgentRouteCard
                      key={choice.agent.id}
                      candidate={choice}
                    />
                  ))}
                <Button
                  variant="primary"
                  type="submit"
                  disabled={!selectedAgentId || starting}
                >
                  {starting ? "Starting..." : "Start fake local run"}
                </Button>
              </form>
            )}
            {agentCursor && (
              <Button
                disabled={agentsLoading}
                onClick={() => void loadAgents(packet.id, agentCursor)}
              >
                {agentsLoading ? "Loading..." : "Load more local agents"}
              </Button>
            )}
            {startError && (
              <p className="cmd-form-error" role="alert">
                {startError}
              </p>
            )}
            {startedRun && (
              <p className="cmd-form-success" role="status">
                Fake local run queued.{" "}
                <a href={`/agent-runs/${encodeURIComponent(startedRun.id)}`}>
                  Review agent run
                </a>
              </p>
            )}
            {selectedAgentId && (
              <div aria-label="Saved fake-run evidence">
                <h3>Saved fake-run evidence</h3>
                <p className="cmd-form-hint">
                  Historical output is bound to this exact packet digest.
                  Refresh after a fake run completes to see its saved evidence.
                </p>
                <Button
                  onClick={() => {
                    cacheRequestVersion.current += 1;
                    setCacheLoading(true);
                    setCacheError(null);
                    setCacheRefresh((value) => value + 1);
                  }}
                  disabled={cacheLoading}
                >
                  Refresh saved result
                </Button>
                {cacheLoading && (
                  <p role="status">Loading saved fake-run evidence...</p>
                )}
                {cacheError && <p role="alert">{cacheError}</p>}
                {!cacheLoading && !cacheError && !cached && (
                  <p>
                    No completed fake run is saved for this packet and agent.
                  </p>
                )}
                {cached && (
                  <CachedLocalResultCard
                    result={cached}
                    evidence={cachedEvidence}
                  />
                )}
                {cacheCursor !== null && (
                  <Button
                    onClick={() => void loadMoreCachedEvidence()}
                    disabled={cacheLoading}
                  >
                    Load more saved evidence
                  </Button>
                )}
              </div>
            )}
          </section>
          <section
            className="cmd-local-run-assignment"
            aria-labelledby="overnight-heading"
          >
            <p className="cmd-eyebrow">
              Next step / Synthetic local overnight queue
            </p>
            <h2 id="overnight-heading">Queue a fake overnight run</h2>
            <p className="cmd-section-intro">
              This schedules the same packet and agent for a later local worker
              read. Read grants are created only when due. The result is
              unverified; no external action occurs.
            </p>
            {selectedAgentId && readiness && (
              <div aria-label="Overnight readiness">
                <h3>Readiness</h3>
                <ul>
                  {readiness.checks.map((check) => (
                    <li key={check.key}>
                      {check.ok ? "Ready" : "Blocked"}: {check.message}
                    </li>
                  ))}
                </ul>
                {readiness.warnings.map((warning) => (
                  <p className="cmd-form-hint" key={warning}>
                    {warning}
                  </p>
                ))}
              </div>
            )}
            {!selectedAgentId && (
              <p className="cmd-form-hint">
                Choose an eligible agent in the local run section above to
                review readiness.
              </p>
            )}
            <form
              className="cmd-form"
              onSubmit={async (event) => {
                event.preventDefault();
                if (
                  !packet ||
                  !selectedAgentId ||
                  !readiness?.ready ||
                  scheduling
                )
                  return;
                const date = new Date(runAfterLocal);
                if (
                  !Number.isFinite(date.getTime()) ||
                  date.getTime() <= Date.now()
                ) {
                  setScheduleError("Choose a future local time.");
                  return;
                }
                setScheduling(true);
                setScheduleError(null);
                setScheduledEntry(null);
                try {
                  const entry = await apiJson<OvernightQueueEntry>(
                    "/api/v1/overnight",
                    {
                      method: "POST",
                      body: JSON.stringify({
                        packetId: packet.id,
                        agentId: selectedAgentId,
                        runAfter: date.toISOString(),
                      }),
                    },
                  );
                  setScheduledEntry(entry);
                } catch (cause) {
                  setScheduleError(
                    cause instanceof Error
                      ? cause.message
                      : "Could not schedule fake overnight run.",
                  );
                } finally {
                  setScheduling(false);
                }
              }}
            >
              <label htmlFor="overnight-run-after">
                Run after (your local time)
              </label>
              <input
                id="overnight-run-after"
                type="datetime-local"
                step={1}
                value={runAfterLocal}
                onChange={(event) => setRunAfterLocal(event.target.value)}
                required
              />
              <Button
                type="submit"
                variant="primary"
                disabled={!readiness?.ready || !runAfterLocal || scheduling}
              >
                {scheduling ? "Scheduling..." : "Schedule fake local run"}
              </Button>
            </form>
            {scheduleError && (
              <p className="cmd-form-error" role="alert">
                {scheduleError}
              </p>
            )}
            {scheduledEntry && (
              <p className="cmd-form-success" role="status">
                Synthetic run scheduled for{" "}
                <time dateTime={scheduledEntry.runAfter}>
                  {new Date(scheduledEntry.runAfter).toLocaleString()}
                </time>
                . <a href="/overnight">Review Overnight Queue</a>
              </p>
            )}
          </section>
          <LocalMcpAccess packet={packet} agentId={selectedAgentId} />
        </>
      )}
    </AppShell>
  );
}
