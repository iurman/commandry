import {
  syntheticFlowReplaySchema,
  type SyntheticFlowReplay,
} from "@commandry/contracts";
import {
  buildSyntheticFlowReplay,
  type SyntheticReplayInput,
} from "@commandry/domain";

export interface SyntheticFlowReplayPort {
  read(
    importId: string,
    query: { limit: number; cursor?: string | undefined },
  ): Promise<SyntheticReplayInput | null>;
}

export function createSyntheticFlowReplayService(
  port: SyntheticFlowReplayPort,
) {
  return {
    async get(
      importId: string,
      query: { limit: number; cursor?: string | undefined },
    ): Promise<SyntheticFlowReplay | null> {
      const chain = await port.read(importId, query);
      return chain
        ? syntheticFlowReplaySchema.parse(
            buildSyntheticFlowReplay(chain, new Date().toISOString()),
          )
        : null;
    },
  };
}
