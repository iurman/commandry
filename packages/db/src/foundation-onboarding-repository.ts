import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import type {
  FoundationOnboardingPort,
  FoundationOnboardingRecords,
  FoundationRecordPort,
} from "@commandry/application";
import {
  foundationActorSchema,
  foundationOnboardingDecisionSchema,
  foundationOnboardingOutcomeSchema,
  foundationOnboardingProposalSchema,
  foundationOnboardingPreconditionsSchema,
  type FoundationOnboardingDecision,
  type FoundationOnboardingProposal,
} from "@commandry/contracts";
import {
  FoundationError,
  canonicalFoundationJson,
  foundationDigest,
  foundationInstantMilliseconds,
  projectResourceRelationship,
} from "@commandry/domain";
import type { CommandryDatabase } from "./client";
import type { FoundationTransaction } from "./foundation-record-repository";
import {
  createFoundationWorkflowAccessRepository,
  type FoundationWorkflowRecordContext,
} from "./foundation-workflow-access-repository";
import { foundationClient } from "./foundation-schema";
import {
  insertCanonicalProjectResourceLink,
  insertCanonicalResource,
} from "./catalog-resource-writes";
import { projectResourceLink, resource } from "./schema";
import {
  foundationOnboardingDecision as decisions,
  foundationOnboardingOutcome as outcomes,
  foundationOnboardingProposal as proposals,
  foundationOnboardingProposalEvidence as members,
  resourceIdentityClaim as claims,
} from "./foundation-onboarding-schema";

function fail(
  code:
    | "FORBIDDEN"
    | "VERSION_CONFLICT"
    | "INVALID_REFERENCE"
    | "APPROVAL_REQUIRED" = "INVALID_REFERENCE",
): never {
  throw new FoundationError(
    code,
    "Onboarding record is unavailable or changed",
  );
}
const same = (a: unknown, b: unknown) =>
  canonicalFoundationJson(a) === canonicalFoundationJson(b);
function strict<T extends { contentDigest: string }>(
  schema: { parse(value: unknown): T },
  value: unknown,
): T {
  let parsed: T;
  try {
    parsed = schema.parse(value);
  } catch {
    return fail();
  }
  const { contentDigest, ...unsigned } = parsed;
  if (!same(parsed, value) || foundationDigest(unsigned) !== contentDigest)
    fail();
  return parsed;
}
function summary(row: typeof resource.$inferSelect) {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    subtype: row.subtype,
    parentResourceId: row.parentResourceId,
    state: row.state,
    externalUrl: row.externalUrl,
    lastObservedAt: row.lastObservedAt?.toISOString() ?? null,
  };
}
function linkSummary(row: typeof projectResourceLink.$inferSelect) {
  return {
    id: row.id,
    projectId: row.projectId,
    resourceId: row.resourceId,
    type: row.type,
    lifecycle: row.lifecycle,
  };
}
export function createFoundationOnboardingRecordRepository(
  tx: FoundationTransaction,
  context: FoundationWorkflowRecordContext,
  records: FoundationRecordPort,
  now: () => Date,
): FoundationOnboardingRecords {
  const request = context.request;
  function guard(
    operations: readonly string[],
    target: string | null | undefined,
    owner = false,
  ) {
    if (
      !operations.includes(request.operation) ||
      (target !== undefined && request.targetId !== target) ||
      (owner && context.mode !== "owner") ||
      !foundationActorSchema.shape.projectId.safeParse(request.projectId)
        .success ||
      !["local", "test", "preview", "production"].includes(
        request.environment,
      ) ||
      !Number.isFinite(now().getTime())
    )
      fail("FORBIDDEN");
    if (
      context.mode === "machine" &&
      request.principalId !== "foundation-client:" + context.request.clientId
    )
      fail("FORBIDDEN");
    if (
      context.mode === "owner" &&
      (!request.principalId.startsWith("user:") || !context.request.sessionId)
    )
      fail("FORBIDDEN");
  }
  const scope = () =>
    and(
      eq(proposals.projectId, request.projectId),
      eq(proposals.environment, request.environment),
    );
  async function proposal(id: string, lock = false) {
    guard(["onboarding.read", "onboarding.review", "onboarding.apply"], id);
    const query = tx
      .select()
      .from(proposals)
      .where(and(scope(), eq(proposals.id, id)));
    const [row] = lock ? await query.for("update") : await query;
    if (!row) return null;
    return decodeProposal(row);
  }
  async function decodeProposal(row: typeof proposals.$inferSelect) {
    const value = strict(foundationOnboardingProposalSchema, row.record);
    const [producer] = await tx
      .select()
      .from(foundationClient)
      .where(
        and(
          eq(foundationClient.id, row.clientId),
          eq(foundationClient.projectId, request.projectId),
          eq(foundationClient.environment, request.environment),
        ),
      );
    const population = await tx
      .select()
      .from(members)
      .where(
        and(
          eq(members.proposalId, row.id),
          eq(members.projectId, request.projectId),
        ),
      )
      .orderBy(asc(members.ordinal));
    if (
      !producer ||
      value.id !== row.id ||
      value.projectId !== row.projectId ||
      value.environment !== row.environment ||
      value.version !== row.version ||
      value.recordedAt !== row.recordedAt ||
      value.recordedBy !== "foundation-client:" + row.clientId ||
      !same(
        population.map((x) => x.evidenceId),
        value.evidenceIds,
      ) ||
      population.some((x, i) => x.ordinal !== i)
    )
      fail();
    return value;
  }
  async function boundProposal(
    value: FoundationOnboardingProposal,
    lock: boolean,
  ) {
    const actual = await proposal(value.id, lock);
    if (!actual || !same(actual, value)) fail();
    return actual;
  }
  async function decision(id: string) {
    guard(["onboarding.read", "onboarding.review", "onboarding.apply"], id);
    const p = await proposal(id);
    if (!p) return null;
    const [row] = await tx
      .select()
      .from(decisions)
      .where(
        and(
          eq(decisions.proposalId, id),
          eq(decisions.projectId, request.projectId),
          eq(decisions.environment, request.environment),
        ),
      )
      .orderBy(desc(decisions.version))
      .limit(1);
    if (!row) return null;
    const value = strict(foundationOnboardingDecisionSchema, row.record);
    if (
      value.id !== row.id ||
      value.projectId !== row.projectId ||
      value.proposalId !== id ||
      value.version !== row.version ||
      value.expectedProposalDigest !== p.contentDigest ||
      value.recordedBy !== "user:" + row.ownerUserId
    )
      fail();
    return value;
  }
  function live(value: FoundationOnboardingDecision) {
    if (
      value.decision !== "approved" ||
      !(foundationInstantMilliseconds(value.expiresAt) > now().getTime())
    )
      fail("APPROVAL_REQUIRED");
  }
  async function inspect(value: FoundationOnboardingProposal, lock: boolean) {
    guard(
      ["onboarding.read", "onboarding.review", "onboarding.apply"],
      value.id,
      true,
    );
    if (lock && request.operation === "onboarding.read") fail("FORBIDDEN");
    const p = await boundProposal(value, lock);
    let identityResourceId: string | null = null,
      resourceId: string | null = null;
    if (p.target.mode === "reuse") resourceId = p.target.resourceId;
    else {
      const identity = p.target.identity;
      if (lock)
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${"foundation-onboarding-identity:" + canonicalFoundationJson([identity.namespace, identity.authority, identity.externalId])},0))`,
        );
      const [claim] = await tx
        .select()
        .from(claims)
        .where(
          and(
            eq(claims.namespace, identity.namespace),
            eq(claims.authority, identity.authority),
            eq(claims.externalId, identity.externalId),
          ),
        );
      resourceId = identityResourceId = claim?.resourceId ?? null;
    }
    if (resourceId === null)
      return { resource: null, link: null, identityResourceId };
    const rq = tx.select().from(resource).where(eq(resource.id, resourceId));
    const [r] = lock ? await rq.for("share") : await rq;
    const linkWhere = and(
      eq(projectResourceLink.projectId, p.projectId),
      eq(projectResourceLink.resourceId, resourceId),
      eq(projectResourceLink.type, p.relationship),
    );
    const lookup = () => tx.select().from(projectResourceLink).where(linkWhere);
    let [link] = lock ? await lookup().for("update") : await lookup();
    if (lock) {
      // Ordinary UPDATE owns the row before its trigger owns the tuple lock.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${"foundation-onboarding-link:" + p.projectId + ":" + resourceId + ":" + p.relationship},0))`,
      );
      [link] = await lookup().for("update");
    }
    return foundationOnboardingPreconditionsSchema.parse({
      resource: r ? summary(r) : null,
      link: link ? linkSummary(link) : null,
      identityResourceId,
    });
  }
  async function source(p: FoundationOnboardingProposal) {
    await records.assertReferences({
      evidenceIds: p.evidenceIds,
      memoryIds: [],
      configurationIds: [],
    });
    for (const id of p.evidenceIds) {
      const e = await records.getEvidence(id);
      if (!e || e.projectId !== p.projectId || e.availability !== "available")
        fail("VERSION_CONFLICT");
      await records.validateEvidenceReference({
        projectId: e.projectId,
        sourceKind: e.sourceKind,
        sourceId: e.sourceId,
        sourceVersion: e.sourceVersion,
        contentDigest: e.contentDigest,
        locator: e.locator,
        observedAt: e.observedAt,
        availability: e.availability,
      });
    }
  }
  return {
    ...records,
    getProposal(id) {
      return proposal(
        id,
        context.mode === "owner" && request.operation !== "onboarding.read",
      );
    },
    async insertProposal(raw) {
      guard(["onboarding.propose"], null);
      if (context.mode !== "machine") fail("FORBIDDEN");
      const p = strict(foundationOnboardingProposalSchema, raw);
      if (
        p.projectId !== request.projectId ||
        p.environment !== request.environment ||
        p.recordedBy !== request.principalId ||
        p.version !== 1
      )
        fail();
      await records.assertReferences({
        evidenceIds: p.evidenceIds,
        memoryIds: [],
        configurationIds: [],
      });
      // Reuse IDs are opaque proposal intent. No inventory lookup or resource FK.
      await tx.insert(proposals).values({
        id: p.id,
        projectId: p.projectId,
        environment: p.environment,
        clientId: context.request.clientId,
        version: 1,
        record: p,
        recordedAt: p.recordedAt,
      });
      if (p.evidenceIds.length)
        await tx.insert(members).values(
          p.evidenceIds.map((evidenceId, ordinal) => ({
            proposalId: p.id,
            projectId: p.projectId,
            evidenceId,
            ordinal,
          })),
        );
      return p;
    },
    async listProposals(query) {
      guard(["onboarding.read"], null);
      if (
        !Number.isInteger(query.limit) ||
        query.limit < 1 ||
        query.limit > 100 ||
        !Number.isFinite(foundationInstantMilliseconds(query.asOf))
      )
        fail();
      const cutoff = sql`foundation_onboarding_at_lte(${proposals.recordedAt},${query.asOf})`;
      if (query.afterId !== null) {
        if (
          !foundationActorSchema.shape.projectId.safeParse(query.afterId)
            .success
        )
          fail();
        const [anchor] = await tx
          .select({ id: proposals.id })
          .from(proposals)
          .where(and(scope(), eq(proposals.id, query.afterId), cutoff));
        if (!anchor) fail();
      }
      const rows = await tx
        .select()
        .from(proposals)
        .where(
          and(
            scope(),
            cutoff,
            query.afterId === null
              ? undefined
              : gt(proposals.id, query.afterId),
          ),
        )
        .orderBy(asc(proposals.id))
        .limit(query.limit + 1);
      const items = [];
      for (const row of rows.slice(0, query.limit))
        items.push(await decodeProposal(row));
      return {
        items,
        nextAfterId: rows.length > query.limit ? items.at(-1)!.id : null,
      };
    },
    getCurrentDecision: decision,
    async insertDecision(raw, expectedVersion) {
      guard(["onboarding.review"], raw.proposalId, true);
      const d = strict(foundationOnboardingDecisionSchema, raw);
      const p = await proposal(d.proposalId, true);
      if (!p) fail();
      const current = await decision(p.id);
      if (
        (current?.version ?? 0) !== expectedVersion ||
        d.expectedDecisionVersion !== expectedVersion ||
        expectedVersion >= 2147483647 ||
        d.version !== expectedVersion + 1 ||
        d.expectedProposalDigest !== p.contentDigest
      )
        fail("VERSION_CONFLICT");
      const preconditions = await inspect(p, true);
      if (!same(preconditions, d.preconditions)) fail("VERSION_CONFLICT");
      const blockers: string[] = [];
      if (p.target.mode === "reuse" && !preconditions.resource)
        blockers.push("resource_unavailable");
      if (preconditions.resource && preconditions.resource.kind !== "host")
        blockers.push("resource_not_host");
      if (preconditions.link?.lifecycle === "archived")
        blockers.push("archived_connection");
      if (
        p.target.mode === "create" &&
        preconditions.identityResourceId !== null
      )
        blockers.push(
          preconditions.resource ? "identity_conflict" : "identity_unresolved",
        );
      try {
        await source(p);
      } catch (error) {
        if (error instanceof FoundationError)
          blockers.push("source_unavailable");
        else throw error;
      }
      const core = {
        schemaVersion: 1,
        projectId: p.projectId,
        proposalId: p.id,
        proposalDigest: p.contentDigest,
        preconditionsDigest: foundationDigest(preconditions),
        blockers,
        canApply: blockers.length === 0,
      };
      if (d.expectedPreviewDigest !== foundationDigest(core))
        fail("VERSION_CONFLICT");
      const delta =
        foundationInstantMilliseconds(d.expiresAt) - now().getTime();
      if (
        !(delta > 0) ||
        delta > 2592000000 ||
        d.recordedBy !== request.principalId ||
        d.projectId !== request.projectId
      )
        fail();
      if (
        d.decision === "approved" &&
        (!d.inventoryReviewed || blockers.length)
      )
        fail("APPROVAL_REQUIRED");
      await tx.insert(decisions).values({
        id: d.id,
        proposalId: p.id,
        projectId: p.projectId,
        environment: p.environment,
        version: d.version,
        ownerUserId: request.principalId.slice(5),
        record: d,
      });
      return d;
    },
    async getOutcome(proposalId) {
      guard(
        ["onboarding.read", "onboarding.review", "onboarding.apply"],
        proposalId,
      );
      const p = await proposal(proposalId);
      if (!p) return null;
      const [row] = await tx
        .select()
        .from(outcomes)
        .where(
          and(
            eq(outcomes.proposalId, proposalId),
            eq(outcomes.projectId, request.projectId),
            eq(outcomes.environment, request.environment),
          ),
        );
      if (!row) return null;
      const o = strict(foundationOnboardingOutcomeSchema, row.record);
      const [d] = await tx
        .select()
        .from(decisions)
        .where(
          and(
            eq(decisions.id, row.decisionId),
            eq(decisions.projectId, request.projectId),
            eq(decisions.version, row.decisionVersion),
          ),
        );
      if (
        !d ||
        o.id !== row.id ||
        o.proposalId !== p.id ||
        o.projectId !== p.projectId ||
        o.proposalDigest !== p.contentDigest ||
        o.decisionId !== d.id ||
        o.decisionVersion !== d.version ||
        o.decisionDigest !==
          strict(foundationOnboardingDecisionSchema, d.record).contentDigest ||
        o.resource.id !== row.resourceId ||
        o.link.id !== row.linkId ||
        o.recordedBy !== "user:" + row.ownerUserId
      )
        fail();
      return o;
    },
    inspectProposal: inspect,
    async applyInventory(input) {
      guard(["onboarding.apply"], input.proposal.id, true);
      const p = await boundProposal(input.proposal, true);
      let d = await decision(p.id);
      if (!d || !same(d, input.decision)) fail("VERSION_CONFLICT");
      live(d);
      const [existing] = await tx
        .select({ id: outcomes.id })
        .from(outcomes)
        .where(eq(outcomes.proposalId, p.id));
      if (existing) fail("VERSION_CONFLICT");
      const before = await inspect(p, true);
      d = await decision(p.id);
      if (!d || !same(d, input.decision)) fail("VERSION_CONFLICT");
      live(d);
      if (
        !same(before, d.preconditions) ||
        (before.resource && before.resource.kind !== "host") ||
        before.link?.lifecycle === "archived" ||
        (p.target.mode === "reuse" && !before.resource) ||
        (p.target.mode === "create" && before.identityResourceId !== null)
      )
        fail("VERSION_CONFLICT");
      await source(p);
      live(d);
      if (
        input.recordedBy !== request.principalId ||
        input.correlationId !== request.correlationId ||
        !Number.isFinite(foundationInstantMilliseconds(input.recordedAt))
      )
        fail();
      let snapshot = before.resource;
      if (p.target.mode === "create") {
        const inserted = await insertCanonicalResource(tx, {
          id: input.resourceId,
          kind: "host",
          name: p.target.name,
          subtype: p.target.subtype,
          externalUrl: p.target.externalUrl,
          at: new Date(input.recordedAt),
        });
        snapshot = summary(inserted);
        await tx.insert(claims).values({
          ...p.target.identity,
          resourceId: input.resourceId,
          ownerUserId: request.principalId.slice(5),
          recordedBy: input.recordedBy,
          recordedAt: input.recordedAt,
        });
        live(d);
      } else if (input.resourceId !== p.target.resourceId) fail();
      if (!snapshot) fail();
      let link = before.link;
      const linkCreated = link === null;
      if (link) {
        if (link.id !== input.linkId) fail();
      } else {
        const relationship = projectResourceRelationship(p.relationship);
        const inserted = await insertCanonicalProjectResourceLink(tx, {
          id: input.linkId,
          projectId: p.projectId,
          resourceId: snapshot.id,
          type: p.relationship,
          ...relationship,
          provenance: "foundation-onboarding",
          at: new Date(input.recordedAt),
        });
        if (inserted.length !== 1) fail("VERSION_CONFLICT");
        link = {
          id: input.linkId,
          projectId: p.projectId,
          resourceId: snapshot.id,
          type: p.relationship,
          lifecycle: "active",
        };
      }
      live(d);
      const unsigned = {
        schemaVersion: 1 as const,
        id: input.outcomeId,
        projectId: p.projectId,
        proposalId: p.id,
        proposalVersion: 1 as const,
        proposalDigest: p.contentDigest,
        decisionId: d.id,
        decisionVersion: d.version,
        decisionDigest: d.contentDigest,
        resource: snapshot,
        link,
        resourceCreated: p.target.mode === "create",
        linkCreated,
        identity: p.target.mode === "create" ? p.target.identity : null,
        recordedBy: input.recordedBy,
        recordedAt: input.recordedAt,
        correlationId: input.correlationId,
      };
      const o = foundationOnboardingOutcomeSchema.parse({
        ...unsigned,
        contentDigest: foundationDigest(unsigned),
      });
      await tx.insert(outcomes).values({
        id: o.id,
        proposalId: p.id,
        projectId: p.projectId,
        environment: p.environment,
        decisionId: d.id,
        decisionVersion: d.version,
        resourceId: o.resource.id,
        linkId: o.link.id,
        ownerUserId: request.principalId.slice(5),
        record: o,
      });
      live(d);
      return o;
    },
  };
}
export function createFoundationOnboardingAccessRepository(
  db: CommandryDatabase,
  options: { now?: () => Date } = {},
): FoundationOnboardingPort {
  const port = createFoundationWorkflowAccessRepository(
    db,
    createFoundationOnboardingRecordRepository,
    {
      machineOperations: ["onboarding.read", "onboarding.propose"],
      ownerOperations: [
        "onboarding.read",
        "onboarding.review",
        "onboarding.apply",
      ],
      lockNamespace: "foundation-onboarding:",
      ...options,
    },
  );
  const unavailable = (error: unknown): never => {
    if (error instanceof FoundationError) throw error;
    let current = error;
    for (
      let depth = 0;
      depth < 5 && current && typeof current === "object";
      depth++
    ) {
      if ("code" in current && current.code === "23505")
        fail("VERSION_CONFLICT");
      if (
        "constraint" in current &&
        typeof current.constraint === "string" &&
        current.constraint.startsWith("foundation_onboarding_")
      )
        fail("VERSION_CONFLICT");
      current = "cause" in current ? current.cause : null;
    }
    throw error;
  };
  return {
    async withClient(request, action) {
      try {
        return await port.withClient(request, action);
      } catch (error) {
        return unavailable(error);
      }
    },
    async withOwner(request, action) {
      try {
        return await port.withOwner(request, action);
      } catch (error) {
        return unavailable(error);
      }
    },
  };
}
