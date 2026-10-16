import {
  infrastructureOverviewSchema,
  type InfrastructureOverview,
} from "@commandry/contracts";

/** Collects a live authorized scope before a caller replaces its complete scene. */
export async function loadInfrastructureScene(
  fetchPage: (
    cursor: string | null,
    signal: AbortSignal,
  ) => Promise<InfrastructureOverview>,
  signal: AbortSignal,
  onProgress?: (progress: { loaded: number; total: number }) => void,
): Promise<InfrastructureOverview> {
  const items: InfrastructureOverview["items"] = [];
  const resourceIds = new Set<string>();
  const cursors = new Set<string>();
  const edges = new Map<string, InfrastructureOverview["edges"][number]>();
  const events = new Map<string, InfrastructureOverview["events"][number]>();
  let cursor: string | null = null;
  let total: number | undefined;
  let readAt = "";

  while (true) {
    signal.throwIfAborted();
    let response: InfrastructureOverview;
    try {
      response = await fetchPage(cursor, signal);
    } catch (error) {
      signal.throwIfAborted();
      throw error;
    }
    signal.throwIfAborted();
    // Parsing also copies nested records so later input mutation cannot alter a scene.
    const page = infrastructureOverviewSchema.parse(response);
    if (total !== undefined && page.total !== total) {
      throw new Error("Infrastructure population changed during collection");
    }
    total = page.total;
    if (page.nextCursor !== null && page.items.length === 0) {
      throw new Error("Infrastructure continuation returned an empty page");
    }
    if (page.nextCursor !== null && cursors.has(page.nextCursor)) {
      throw new Error(
        "Infrastructure continuation repeated or did not advance",
      );
    }
    for (const resource of page.items) {
      if (resourceIds.has(resource.id)) {
        throw new Error(
          "Infrastructure resource identity appeared more than once",
        );
      }
      resourceIds.add(resource.id);
      items.push(resource);
    }
    if (
      items.length > total ||
      (page.nextCursor !== null && items.length >= total) ||
      (page.nextCursor === null && items.length !== total)
    ) {
      throw new Error("Infrastructure population does not match its total");
    }
    for (const edge of page.edges) {
      const previous = edges.get(edge.id);
      if (
        previous &&
        (previous.from !== edge.from ||
          previous.to !== edge.to ||
          previous.type !== edge.type)
      ) {
        throw new Error(
          "Infrastructure relationship identity has conflicting records",
        );
      }
      edges.set(edge.id, edge);
    }
    for (const event of page.events) {
      if (!events.has(event.id)) events.set(event.id, event);
    }
    // Pages are live reads; the earliest server read time marks the beginning of this aggregation.
    if (readAt === "" || Date.parse(page.readAt) < Date.parse(readAt)) {
      readAt = page.readAt;
    }
    signal.throwIfAborted();
    onProgress?.({ loaded: items.length, total });
    signal.throwIfAborted();
    if (page.nextCursor === null) break;
    cursor = page.nextCursor;
    cursors.add(cursor);
  }

  const recentEvents = [...events.values()]
    .sort((left, right) => {
      const byTime = Date.parse(right.occurredAt) - Date.parse(left.occurredAt);
      if (byTime !== 0) return byTime;
      return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
    })
    .slice(0, 8);
  signal.throwIfAborted();
  return {
    readAt,
    total: items.length,
    items,
    nextCursor: null,
    edges: [...edges.values()],
    events: recentEvents,
  };
}
