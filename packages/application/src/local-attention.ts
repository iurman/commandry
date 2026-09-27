import type {
  LocalAttentionAuditEvent,
  LocalAttentionSettings,
  LocalAttentionSignal,
  UpdateLocalAttentionSettingsRequest,
} from "@commandry/contracts";
import {
  metricDropSignal,
  sourceStalenessSignal,
  type DesiredLocalAttentionSignal,
  type MetricPair,
  type SourceObservation,
} from "@commandry/domain";

type PageQuery = { limit: number; cursor?: string | undefined };

export interface LocalAttentionPort {
  getSettings(): Promise<LocalAttentionSettings>;
  updateSettings(
    input: UpdateLocalAttentionSettingsRequest,
  ): Promise<LocalAttentionSettings>;
  scanSources(): Promise<SourceObservation[]>;
  scanMetricPairs(): Promise<MetricPair[]>;
  reconcile(
    desired: DesiredLocalAttentionSignal[],
    at: Date,
  ): Promise<{ activated: number; resolved: number }>;
  listSignals(
    query: PageQuery & {
      view: "active" | "all";
      projectId?: string | undefined;
    },
  ): Promise<{ items: LocalAttentionSignal[]; nextCursor: string | null }>;
  listAudit(
    query: PageQuery,
  ): Promise<{ items: LocalAttentionAuditEvent[]; nextCursor: string | null }>;
}

export function createLocalAttentionService(port: LocalAttentionPort) {
  return {
    getSettings: port.getSettings,
    updateSettings: port.updateSettings,
    listSignals: port.listSignals,
    listAudit: port.listAudit,
    async evaluate(asOf = new Date()) {
      const settings = await port.getSettings();
      const [sources, metrics] = await Promise.all([
        settings.staleSourceEnabled ? port.scanSources() : [],
        settings.metricDropEnabled ? port.scanMetricPairs() : [],
      ]);
      const desired = [
        ...sources.map((source) => sourceStalenessSignal(source, asOf)),
        ...metrics.map((metric) =>
          metricDropSignal(metric, settings.metricDropPoints, asOf),
        ),
      ].filter((item): item is DesiredLocalAttentionSignal => item !== null);
      return port.reconcile(desired, asOf);
    },
  };
}
