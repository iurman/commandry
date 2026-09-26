"use client";

import { useEffect, useState } from "react";
import type { ExecutionPacket as ExecutionPacketRecord } from "@commandry/contracts";
import { AppShell, ExecutionPacket } from "@commandry/ui";
import { apiJson } from "../../projects/api";

export default function ExecutionPacketWorkspace({
  packetId,
}: {
  packetId: string;
}) {
  const [packet, setPacket] = useState<ExecutionPacketRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiJson<ExecutionPacketRecord>(
      `/api/v1/execution-packets/${encodeURIComponent(packetId)}`,
    )
      .then((record) => {
        if (active) setPacket(record);
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
      {packet && <ExecutionPacket packet={packet} />}
    </AppShell>
  );
}
