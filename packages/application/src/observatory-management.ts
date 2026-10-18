import {
  observatoryAnnotationChangeSchema,
  observatoryRelationChangeSchema,
  observatoryProviderMappingChangeSchema,
  observatoryClientScopeChangeSchema,
  observatorySourceBindingChangeSchema,
  type ObservatoryAnnotationChange,
  type ObservatoryRelationChange,
  type ObservatoryProviderMappingChange,
  type ObservatorySourceBindingChange,
  type ObservatoryClientScopeChange,
} from "@commandry/contracts";
export const OBSERVATORY_REVIEW_POLICIES = Object.freeze({
  annotation: {
    scope: "resource",
    risk: "reversible",
    capability: "owner",
    approval: "owner_only",
    auditEvent: "observatory.annotation.review",
    concurrency: "expected_version",
  },
  relation: {
    scope: "resource_pair",
    risk: "reversible",
    capability: "owner",
    approval: "owner_only",
    auditEvent: "observatory.relation.review",
    concurrency: "expected_version",
  },
  provider: {
    scope: "resource_provider",
    risk: "reversible",
    capability: "owner",
    approval: "owner_only",
    auditEvent: "observatory.provider_mapping.review",
    concurrency: "expected_version",
  },
  source: {
    scope: "resource",
    risk: "sensitive",
    capability: "owner",
    approval: "owner_only",
    auditEvent: "observatory.source.review",
    concurrency: "expected_version",
  },
  client_scope: {
    scope: "client_project",
    risk: "sensitive",
    capability: "owner",
    approval: "owner_only",
    auditEvent: "observatory.client_scope.review",
    concurrency: "expected_version",
  },
  logo: {
    scope: "resource",
    risk: "reversible",
    capability: "owner",
    approval: "owner_only",
    auditEvent: "observatory.logo.review",
    concurrency: "expected_version",
  },
  /** Writes nothing, but may read one owner-named file from api.github.com. */
  logo_preview: {
    scope: "resource",
    risk: "read_only",
    capability: "owner",
    approval: "owner_session",
    auditEvent: "observatory.logo.preview",
    concurrency: "none",
  },
});
const schemas = {
  annotation: observatoryAnnotationChangeSchema,
  relation: observatoryRelationChangeSchema,
  provider: observatoryProviderMappingChangeSchema,
  source: observatorySourceBindingChangeSchema,
  client_scope: observatoryClientScopeChangeSchema,
};
export type ObservatoryReviewKind = keyof typeof schemas;
type ReviewValues = {
  annotation: ObservatoryAnnotationChange;
  relation: ObservatoryRelationChange;
  provider: ObservatoryProviderMappingChange;
  source: ObservatorySourceBindingChange;
  client_scope: ObservatoryClientScopeChange;
};
export type ObservatoryReviewedChange = {
  [K in ObservatoryReviewKind]: { kind: K; value: ReviewValues[K] };
}[ObservatoryReviewKind];
export type ObservatoryOwnerIdentity = {
  principalId: string;
  sessionId: string;
  expiresAt: string;
};
export interface ObservatoryManagementPort {
  review(
    owner: ObservatoryOwnerIdentity,
    change: ObservatoryReviewedChange,
  ): Promise<{ id: string; version: number; auditId: string }>;
}
/** The HTTP boundary establishes a real owner session. The repository holds that
 * session row through the versioned mutation and its audit. JSON cannot assert it. */
export function createObservatoryManagementService(
  port: ObservatoryManagementPort,
) {
  return {
    review<K extends ObservatoryReviewKind>(
      owner: ObservatoryOwnerIdentity,
      kind: K,
      input: unknown,
    ) {
      const value = schemas[kind].parse(input);
      return port.review(owner, { kind, value } as ObservatoryReviewedChange);
    },
  };
}
