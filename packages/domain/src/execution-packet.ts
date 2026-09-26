export const EXECUTION_PACKET_SCHEMA_VERSION = "execution-packet/v1" as const;
export const MAX_SELECTED_PACKET_RECORDS = 10;

export class ExecutionPacketError extends Error {
  constructor(
    public readonly code:
      | "WORK_ITEM_NOT_FOUND"
      | "KNOWLEDGE_NOT_IN_PROJECT"
      | "RESOURCE_NOT_IN_PROJECT"
      | "INVALID_SELECTION",
    message: string,
  ) {
    super(message);
    this.name = "ExecutionPacketError";
  }
}

export function validatePacketSelection(
  knowledgeIds: readonly string[],
  resourceIds: readonly string[],
): void {
  for (const ids of [knowledgeIds, resourceIds]) {
    if (
      ids.length > MAX_SELECTED_PACKET_RECORDS ||
      new Set(ids).size !== ids.length
    ) {
      throw new ExecutionPacketError(
        "INVALID_SELECTION",
        `Select up to ${MAX_SELECTED_PACKET_RECORDS} distinct records of each kind`,
      );
    }
  }
}

/** Canonical JSON keeps the digest independent of object-key insertion order. */
export function canonicalPacketJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalPacketJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map(
        (key) => `${JSON.stringify(key)}:${canonicalPacketJson(record[key])}`,
      )
      .join(",")}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) {
    throw new ExecutionPacketError(
      "INVALID_SELECTION",
      "Packet content is not JSON serializable",
    );
  }
  return encoded;
}
