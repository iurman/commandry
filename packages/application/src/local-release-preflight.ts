import {
  localReleasePreflightSchema,
  type LocalReleasePreflight,
} from "@commandry/contracts";

export interface LocalReleasePreflightPort {
  getById(id: string): Promise<LocalReleasePreflight | null>;
  list(query: {
    limit: number;
    cursor?: string | undefined;
  }): Promise<{ items: LocalReleasePreflight[]; nextCursor: string | null }>;
}

export function createLocalReleasePreflightService(
  port: LocalReleasePreflightPort,
) {
  return {
    async get(id: string) {
      const record = await port.getById(id);
      return record ? localReleasePreflightSchema.parse(record) : null;
    },
    async list(query: { limit: number; cursor?: string | undefined }) {
      const page = await port.list(query);
      return {
        items: page.items.map((item) =>
          localReleasePreflightSchema.parse(item),
        ),
        nextCursor: page.nextCursor,
      };
    },
  };
}
