import {
  localBackupEvidenceSchema,
  type LocalBackupEvidence,
} from "@commandry/contracts";

export interface LocalBackupPort {
  getById(id: string): Promise<LocalBackupEvidence | null>;
  list(query: {
    limit: number;
    cursor?: string | undefined;
  }): Promise<{ items: LocalBackupEvidence[]; nextCursor: string | null }>;
}

export function createLocalBackupService(port: LocalBackupPort) {
  return {
    async get(id: string) {
      const record = await port.getById(id);
      return record ? localBackupEvidenceSchema.parse(record) : null;
    },
    async list(query: { limit: number; cursor?: string | undefined }) {
      const page = await port.list(query);
      return {
        items: page.items.map((item) => localBackupEvidenceSchema.parse(item)),
        nextCursor: page.nextCursor,
      };
    },
  };
}
