"use client";

import { useEffect, useState } from "react";
import type { ExecutionPacket as ExecutionPacketRecord } from "@commandry/contracts";
import {
  AppShell,
  Button,
  ExecutionPacket,
  type LocalAgentAssignmentView,
  type LocalAgentProfileView,
  type LocalAgentRunView,
} from "@commandry/ui";
import { apiJson, pagePath, type PageResponse } from "../../projects/api";

interface AgentChoice {
  agent: LocalAgentProfileView;
  eligible: boolean;
}

async function isAssigned(agentId: string, projectId: string) {
  let cursor: string | null = null;
  do {
    const page: PageResponse<LocalAgentAssignmentView> = await apiJson(
      pagePath(
        `/api/v1/agents/${encodeURIComponent(agentId)}/projects`,
        cursor,
      ),
    );
    if (page.items.some((assignment) => assignment.projectId === projectId))
      return true;
    cursor = page.nextCursor;
  } while (cursor);
  return false;
}

export default function ExecutionPacketWorkspace({
  packetId,
}: {
  packetId: string;
}) {
  const [packet, setPacket] = useState<ExecutionPacketRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agents, setAgents] = useState<AgentChoice[]>([]);
  const [agentCursor, setAgentCursor] = useState<string | null>(null);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [agentsError, setAgentsError] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [startedRun, setStartedRun] = useState<LocalAgentRunView | null>(null);

  async function loadAgents(projectId: string, cursor?: string | null) {
    setAgentsLoading(true);
    setAgentsError(null);
    try {
      const page = await apiJson<PageResponse<LocalAgentProfileView>>(
        pagePath("/api/v1/agents", cursor),
      );
      const choices = await Promise.all(
        page.items.map(async (agent) => ({
          agent,
          eligible: await isAssigned(agent.id, projectId),
        })),
      );
      setAgents((current) =>
        cursor
          ? [
              ...current,
              ...choices.filter(
                (choice) =>
                  !current.some((saved) => saved.agent.id === choice.agent.id),
              ),
            ]
          : choices,
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
          void loadAgents(record.projectId);
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
                No local agents exist yet.{" "}
                <a href="/agents">
                  Create a synthetic agent and assign this project.
                </a>
              </p>
            )}
            {!agentsLoading &&
              agents.length > 0 &&
              !agents.some((choice) => choice.eligible) && (
                <p>
                  No agents in the loaded page are assigned to this project.{" "}
                  <a href="/agents">Assign this project to a local agent.</a>
                </p>
              )}
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
                  onChange={(event) => setSelectedAgentId(event.target.value)}
                >
                  <option value="">Choose an eligible local agent</option>
                  {agents.map(({ agent, eligible }) => (
                    <option
                      key={agent.id}
                      value={agent.id}
                      disabled={!eligible}
                    >
                      {agent.name}
                      {eligible
                        ? " / project-scoped read"
                        : " / not assigned to this project"}
                    </option>
                  ))}
                </select>
                <p className="cmd-form-hint">
                  {agents.filter((choice) => choice.eligible).length} eligible
                  among {agents.length} shown. Ineligible profiles cannot start
                  this packet.
                </p>
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
                onClick={() => void loadAgents(packet.projectId, agentCursor)}
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
          </section>
        </>
      )}
    </AppShell>
  );
}
