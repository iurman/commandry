import { and, desc, eq, gt, isNull, lte, ne, or, sql } from "drizzle-orm";
import {
  notificationSchema,
  type ChangeNotificationStateRequest,
  type Notification,
} from "@commandry/contracts";
import {
  effectiveNotificationReceipt,
  nextNotificationState,
  NotificationError,
  projectLocalNotification,
} from "@commandry/domain";
import type { CommandryDatabase } from "./client";
import {
  alertCondition,
  automationRun,
  notificationAuditEvent,
  notificationReceipt,
  project,
  resource,
  simulatedActionProposal,
  simulatedApprovalState,
} from "./schema";

type ListQuery = {
  limit: number;
  cursor?: string | undefined;
  view: "active" | "all";
  projectId?: string | undefined;
};

const alertKey = sql<string>`'alert-' || ${alertCondition.state} || ':' || ${alertCondition.id}::text || ':' || ${alertCondition.cycle}::text`;
const approvalKey = sql<string>`'approval-pending:' || ${simulatedActionProposal.id}::text`;
const automationKey = sql<string>`'automation-failed:' || ${automationRun.id}::text`;
const automationTime = sql<Date>`coalesce(${automationRun.completedAt}, ${automationRun.createdAt})`;

function readCursor(value?: string) {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString(),
    );
    if (
      !Array.isArray(parsed) ||
      parsed.length !== 2 ||
      typeof parsed[0] !== "string" ||
      typeof parsed[1] !== "string" ||
      !Number.isFinite(Date.parse(parsed[0])) ||
      parsed[1].length > 120
    )
      throw new Error("Invalid cursor");
    return { at: new Date(parsed[0]), id: parsed[1] };
  } catch {
    throw new NotificationError(
      "NOTIFICATION_INVALID_CURSOR",
      "Invalid notification cursor",
    );
  }
}

function nextCursor(item: Notification) {
  return Buffer.from(JSON.stringify([item.occurredAt, item.id])).toString(
    "base64url",
  );
}

function receiptFilter(view: "active" | "all", now: Date) {
  if (view === "all") return undefined;
  return or(
    isNull(notificationReceipt.id),
    and(
      ne(notificationReceipt.state, "dismissed"),
      or(
        ne(notificationReceipt.state, "snoozed"),
        lte(notificationReceipt.snoozedUntil, now),
      ),
    ),
  );
}

function sortNotifications(items: Notification[]) {
  return items.sort((left, right) => {
    const time = right.occurredAt.localeCompare(left.occurredAt);
    return time || right.id.localeCompare(left.id);
  });
}

export function createNotificationRepository(db: CommandryDatabase) {
  async function fetch(
    query: ListQuery,
    forcedId?: string,
  ): Promise<Notification[]> {
    const cursor = readCursor(query.cursor);
    const now = new Date();
    const take = forcedId ? 1 : query.limit + 1;
    const [alerts, approvals, automations] = await Promise.all([
      db
        .select({
          id: alertKey,
          sourceId: alertCondition.id,
          sourceAt: alertCondition.lastObservedAt,
          sourceState: alertCondition.state,
          projectId: alertCondition.projectId,
          projectName: project.name,
          resourceId: alertCondition.resourceId,
          resourceName: resource.name,
          reason: alertCondition.reason,
          sourceLabel: alertCondition.sourceLabel,
          receiptState: notificationReceipt.state,
          snoozedUntil: notificationReceipt.snoozedUntil,
          version: notificationReceipt.version,
        })
        .from(alertCondition)
        .innerJoin(project, eq(project.id, alertCondition.projectId))
        .innerJoin(resource, eq(resource.id, alertCondition.resourceId))
        .leftJoin(notificationReceipt, eq(notificationReceipt.id, alertKey))
        .where(
          and(
            query.projectId
              ? eq(alertCondition.projectId, query.projectId)
              : undefined,
            forcedId ? eq(alertKey, forcedId) : undefined,
            cursor
              ? sql`(${alertCondition.lastObservedAt}, ${alertKey}) < (${cursor.at}, ${cursor.id})`
              : undefined,
            receiptFilter(query.view, now),
          ),
        )
        .orderBy(desc(alertCondition.lastObservedAt), desc(alertKey))
        .limit(take),
      db
        .select({
          id: approvalKey,
          sourceId: simulatedActionProposal.id,
          sourceAt: simulatedActionProposal.createdAt,
          projectId: simulatedActionProposal.projectId,
          projectName: project.name,
          resourceName: resource.name,
          receiptState: notificationReceipt.state,
          snoozedUntil: notificationReceipt.snoozedUntil,
          version: notificationReceipt.version,
        })
        .from(simulatedActionProposal)
        .innerJoin(
          simulatedApprovalState,
          eq(simulatedApprovalState.proposalId, simulatedActionProposal.id),
        )
        .innerJoin(project, eq(project.id, simulatedActionProposal.projectId))
        .innerJoin(
          resource,
          eq(resource.id, simulatedActionProposal.resourceId),
        )
        .leftJoin(notificationReceipt, eq(notificationReceipt.id, approvalKey))
        .where(
          and(
            eq(simulatedApprovalState.state, "pending"),
            query.projectId
              ? eq(simulatedActionProposal.projectId, query.projectId)
              : undefined,
            forcedId ? eq(approvalKey, forcedId) : undefined,
            cursor
              ? sql`(${simulatedActionProposal.createdAt}, ${approvalKey}) < (${cursor.at}, ${cursor.id})`
              : undefined,
            receiptFilter(query.view, now),
          ),
        )
        .orderBy(desc(simulatedActionProposal.createdAt), desc(approvalKey))
        .limit(take),
      db
        .select({
          id: automationKey,
          sourceId: automationRun.id,
          definitionId: automationRun.definitionId,
          sourceAt: automationTime,
          projectId: automationRun.projectId,
          projectName: project.name,
          error: automationRun.error,
          receiptState: notificationReceipt.state,
          snoozedUntil: notificationReceipt.snoozedUntil,
          version: notificationReceipt.version,
        })
        .from(automationRun)
        .innerJoin(project, eq(project.id, automationRun.projectId))
        .leftJoin(
          notificationReceipt,
          eq(notificationReceipt.id, automationKey),
        )
        .where(
          and(
            eq(automationRun.state, "failed"),
            query.projectId
              ? eq(automationRun.projectId, query.projectId)
              : undefined,
            forcedId ? eq(automationKey, forcedId) : undefined,
            cursor
              ? sql`(${automationTime}, ${automationKey}) < (${cursor.at}, ${cursor.id})`
              : undefined,
            receiptFilter(query.view, now),
          ),
        )
        .orderBy(desc(automationTime), desc(automationKey))
        .limit(take),
    ]);
    return sortNotifications([
      ...alerts.map((row) =>
        notificationSchema.parse({
          ...projectLocalNotification({
            kind: "alert",
            id: row.id,
            projectId: row.projectId,
            projectName: row.projectName,
            resourceId: row.resourceId,
            resourceName: row.resourceName,
            sourceId: row.sourceId,
            sourceAt: new Date(row.sourceAt).toISOString(),
            sourceState: row.sourceState,
            reason: row.reason,
            sourceLabel: row.sourceLabel,
          }),
          ...effectiveNotificationReceipt(
            {
              state: row.receiptState,
              snoozedUntil: row.snoozedUntil,
              version: row.version,
            },
            now,
          ),
        }),
      ),
      ...approvals.map((row) =>
        notificationSchema.parse({
          ...projectLocalNotification({
            kind: "approval",
            id: row.id,
            projectId: row.projectId,
            projectName: row.projectName,
            sourceId: row.sourceId,
            sourceAt: row.sourceAt.toISOString(),
            resourceName: row.resourceName,
          }),
          ...effectiveNotificationReceipt(
            {
              state: row.receiptState,
              snoozedUntil: row.snoozedUntil,
              version: row.version,
            },
            now,
          ),
        }),
      ),
      ...automations.map((row) =>
        notificationSchema.parse({
          ...projectLocalNotification({
            kind: "automation",
            id: row.id,
            projectId: row.projectId,
            projectName: row.projectName,
            sourceId: row.sourceId,
            definitionId: row.definitionId,
            sourceAt: new Date(row.sourceAt).toISOString(),
            error: row.error,
          }),
          ...effectiveNotificationReceipt(
            {
              state: row.receiptState,
              snoozedUntil: row.snoozedUntil,
              version: row.version,
            },
            now,
          ),
        }),
      ),
    ]);
  }

  return {
    async list(query: ListQuery) {
      const all = await fetch(query);
      const items = all.slice(0, query.limit);
      return {
        items,
        nextCursor:
          all.length > query.limit && items.at(-1)
            ? nextCursor(items.at(-1)!)
            : null,
      };
    },
    async getById(id: string) {
      return (await fetch({ limit: 1, view: "all" }, id))[0] ?? null;
    },
    async changeState(id: string, input: ChangeNotificationStateRequest) {
      const source = (await fetch({ limit: 1, view: "all" }, id))[0] ?? null;
      if (!source)
        throw new NotificationError(
          "NOTIFICATION_NOT_FOUND",
          "Notification is no longer current",
        );
      const now = new Date();
      const next = nextNotificationState(input, now);
      const receipt = await db.transaction(async (tx) => {
        if (input.expectedVersion === 0) {
          const [inserted] = await tx
            .insert(notificationReceipt)
            .values({
              id,
              state: next.state,
              snoozedUntil: next.snoozedUntil,
              version: 1,
              updatedAt: now,
            })
            .onConflictDoNothing({ target: notificationReceipt.id })
            .returning();
          if (!inserted)
            throw new NotificationError(
              "NOTIFICATION_STALE",
              "Notification state changed; reload and retry",
            );
          await tx.insert(notificationAuditEvent).values({
            id: crypto.randomUUID(),
            notificationId: id,
            actor: "local-user:unattributed",
            operation: "notification.state_changed",
            previousState: "unread",
            nextState: next.state,
            snoozedUntil: next.snoozedUntil,
            createdAt: now,
          });
          return inserted;
        }
        const [current] = await tx
          .select()
          .from(notificationReceipt)
          .where(eq(notificationReceipt.id, id))
          .limit(1);
        if (!current || current.version !== input.expectedVersion)
          throw new NotificationError(
            "NOTIFICATION_STALE",
            "Notification state changed; reload and retry",
          );
        const [updated] = await tx
          .update(notificationReceipt)
          .set({
            state: next.state,
            snoozedUntil: next.snoozedUntil,
            version: current.version + 1,
            updatedAt: now,
          })
          .where(
            and(
              eq(notificationReceipt.id, id),
              eq(notificationReceipt.version, input.expectedVersion),
            ),
          )
          .returning();
        if (!updated)
          throw new NotificationError(
            "NOTIFICATION_STALE",
            "Notification state changed; reload and retry",
          );
        await tx.insert(notificationAuditEvent).values({
          id: crypto.randomUUID(),
          notificationId: id,
          actor: "local-user:unattributed",
          operation: "notification.state_changed",
          previousState: current.state,
          nextState: next.state,
          snoozedUntil: next.snoozedUntil,
          createdAt: now,
        });
        return updated;
      });
      return notificationSchema.parse({
        ...source,
        state: receipt.state,
        snoozedUntil: receipt.snoozedUntil?.toISOString() ?? null,
        version: receipt.version,
      });
    },
    async listAudit(
      id: string,
      query: { limit: number; cursor?: string | undefined },
    ) {
      const rows = await db
        .select()
        .from(notificationAuditEvent)
        .where(
          and(
            eq(notificationAuditEvent.notificationId, id),
            query.cursor
              ? gt(notificationAuditEvent.id, query.cursor)
              : undefined,
          ),
        )
        .orderBy(notificationAuditEvent.id)
        .limit(query.limit + 1);
      const visible = rows.slice(0, query.limit);
      return {
        items: visible.map((row) => ({
          id: row.id,
          notificationId: row.notificationId,
          actor: row.actor,
          operation: "notification.state_changed" as const,
          previousState: row.previousState as
            "unread" | "acknowledged" | "dismissed" | "snoozed",
          nextState: row.nextState as
            "unread" | "acknowledged" | "dismissed" | "snoozed",
          snoozedUntil: row.snoozedUntil?.toISOString() ?? null,
          createdAt: row.createdAt.toISOString(),
        })),
        nextCursor:
          rows.length > query.limit ? (visible.at(-1)?.id ?? null) : null,
      };
    },
  };
}
