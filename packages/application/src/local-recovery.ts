import type { LocalRecoveryDrill } from "@commandry/contracts";
import { assessLocalRecovery } from "@commandry/domain";

export interface LocalRecoveryPort {
  latest(): Promise<LocalRecoveryDrill | null>;
  getById(id: string): Promise<LocalRecoveryDrill | null>;
  list(query: {
    limit: number;
    cursor?: string | undefined;
  }): Promise<{ items: LocalRecoveryDrill[]; nextCursor: string | null }>;
}

export function createLocalRecoveryService(port: LocalRecoveryPort) {
  return {
    getDrill: port.getById,
    listDrills: port.list,
    async getStatus() {
      return assessLocalRecovery(await port.latest());
    },
  };
}
