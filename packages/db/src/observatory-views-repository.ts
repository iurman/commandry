import { randomUUID } from "node:crypto";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { FoundationError, foundationDigest } from "@commandry/domain";
import type { CommandryDatabase } from "./client";
import { auditEvent, project, projectResourceLink, resource } from "./schema";
import { observatoryNamedView } from "./observatory-schema";
import { requireWorkflowOwnerSession } from "./foundation-workflow-access-repository";
import { OBSERVATORY_VIEW_POLICIES } from "../../application/src/observatory-views";
import type {
  ObservatoryViewsPort,
  ObservatoryViewRecords,
} from "../../application/src/observatory-views";
import { observatoryViewConfigurationSchema } from "../../contracts/src/observatory-queries";
import {
  observatoryViewCreateSchema,
  observatoryViewUpdateSchema,
  observatoryViewDeleteSchema,
  observatoryViewReadSchema,
  observatoryViewPageQuerySchema,
  observatoryViewSchema,
  observatoryViewPageSchema,
  observatoryViewDeletedSchema,
  observatoryViewStorageSchema as envelopeSchema,
} from "../../contracts/src/observatory-views";
import type {
  ObservatoryView,
  ObservatoryViewStorage as Envelope,
} from "../../contracts/src/observatory-views";

type ViewRow = typeof observatoryNamedView.$inferSelect;
function decode(row: ViewRow): { envelope: Envelope; view: ObservatoryView } {
  const result = envelopeSchema.safeParse(row.configuration);
  let envelope: Envelope;
  if (result.success) envelope = result.data;
  else {
    // The existing table can contain valid raw v2 configurations from before
    // this owner-private envelope. Preserve their IDs, names, versions/settings.
    const legacy = observatoryViewConfigurationSchema.safeParse(
      row.configuration,
    );
    if (!legacy.success)
      throw new FoundationError(
        "INVALID_REFERENCE",
        "Stored named-view configuration is invalid; review or delete this view",
      );
    envelope = {
      envelopeVersion: 1,
      projectId: null,
      configuration: legacy.data,
      creation: null,
      deleted: false,
    };
  }
  const parsed = observatoryViewSchema.safeParse({
    schemaVersion: 1,
    id: row.id,
    projectId: envelope.projectId,
    name: row.name,
    version: row.version,
    configuration: envelope.configuration,
    updatedAt: row.updatedAt.toISOString(),
  });
  if (!parsed.success)
    throw new FoundationError(
      "INVALID_REFERENCE",
      "Stored named-view record is invalid",
    );
  return { envelope, view: parsed.data };
}
type AuditContext = {
  action: keyof typeof OBSERVATORY_VIEW_POLICIES;
  id: string | null;
  projectId: string | null;
  expectedVersion: number | null;
  digest: string;
  replayed: boolean;
};

/** Canonical sessions are locked by the shared workflow helper, not recreated
 * from caller JSON. Owner filtering precedes every lookup, count and page.
 * Deletion is an owner-private tombstone so an old create retry cannot resurrect
 * a deleted view or reuse its UUID for a different request.
 */
export function createObservatoryViewsRepository(
  db: CommandryDatabase,
  clock = () => new Date(),
): ObservatoryViewsPort {
  return {
    async withOwner(owner, operation) {
      const outcome = await db.transaction(async (tx) => {
        await requireWorkflowOwnerSession(tx, owner, clock(), true);
        // Serialize this owner's catalogue while retaining independent owners.
        // Count and UUID page are therefore one coherent live read population.
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${"observatory-view-owner:" + owner.principalId},0))`,
        );
        await requireWorkflowOwnerSession(tx, owner, clock(), false);
        let context: AuditContext | null = null;
        try {
          const value = await tx.transaction(async (write) => {
            let used = false;
            async function validateReferences(
              view: Pick<ObservatoryView, "projectId" | "configuration">,
            ) {
              if (view.projectId) {
                const rows = await write
                  .select({ id: project.id })
                  .from(project)
                  .where(eq(project.id, view.projectId))
                  .for("share");
                if (rows.length !== 1)
                  throw new FoundationError(
                    "INVALID_REFERENCE",
                    "Named-view project no longer exists",
                  );
              }
              const ids = [
                ...new Set(
                  view.configuration.sectors.flatMap(
                    (sector) => sector.resourceIds,
                  ),
                ),
              ].sort();
              if (!ids.length) return;
              const rows = await write
                .select({ id: resource.id })
                .from(resource)
                .where(inArray(resource.id, ids))
                .orderBy(resource.id)
                .for("share");
              if (rows.length !== ids.length)
                throw new FoundationError(
                  "INVALID_REFERENCE",
                  "Named-view resources no longer exist",
                );
              if (view.projectId) {
                const links = await write
                  .select({ id: projectResourceLink.resourceId })
                  .from(projectResourceLink)
                  .where(
                    and(
                      eq(projectResourceLink.projectId, view.projectId),
                      eq(projectResourceLink.lifecycle, "active"),
                      inArray(projectResourceLink.resourceId, ids),
                    ),
                  )
                  .orderBy(projectResourceLink.id)
                  .for("share");
                if (new Set(links.map((link) => link.id)).size !== ids.length)
                  throw new FoundationError(
                    "INVALID_REFERENCE",
                    "Named-view resources must retain active links to its project",
                  );
              }
            }
            async function owned(id: string, lock: "share" | "update") {
              const [row] = await write
                .select()
                .from(observatoryNamedView)
                .where(
                  and(
                    eq(observatoryNamedView.ownerId, owner.principalId),
                    eq(observatoryNamedView.id, id),
                  ),
                )
                .for(lock);
              if (!row)
                throw new FoundationError("NOT_FOUND", "Named view not found");
              return row;
            }
            async function execute<T>(
              action: AuditContext["action"],
              input: {
                id?: string;
                projectId?: string | null | undefined;
                expectedVersion?: number;
              },
              request: unknown,
              work: () => Promise<T>,
            ): Promise<T> {
              if (used)
                throw new FoundationError(
                  "FORBIDDEN",
                  "One named-view operation is permitted per owner transaction",
                );
              used = true;
              context = {
                action,
                id: input.id ?? null,
                projectId: input.projectId ?? null,
                expectedVersion: input.expectedVersion ?? null,
                digest: foundationDigest(request),
                replayed: false,
              };
              if (input.id)
                await write.execute(
                  sql`select pg_advisory_xact_lock(hashtextextended(${"observatory-view:" + input.id},0))`,
                );
              await requireWorkflowOwnerSession(write, owner, clock(), false);
              const result = await work();
              await requireWorkflowOwnerSession(write, owner, clock(), false);
              const policy = OBSERVATORY_VIEW_POLICIES[action];
              await write.insert(auditEvent).values({
                id: randomUUID(),
                actor: owner.principalId,
                operation: policy.auditEvent,
                details: {
                  scope: policy.scope,
                  projectId: context.projectId,
                  risk: policy.risk,
                  approval: policy.approval,
                  concurrency: policy.concurrency,
                  targetId: context.id,
                  expectedVersion: context.expectedVersion,
                  contentDigest: context.digest,
                  replayed: context.replayed,
                  decision: "allowed",
                },
              });
              // Expiry while the audit was waiting must roll back data and audit.
              await requireWorkflowOwnerSession(write, owner, clock(), false);
              return result;
            }
            const records: ObservatoryViewRecords = {
              async create(input) {
                const request = observatoryViewCreateSchema.parse(input);
                return execute("create", request, request, async () => {
                  const [existing] = await write
                    .select()
                    .from(observatoryNamedView)
                    .where(
                      and(
                        eq(observatoryNamedView.ownerId, owner.principalId),
                        eq(observatoryNamedView.id, request.id),
                      ),
                    )
                    .for("update");
                  if (existing) {
                    const { envelope } = decode(existing);
                    if (
                      !envelope.creation ||
                      envelope.creation.digest !== foundationDigest(request)
                    )
                      throw new FoundationError(
                        "VERSION_CONFLICT",
                        "Named-view identity conflicts with this create request",
                      );
                    await validateReferences(envelope.creation.view);
                    context!.replayed = true;
                    return envelope.creation.view;
                  }
                  await validateReferences(request);
                  const now = clock();
                  const view = observatoryViewSchema.parse({
                    schemaVersion: 1,
                    id: request.id,
                    projectId: request.projectId,
                    name: request.name,
                    version: 1,
                    configuration: request.configuration,
                    updatedAt: now.toISOString(),
                  });
                  const configuration: Envelope = {
                    envelopeVersion: 1,
                    projectId: request.projectId,
                    configuration: request.configuration,
                    creation: { digest: foundationDigest(request), view },
                    deleted: false,
                  };
                  const inserted = await write
                    .insert(observatoryNamedView)
                    .values({
                      id: request.id,
                      ownerId: owner.principalId,
                      name: request.name,
                      version: 1,
                      configuration,
                      updatedAt: now,
                    })
                    .onConflictDoNothing({ target: observatoryNamedView.id })
                    .returning({ id: observatoryNamedView.id });
                  if (!inserted.length)
                    throw new FoundationError(
                      "VERSION_CONFLICT",
                      "Named-view identity conflicts with this create request",
                    );
                  return view;
                });
              },
              async update(input) {
                const request = observatoryViewUpdateSchema.parse(input);
                return execute("update", request, request, async () => {
                  const row = await owned(request.id, "update");
                  const stored = envelopeSchema.safeParse(row.configuration);
                  if (stored.success && stored.data.deleted)
                    throw new FoundationError(
                      "NOT_FOUND",
                      "Named view not found",
                    );
                  if (row.version !== request.expectedVersion)
                    throw new FoundationError(
                      "VERSION_CONFLICT",
                      "Named-view version changed; refresh before saving",
                    );
                  await validateReferences(request);
                  const now = clock(),
                    version = request.expectedVersion + 1;
                  await write
                    .update(observatoryNamedView)
                    .set({
                      name: request.name,
                      version,
                      configuration: {
                        envelopeVersion: 1,
                        projectId: request.projectId,
                        configuration: request.configuration,
                        creation: stored.success ? stored.data.creation : null,
                        deleted: false,
                      },
                      updatedAt: now,
                    })
                    .where(
                      and(
                        eq(observatoryNamedView.id, request.id),
                        eq(observatoryNamedView.ownerId, owner.principalId),
                      ),
                    );
                  return observatoryViewSchema.parse({
                    schemaVersion: 1,
                    id: request.id,
                    projectId: request.projectId,
                    name: request.name,
                    version,
                    configuration: request.configuration,
                    updatedAt: now.toISOString(),
                  });
                });
              },
              async delete(input) {
                const request = observatoryViewDeleteSchema.parse(input);
                return execute("delete", request, request, async () => {
                  const row = await owned(request.id, "update"),
                    stored = envelopeSchema.safeParse(row.configuration);
                  if (stored.success && stored.data.deleted)
                    throw new FoundationError(
                      "NOT_FOUND",
                      "Named view not found",
                    );
                  const legacy = observatoryViewConfigurationSchema.safeParse(
                    row.configuration,
                  );
                  const envelope: Envelope = stored.success
                    ? stored.data
                    : {
                        envelopeVersion: 1,
                        projectId: null,
                        configuration: legacy.success
                          ? legacy.data
                          : observatoryViewConfigurationSchema.parse({
                              schemaVersion: 2,
                            }),
                        creation: null,
                        deleted: false,
                      };
                  context!.projectId = envelope.projectId;
                  if (row.version !== request.expectedVersion)
                    throw new FoundationError(
                      "VERSION_CONFLICT",
                      "Named-view version changed; refresh before deleting",
                    );
                  const now = clock(),
                    version = row.version + 1;
                  await write
                    .update(observatoryNamedView)
                    .set({
                      version,
                      configuration: { ...envelope, deleted: true },
                      updatedAt: now,
                    })
                    .where(
                      and(
                        eq(observatoryNamedView.id, request.id),
                        eq(observatoryNamedView.ownerId, owner.principalId),
                      ),
                    );
                  return observatoryViewDeletedSchema.parse({
                    schemaVersion: 1,
                    id: request.id,
                    version,
                    deleted: true,
                    updatedAt: now.toISOString(),
                  });
                });
              },
              async read(input) {
                const request = observatoryViewReadSchema.parse(input);
                return execute("read", request, request, async () => {
                  const current = decode(await owned(request.id, "share"));
                  if (current.envelope.deleted)
                    throw new FoundationError(
                      "NOT_FOUND",
                      "Named view not found",
                    );
                  context!.projectId = current.view.projectId;
                  await validateReferences(current.view);
                  return current.view;
                });
              },
              async page(input) {
                const request = observatoryViewPageQuerySchema.parse(input);
                return execute("read", request, request, async () => {
                  const scope = and(
                    eq(observatoryNamedView.ownerId, owner.principalId),
                    sql`${observatoryNamedView.configuration}->>'deleted' is distinct from 'true'`,
                    request.projectId === undefined
                      ? undefined
                      : request.projectId === null
                        ? sql`${observatoryNamedView.configuration}->>'projectId' is null`
                        : sql`${observatoryNamedView.configuration}->>'projectId' = ${request.projectId}`,
                  );
                  const [count] = await write
                    .select({ total: sql<number>`count(*)::integer` })
                    .from(observatoryNamedView)
                    .where(scope);
                  const rows = await write
                    .select()
                    .from(observatoryNamedView)
                    .where(
                      and(
                        scope,
                        request.cursor
                          ? gt(observatoryNamedView.id, request.cursor)
                          : undefined,
                      ),
                    )
                    .orderBy(observatoryNamedView.id)
                    .limit(request.limit + 1)
                    .for("share");
                  const items = rows
                    .slice(0, request.limit)
                    .map((row) => decode(row).view);
                  for (const view of items) await validateReferences(view);
                  return observatoryViewPageSchema.parse({
                    schemaVersion: 1,
                    items,
                    total: count?.total ?? 0,
                    nextCursor:
                      rows.length > request.limit ? items.at(-1)!.id : null,
                  });
                });
              },
            };
            const result = await operation(records);
            if (!used)
              throw new FoundationError(
                "FORBIDDEN",
                "No named-view operation was requested",
              );
            return result;
          });
          await requireWorkflowOwnerSession(tx, owner, clock(), false);
          return { ok: true as const, value };
        } catch (error) {
          if (!(error instanceof FoundationError) || !context) throw error;
          const denial = context as AuditContext;
          await requireWorkflowOwnerSession(tx, owner, clock(), false);
          await tx.insert(auditEvent).values({
            id: randomUUID(),
            actor: owner.principalId,
            operation: OBSERVATORY_VIEW_POLICIES[denial.action].auditEvent,
            details: {
              scope: "owner",
              projectId: denial.projectId,
              targetId: denial.id,
              decision: "denied",
              code: error.code,
            },
          });
          await requireWorkflowOwnerSession(tx, owner, clock(), false);
          return { ok: false as const, error };
        }
      });
      // Do not disclose a committed result to a session revoked/expired at return.
      await requireWorkflowOwnerSession(db, owner, clock(), false);
      if (!outcome.ok) throw outcome.error;
      return outcome.value;
    },
  };
}
