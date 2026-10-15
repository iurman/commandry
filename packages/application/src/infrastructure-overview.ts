import type {
  InfrastructureOverview,
  InfrastructureOverviewQuery,
  InfrastructureResource,
  InfrastructureSource,
} from "@commandry/contracts";
import { classifyObservationFreshness } from "@commandry/domain";

export type InfrastructureSnapshot = Omit<
  InfrastructureOverview,
  "readAt" | "items"
> & {
  items: Omit<InfrastructureResource, "telemetry" | "health">[];
};
export interface InfrastructureOverviewRepository {
  read(query: InfrastructureOverviewQuery): Promise<InfrastructureSnapshot>;
}

// Telemetry describes the source, never the availability of its host's services.
// A failing or missing source must not be masked by a different reporting source.
export function infrastructureTelemetry(
  sources: InfrastructureSource[],
  now: Date,
): InfrastructureResource["telemetry"] {
  if (!sources.length) return "unknown";
  const active = sources.filter((source) => source.enabled);
  if (!active.length) return "disabled";
  if (active.some((source) => source.error)) return "error";
  const freshness = active.map((source) =>
    classifyObservationFreshness(
      source.observedAt ? new Date(source.observedAt) : null,
      source.freshnessWindowMinutes,
      now,
    ),
  );
  if (freshness.includes("future")) return "future";
  if (freshness.includes("stale")) return "stale";
  if (freshness.includes("unknown")) return "unknown";
  return "reporting";
}
export function createInfrastructureOverviewService(
  repository: InfrastructureOverviewRepository,
  clock = () => new Date(),
) {
  return {
    async read(
      query: InfrastructureOverviewQuery,
    ): Promise<InfrastructureOverview> {
      const snapshot = await repository.read(query);
      const now = clock();
      return {
        ...snapshot,
        readAt: now.toISOString(),
        items: snapshot.items.map((item) => ({
          ...item,
          telemetry: infrastructureTelemetry(item.sources, now),
          health: "unknown",
        })),
      };
    },
  };
}
