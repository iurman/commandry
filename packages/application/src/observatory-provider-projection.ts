import {
  observatoryProviderNoticeSchema,
  observatoryPublicProviderSnapshotSchema,
} from "@commandry/contracts";
import type {
  ObservatoryProviderNotice,
  ObservatoryProviderFeedState,
} from "@commandry/domain";

/** Structured provider data supplies component membership, not geography, plane,
 * local health or the owner's account topology. Those absent axes stay unknown. */
export function projectObservatoryProviderNotices(
  providerResourceId: string,
  rawSnapshot: unknown,
  feedState: ObservatoryProviderFeedState = "unknown",
): ObservatoryProviderNotice[] {
  const snapshot = observatoryPublicProviderSnapshotSchema.parse(rawSnapshot);
  return snapshot.notices.map((notice) =>
    observatoryProviderNoticeSchema.parse({
      id: `cloudflare:${providerResourceId}:${notice.id}`,
      updateId: notice.updates.at(-1)?.id ?? notice.id,
      providerId: providerResourceId,
      componentIds: notice.componentIds,
      product: null,
      environment: null,
      geography: null,
      plane: null,
      severity: ["minor", "major", "critical"].includes(notice.severity)
        ? notice.severity
        : "unknown",
      status: ["resolved", "postmortem", "completed"].includes(notice.status)
        ? "resolved"
        : notice.kind === "maintenance"
          ? "maintenance"
          : notice.status === "monitoring"
            ? "monitoring"
            : ["investigating", "identified"].includes(notice.status)
              ? "open"
              : "unknown",
      confidence: "reported",
      feedState,
      sourceId: "provider-feed:cloudflare",
      observedAt: notice.updatedAt,
      freshnessMs: 600000,
      evidenceRefs: [notice.evidenceHref],
    }),
  );
}
