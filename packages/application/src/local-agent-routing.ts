import {
  cachedLocalAgentResultResponseSchema,
  fakeLocalAgentRunResultSchema,
  localAgentRoutingResponseSchema,
  type CachedLocalAgentResultResponse,
  type LocalAgentProfile,
  type LocalAgentRoutingResponse,
} from "@commandry/contracts";
import { LocalAgentError } from "@commandry/domain";

type PacketScope = {
  id: string;
  contentDigest: string;
  projectId: string;
};

export interface LocalAgentRoutingPort {
  getPacketById(id: string): Promise<PacketScope | null>;
  listAssignedCandidates(
    projectId: string,
    query: { limit: number; cursor?: string | undefined },
  ): Promise<{
    items: { agent: LocalAgentProfile; activeRunCount: number }[];
    nextCursor: string | null;
  }>;
  isAssigned(agentId: string, projectId: string): Promise<boolean>;
  getLatestSucceededResult(input: {
    packetId: string;
    packetDigest: string;
    agentId: string;
  }): Promise<{
    id: string;
    completedAt: string;
    result: unknown;
  } | null>;
}

export function createLocalAgentRoutingService(port: LocalAgentRoutingPort) {
  async function requirePacket(packetId: string): Promise<PacketScope> {
    const packet = await port.getPacketById(packetId);
    if (!packet)
      throw new LocalAgentError(
        "PACKET_NOT_FOUND",
        "Execution packet not found",
      );
    return packet;
  }

  return {
    async listCandidates(
      packetId: string,
      query: { limit: number; cursor?: string | undefined },
    ): Promise<LocalAgentRoutingResponse> {
      const packet = await requirePacket(packetId);
      const page = await port.listAssignedCandidates(packet.projectId, query);
      return localAgentRoutingResponseSchema.parse({
        packetId: packet.id,
        packetDigest: packet.contentDigest,
        projectId: packet.projectId,
        items: page.items.map(({ agent, activeRunCount }) => ({
          agent,
          activeRunCount,
          reason: "Assigned to this packet's project for scoped reads",
          readOperations: ["project.brief.read", "work.read"],
        })),
        nextCursor: page.nextCursor,
        dispatchMode: "manual-fake-only",
        unassessed: ["skills", "budget", "provider capacity"],
        sourceLabel: "Synthetic local routing preview",
        isSynthetic: true,
      });
    },
    async getCachedResult(
      packetId: string,
      query: { agentId: string; limit: number; cursor?: number | undefined },
    ): Promise<CachedLocalAgentResultResponse> {
      const packet = await requirePacket(packetId);
      if (!(await port.isAssigned(query.agentId, packet.projectId))) {
        throw new LocalAgentError(
          "AGENT_NOT_ASSIGNED",
          "Local agent is not assigned to the packet project",
        );
      }
      const saved = await port.getLatestSucceededResult({
        packetId: packet.id,
        packetDigest: packet.contentDigest,
        agentId: query.agentId,
      });
      if (!saved)
        return cachedLocalAgentResultResponseSchema.parse({
          result: null,
          items: [],
          nextCursor: null,
        });
      const result = fakeLocalAgentRunResultSchema.parse(saved.result);
      const offset = query.cursor ?? 0;
      if (offset > result.evidence.length)
        throw new LocalAgentError(
          "INVALID_CACHE_CURSOR",
          "Cached evidence cursor is outside this saved result",
        );
      const items = result.evidence.slice(offset, offset + query.limit);
      return cachedLocalAgentResultResponseSchema.parse({
        result: {
          runId: saved.id,
          agentId: query.agentId,
          packetId: packet.id,
          packetDigest: packet.contentDigest,
          completedAt: saved.completedAt,
          summary: result.summary,
          contextReadIds: result.contextReadIds,
          verificationStatus: "unverified",
          sourceLabel: "Saved synthetic local fake-run result",
          isSynthetic: true,
        },
        items,
        nextCursor:
          offset + items.length < result.evidence.length
            ? offset + items.length
            : null,
      });
    },
  };
}
