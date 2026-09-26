import type { MorningDigestItem } from "@commandry/contracts";
import {
  morningDigestCursor,
  morningDigestOutcome,
  morningDigestWindow,
  parseMorningDigestCursor,
  type MorningRunKind,
  type MorningRunState,
} from "@commandry/domain";

type Candidate = {
  kind: MorningRunKind;
  id: string;
  projectId: string;
  title: string;
  actorLabel: string;
  state: MorningRunState;
  completedAt: Date;
  summary: string | null;
  firstEvidenceHref: string | null;
  definitionId: string | null;
  sourceEventId: string | null;
  packetId: string | null;
};

export interface MorningDigestPort {
  listCompletedRuns(query: {
    from: Date;
    to: Date;
    limit: number;
    projectId?: string | undefined;
    cursor: ReturnType<typeof parseMorningDigestCursor>;
  }): Promise<{ items: Candidate[]; hasMore: boolean }>;
}

function digestItem(row: Candidate): MorningDigestItem {
  return {
    id: row.id,
    kind: row.kind,
    projectId: row.projectId,
    title: row.title,
    actorLabel: row.actorLabel,
    state: row.state,
    outcome: morningDigestOutcome(row.state),
    summary:
      row.summary ||
      "No detailed outcome was recorded. Open the run for its attempts and audit.",
    completedAt: row.completedAt.toISOString(),
    href:
      row.kind === "automation"
        ? `/automations/${row.definitionId}`
        : `/agent-runs/${row.id}`,
    evidenceHref:
      row.kind === "automation"
        ? `/api/v1/automation-runs/${row.id}`
        : `/api/v1/agent-runs/${row.id}`,
    sourceEvidenceHref:
      row.kind === "automation"
        ? row.sourceEventId
          ? `/api/v1/events/${row.sourceEventId}`
          : row.firstEvidenceHref
        : `/api/v1/execution-packets/${row.packetId}`,
    sourceLabel:
      row.kind === "automation"
        ? "Synthetic local automation"
        : "Synthetic local agent",
    isSynthetic: true,
    verificationStatus: "unverified",
  };
}

export function createMorningDigestService(port: MorningDigestPort) {
  return {
    async list(input: {
      from: string;
      to: string;
      projectId?: string | undefined;
      limit: number;
      cursor?: string | undefined;
    }) {
      const window = morningDigestWindow(input.from, input.to);
      const page = await port.listCompletedRuns({
        ...window,
        projectId: input.projectId,
        limit: input.limit,
        cursor: parseMorningDigestCursor(input.cursor),
      });
      const last = page.items.at(-1);
      return {
        from: window.from.toISOString(),
        to: window.to.toISOString(),
        items: page.items.map(digestItem),
        nextCursor:
          page.hasMore && last
            ? morningDigestCursor({
                completedAt: last.completedAt,
                kind: last.kind,
                id: last.id,
              })
            : null,
      };
    },
  };
}
