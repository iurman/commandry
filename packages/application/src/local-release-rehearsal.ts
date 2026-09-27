import {
  localReleaseRehearsalSchema,
  type LocalReleaseRehearsal,
} from "@commandry/contracts";

export interface LocalReleaseRehearsalPort {
  getById(id: string): Promise<LocalReleaseRehearsal | null>;
  list(query: {
    limit: number;
    cursor?: string | undefined;
  }): Promise<{ items: LocalReleaseRehearsal[]; nextCursor: string | null }>;
}

export function createLocalReleaseRehearsalService(
  port: LocalReleaseRehearsalPort,
) {
  return {
    async get(id: string) {
      const record = await port.getById(id);
      return record ? localReleaseRehearsalSchema.parse(record) : null;
    },
    async list(query: { limit: number; cursor?: string | undefined }) {
      const page = await port.list(query);
      return {
        items: page.items.map((item) =>
          localReleaseRehearsalSchema.parse(item),
        ),
        nextCursor: page.nextCursor,
      };
    },
  };
}
