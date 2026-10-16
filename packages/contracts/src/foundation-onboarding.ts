import { z } from "zod";
import { foundationActorSchema } from "./agent-foundation";
import {
  projectResourceRelationshipTypeSchema,
  resourceSummarySchema,
} from "./resources";

export const FOUNDATION_ONBOARDING_MAX_INPUT_BYTES = 131072;

const schemaVersion = z.literal(1);
const identity = foundationActorSchema.shape.projectId;
const datetime = foundationActorSchema.shape.expiresAt;
const environment = foundationActorSchema.shape.environment;
const instantParts = (value: string) => ({
  wholeMilliseconds: Date.parse(value.replace(/\.\d+/, "")),
  fraction: value.match(/\.(\d+)/)?.[1] ?? "",
});
const isLaterUtcInstant = (later: string, earlier: string) => {
  // Preserve arbitrary ISO fractions separately from Date's millisecond precision.
  const left = instantParts(later);
  const right = instantParts(earlier);
  if (left.wholeMilliseconds !== right.wholeMilliseconds) {
    return left.wholeMilliseconds > right.wholeMilliseconds;
  }
  const precision = Math.max(left.fraction.length, right.fraction.length);
  return (
    left.fraction.padEnd(precision, "0") > right.fraction.padEnd(precision, "0")
  );
};
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const positiveInteger = z.number().int().positive();
const nonnegativeInteger = z.number().int().nonnegative();
const validText = (value: string) => {
  if (value.includes("\0")) return false;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    }
  }
  return true;
};
const text = (maximum?: number) => {
  const schema = z.string().min(1);
  return (maximum === undefined ? schema : schema.max(maximum))
    .refine((value) => value.trim().length > 0, "Must not be blank")
    .refine(validText, "Must contain valid Unicode without NUL");
};
// A bounded authority grammar is shared with the onboarding SQL guard. IDN
// authorities are deferred; Unicode paths remain valid and original bytes survive.
const safeUrl = z.string().refine((value) => {
  if (!validText(value) || /[\u0000-\u0020\u007f\\]/.test(value)) return false;
  const parts =
    /^https?:\/\/(\[[0-9a-f:.]+\]|[a-z0-9.-]+)(?::([0-9]{1,5}))?(?:[/?#][\s\S]*)?$/i.exec(
      value,
    );
  if (!parts || (parts[2] !== undefined && Number(parts[2]) > 65535))
    return false;
  const host = parts[1]!.toLowerCase();
  if (!host.startsWith("[")) {
    const dns = host.endsWith(".") ? host.slice(0, -1) : host;
    const labels = dns.split(".");
    if (
      dns.length > 253 ||
      labels.some(
        (label) =>
          !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label) ||
          label.startsWith("xn--"),
      )
    )
      return false;
    const last = labels.at(-1)!;
    if (
      /^(?:[0-9]+|0x[0-9a-f]*)$/.test(last) &&
      !(
        labels.length === 4 &&
        labels.every(
          (label) =>
            /^(?:0|[1-9][0-9]{0,2})$/.test(label) && Number(label) <= 255,
        )
      )
    )
      return false;
  }
  try {
    const url = new URL(value);
    return url.username === "" && url.password === "";
  } catch {
    return false;
  }
}, "Must be an HTTP(S) URL with an ASCII DNS, IPv4 or bracketed IPv6 authority, valid port and no userinfo");
const userPrincipal = text(500).refine(
  (value) => value.startsWith("user:") && value.slice(5).trim().length > 0,
  "Must be a user principal",
);
const resourceSnapshotSchema = z.strictObject({
  ...resourceSummarySchema.shape,
  id: identity,
  kind: text(),
  name: text(),
  subtype: text().nullable(),
  parentResourceId: identity.nullable(),
  state: text().nullable(),
  externalUrl: safeUrl.nullable(),
  lastObservedAt: datetime.nullable(),
});
const decisionValue = z.enum(["approved", "rejected", "revoked"]);

export const foundationHostIdentitySchema = z.strictObject({
  namespace: z.enum(["provider", "tailscale"]),
  authority: text(200),
  externalId: text(500),
  assurance: z.literal("owner_asserted"),
});
export type FoundationHostIdentity = z.infer<
  typeof foundationHostIdentitySchema
>;

export const foundationOnboardingTargetSchema = z.discriminatedUnion("mode", [
  z.strictObject({ mode: z.literal("reuse"), resourceId: identity }),
  z.strictObject({
    mode: z.literal("create"),
    name: text(200),
    subtype: text(100).nullable(),
    externalUrl: safeUrl.nullable(),
    identity: foundationHostIdentitySchema,
  }),
]);
export type FoundationOnboardingTarget = z.infer<
  typeof foundationOnboardingTargetSchema
>;

export const foundationOnboardingToolInputSchema = z.strictObject({
  target: foundationOnboardingTargetSchema,
  relationship: projectResourceRelationshipTypeSchema,
  rationale: text(4000),
  evidenceIds: z
    .array(identity)
    .max(100)
    .refine(
      (values) => new Set(values).size === values.length,
      "Duplicate evidence identity",
    ),
});
export type FoundationOnboardingToolInput = z.infer<
  typeof foundationOnboardingToolInputSchema
>;

export const foundationOnboardingInputSchema = z.strictObject({
  ...foundationOnboardingToolInputSchema.shape,
  projectId: identity,
});
export type FoundationOnboardingInput = z.infer<
  typeof foundationOnboardingInputSchema
>;

export const foundationOnboardingProposalSchema = z.strictObject({
  ...foundationOnboardingInputSchema.shape,
  schemaVersion,
  id: identity,
  version: z.literal(1),
  environment,
  recordedBy: text(500),
  recordedAt: datetime,
  contentDigest: digest,
});
export type FoundationOnboardingProposal = z.infer<
  typeof foundationOnboardingProposalSchema
>;

export const foundationOnboardingLinkSnapshotSchema = z.strictObject({
  id: identity,
  projectId: identity,
  resourceId: identity,
  type: projectResourceRelationshipTypeSchema,
  lifecycle: z.enum(["active", "archived"]),
});
export type FoundationOnboardingLinkSnapshot = z.infer<
  typeof foundationOnboardingLinkSnapshotSchema
>;

export const foundationOnboardingPreconditionsSchema = z
  .strictObject({
    resource: resourceSnapshotSchema.nullable(),
    link: foundationOnboardingLinkSnapshotSchema.nullable(),
    identityResourceId: identity.nullable(),
  })
  .superRefine((value, context) => {
    const resourceIds = [
      value.resource?.id,
      value.link?.resourceId,
      value.identityResourceId,
    ].filter((id) => id !== undefined && id !== null);
    if (new Set(resourceIds).size > 1) {
      context.addIssue({
        code: "custom",
        message:
          "Available resource, link and identity must refer to one resource",
      });
    }
  });
export type FoundationOnboardingPreconditions = z.infer<
  typeof foundationOnboardingPreconditionsSchema
>;

export const foundationOnboardingPreviewSchema = z
  .strictObject({
    schemaVersion,
    projectId: identity,
    proposalId: identity,
    proposalDigest: digest,
    evaluatedAt: datetime,
    preconditions: foundationOnboardingPreconditionsSchema,
    preconditionsDigest: digest,
    previewDigest: digest,
    blockers: z
      .array(
        z.enum([
          "resource_unavailable",
          "resource_not_host",
          "archived_connection",
          "identity_conflict",
          "identity_unresolved",
          "source_unavailable",
        ]),
      )
      .refine(
        (values) => new Set(values).size === values.length,
        "Duplicate blocker",
      ),
    canApply: z.boolean(),
  })
  .superRefine((value, context) => {
    if (value.canApply !== (value.blockers.length === 0)) {
      context.addIssue({
        code: "custom",
        path: ["canApply"],
        message: "Apply eligibility must agree with the blockers",
      });
    }
    if (
      value.preconditions.link &&
      value.preconditions.link.projectId !== value.projectId
    ) {
      context.addIssue({
        code: "custom",
        path: ["preconditions", "link", "projectId"],
        message: "Link must belong to the preview project",
      });
    }
  });
export type FoundationOnboardingPreview = z.infer<
  typeof foundationOnboardingPreviewSchema
>;

export const foundationOnboardingReviewInputSchema = z
  .strictObject({
    projectId: identity,
    proposalId: identity,
    expectedProposalDigest: digest,
    expectedPreviewDigest: digest,
    expectedDecisionVersion: nonnegativeInteger,
    decision: decisionValue,
    reason: text(4000),
    expiresAt: datetime,
    inventoryReviewed: z.boolean(),
  })
  .superRefine((value, context) => {
    if (value.decision === "approved" && !value.inventoryReviewed) {
      context.addIssue({
        code: "custom",
        path: ["inventoryReviewed"],
        message: "Approval requires inventory review acknowledgement",
      });
    }
  });
export type FoundationOnboardingReviewInput = z.infer<
  typeof foundationOnboardingReviewInputSchema
>;

export const foundationOnboardingDecisionSchema = z
  .strictObject({
    ...foundationOnboardingReviewInputSchema.shape,
    schemaVersion,
    id: identity,
    version: positiveInteger,
    recordedBy: userPrincipal,
    recordedAt: datetime,
    contentDigest: digest,
    preconditions: foundationOnboardingPreconditionsSchema,
  })
  .superRefine((value, context) => {
    if (value.decision === "approved" && !value.inventoryReviewed) {
      context.addIssue({
        code: "custom",
        path: ["inventoryReviewed"],
        message: "Approval requires inventory review acknowledgement",
      });
    }
    if (value.version !== value.expectedDecisionVersion + 1) {
      context.addIssue({
        code: "custom",
        path: ["version"],
        message: "Decision version must advance the expected version by one",
      });
    }
    if (!isLaterUtcInstant(value.expiresAt, value.recordedAt)) {
      context.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "Decision must expire after it was recorded",
      });
    }
    if (
      value.preconditions.link &&
      value.preconditions.link.projectId !== value.projectId
    ) {
      context.addIssue({
        code: "custom",
        path: ["preconditions", "link", "projectId"],
        message: "Link must belong to the decision project",
      });
    }
  });
export type FoundationOnboardingDecision = z.infer<
  typeof foundationOnboardingDecisionSchema
>;

export const foundationOnboardingApplyInputSchema = z.strictObject({
  projectId: identity,
  proposalId: identity,
  expectedProposalDigest: digest,
  decisionId: identity,
  expectedDecisionVersion: positiveInteger,
  expectedDecisionDigest: digest,
});
export type FoundationOnboardingApplyInput = z.infer<
  typeof foundationOnboardingApplyInputSchema
>;

export const foundationOnboardingOutcomeSchema = z
  .strictObject({
    schemaVersion,
    id: identity,
    projectId: identity,
    proposalId: identity,
    proposalVersion: z.literal(1),
    proposalDigest: digest,
    decisionId: identity,
    decisionVersion: positiveInteger,
    decisionDigest: digest,
    resource: resourceSnapshotSchema,
    link: foundationOnboardingLinkSnapshotSchema,
    resourceCreated: z.boolean(),
    linkCreated: z.boolean(),
    identity: foundationHostIdentitySchema.nullable(),
    recordedBy: userPrincipal,
    recordedAt: datetime,
    correlationId: identity,
    contentDigest: digest,
  })
  .superRefine((value, context) => {
    if (value.resource.kind !== "host") {
      context.addIssue({
        code: "custom",
        path: ["resource", "kind"],
        message: "Onboarding outcomes must contain a host",
      });
    }
    if (value.link.lifecycle !== "active") {
      context.addIssue({
        code: "custom",
        path: ["link", "lifecycle"],
        message: "Applied links must be active",
      });
    }
    if (
      value.link.resourceId !== value.resource.id ||
      value.link.projectId !== value.projectId
    ) {
      context.addIssue({
        code: "custom",
        path: ["link"],
        message: "Link must bind the outcome resource and project",
      });
    }
    if (value.resourceCreated !== (value.identity !== null)) {
      context.addIssue({
        code: "custom",
        path: ["identity"],
        message:
          "Only a newly created resource carries an owner-asserted identity",
      });
    }
  });
export type FoundationOnboardingOutcome = z.infer<
  typeof foundationOnboardingOutcomeSchema
>;

export const foundationOnboardingDetailSchema = z
  .strictObject({
    schemaVersion,
    proposal: foundationOnboardingProposalSchema,
    currentDecision: foundationOnboardingDecisionSchema.nullable(),
    outcome: foundationOnboardingOutcomeSchema.nullable(),
  })
  .superRefine((value, context) => {
    const { proposal, currentDecision, outcome } = value;
    if (
      currentDecision &&
      (currentDecision.projectId !== proposal.projectId ||
        currentDecision.proposalId !== proposal.id ||
        currentDecision.expectedProposalDigest !== proposal.contentDigest)
    ) {
      context.addIssue({
        code: "custom",
        path: ["currentDecision"],
        message: "Decision must bind the proposal, project and digest",
      });
    }
    if (
      outcome &&
      (outcome.projectId !== proposal.projectId ||
        outcome.proposalId !== proposal.id ||
        outcome.proposalDigest !== proposal.contentDigest ||
        outcome.link.type !== proposal.relationship ||
        (proposal.target.mode === "reuse" &&
          (outcome.resource.id !== proposal.target.resourceId ||
            outcome.resourceCreated)) ||
        (proposal.target.mode === "create" &&
          (!outcome.resourceCreated ||
            outcome.identity?.namespace !==
              proposal.target.identity.namespace ||
            outcome.identity.authority !== proposal.target.identity.authority ||
            outcome.identity.externalId !==
              proposal.target.identity.externalId)))
    ) {
      context.addIssue({
        code: "custom",
        path: ["outcome"],
        message: "Outcome must bind the proposal, project, digest and target",
      });
    }
    if (
      outcome &&
      currentDecision &&
      outcome.decisionId === currentDecision.id &&
      (outcome.decisionVersion !== currentDecision.version ||
        outcome.decisionDigest !== currentDecision.contentDigest ||
        currentDecision.decision !== "approved")
    ) {
      context.addIssue({
        code: "custom",
        path: ["outcome"],
        message:
          "An outcome referencing the current decision must match its approval",
      });
    }
  });
export type FoundationOnboardingDetail = z.infer<
  typeof foundationOnboardingDetailSchema
>;

export const foundationOnboardingMachineDetailSchema = z.strictObject({
  schemaVersion,
  proposal: foundationOnboardingProposalSchema,
  currentDecision: z
    .strictObject({
      id: identity,
      version: positiveInteger,
      decision: decisionValue,
      expiresAt: datetime,
    })
    .nullable(),
  outcome: z
    .strictObject({
      id: identity,
      resourceId: identity,
      linkId: identity,
      recordedAt: datetime,
    })
    .nullable(),
});
export type FoundationOnboardingMachineDetail = z.infer<
  typeof foundationOnboardingMachineDetailSchema
>;

export const foundationOnboardingPageSchema = z
  .strictObject({
    schemaVersion,
    projectId: identity,
    items: z.array(foundationOnboardingProposalSchema),
    nextCursor: text(8192).nullable(),
  })
  .superRefine((value, context) => {
    if (value.items.some((item) => item.projectId !== value.projectId)) {
      context.addIssue({
        code: "custom",
        path: ["items"],
        message: "All proposals must belong to the page project",
      });
    }
    if (
      new Set(value.items.map((item) => item.id)).size !== value.items.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["items"],
        message: "Duplicate proposal identity",
      });
    }
  });
export type FoundationOnboardingPage = z.infer<
  typeof foundationOnboardingPageSchema
>;
