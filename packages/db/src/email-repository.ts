import { randomUUID } from "node:crypto";
import { eq, sql, type SQL } from "drizzle-orm";
import { ZodError } from "zod";
import {
  foundationClientSchema,
  mailMetadataSchema,
  type MailAccount,
  type MailDraft,
  type MailMessage,
  type MailPageQuery,
  type MailRule,
  type MailInbox,
} from "@commandry/contracts";
import {
  FoundationError,
  MailError,
  foundationDigest,
  requireFoundationGrant,
} from "@commandry/domain";
import {
  mailCapability,
  type MailAccessPort,
  type MailRecords,
} from "@commandry/application";
import type { CommandryDatabase } from "./client";
import type { FoundationTransaction } from "./foundation-record-repository";
import { foundationAudit, foundationClient } from "./foundation-schema";
import { requireWorkflowOwnerSession } from "./foundation-workflow-access-repository";
import { mailAudit } from "./email-schema";

type Row = Record<string, unknown>;
export const mailIso = (v: unknown): string | null =>
  v === null || v === undefined ? null : new Date(String(v)).toISOString();
export function mailAccountRecord(row: Row): MailAccount {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    name: String(row.name),
    provider: "resend",
    domains: row.domains as string[],
    verifiedDomains: row.verified_domains as string[],
    verifiedAt: mailIso(row.verified_at),
    enabled: Boolean(row.enabled),
    lastSyncedAt: mailIso(row.last_synced_at),
    error: row.error as string | null,
    receivedComplete: Boolean(row.received_complete),
    sentComplete: Boolean(row.sent_complete),
    receivedCursor: row.received_cursor as string | null,
    sentCursor: row.sent_cursor as string | null,
    retentionDays: Number(row.retention_days),
    pendingEvents: Number(row.pending_events ?? 0),
    failedEvents: Number(row.failed_events ?? 0),
  };
}
export function mailMessageRecord(row: Row): MailMessage {
  return {
    ...mailMetadataSchema.parse(row.metadata),
    version: Number(row.version),
    id: String(row.id),
    accountId: String(row.account_id),
    unread: Boolean(row.unread),
    attention: row.attention as MailMessage["attention"],
    reasons: row.reasons as string[],
    annotation: row.annotation as MailMessage["annotation"],
  };
}
export function mailDraftRecord(row: Row): MailDraft {
  return {
    ...(row.payload as MailDraft),
    state: row.state as MailDraft["state"],
    approvedBy: row.approved_by as string | null,
    approvedUntil: mailIso(row.approved_until),
    providerId: row.provider_id as string | null,
    error: row.error as string | null,
    attemptedAt: mailIso(row.attempted_at),
  };
}
function pageCursor(q: MailPageQuery, scope: string | null, kind: string) {
  const digest = foundationDigest({ ...q, cursor: null, scope, kind });
  let after: { digest: string; id: string; at?: string } | null = null;
  if (q.cursor) {
    try {
      after = JSON.parse(Buffer.from(q.cursor, "base64url").toString());
    } catch {
      throw new MailError("INVALID_INPUT");
    }
    if (
      !after ||
      after.digest !== digest ||
      typeof after.id !== "string" ||
      (after.at !== undefined && !Number.isFinite(Date.parse(after.at)))
    )
      throw new MailError("INVALID_INPUT");
  }
  return {
    after,
    next: (id: string, at?: string) =>
      Buffer.from(
        JSON.stringify({ digest, id, ...(at ? { at } : {}) }),
      ).toString("base64url"),
  };
}
function condition(q: MailPageQuery, scope: string | null): SQL {
  const clauses: SQL[] = [sql`true`];
  if (scope) clauses.push(sql`a.project_id = ${scope}::uuid`);
  if (q.accountId) clauses.push(sql`m.account_id = ${q.accountId}::uuid`);
  if (q.direction) clauses.push(sql`m.direction = ${q.direction}`);
  if (q.view === "unread")
    clauses.push(sql`m.unread and m.direction = 'received'`);
  if (q.view === "attention")
    clauses.push(
      sql`m.attention = 'open' and jsonb_array_length(m.reasons) > 0`,
    );
  if (q.q)
    clauses.push(
      sql`strpos(lower(concat(m.metadata->>'subject',' ',m.metadata->>'from',' ',m.metadata->'to',' ',m.metadata->'cc',' ',m.metadata->'bcc',' ',m.metadata->'receivedFor')), lower(${q.q})) > 0`,
    );
  if (q.domain || q.address)
    clauses.push(
      sql`exists (select 1 from mail_membership mm where mm.message_id = m.id ${q.domain ? sql`and mm.domain = ${q.domain}` : sql``} ${q.address ? sql`and mm.address = ${q.address}` : sql``})`,
    );
  if (q.threadMessageId)
    clauses.push(
      sql`(m.metadata->>'messageId' = ${q.threadMessageId} or m.metadata->>'inReplyTo' = ${q.threadMessageId} or m.metadata->'references' ? ${q.threadMessageId})`,
    );
  return sql.join(clauses, sql` and `);
}
const totals = sql`count(*) filter (where m.direction='received')::int as received, count(*) filter (where m.direction='sent')::int as sent, count(*) filter (where m.direction='received' and m.unread)::int as unread, count(*) filter (where m.attention='open' and jsonb_array_length(m.reasons)>0)::int as attention`;

function records(
  tx: FoundationTransaction,
  principalId: string,
  scope: string | null,
  owner: boolean,
  clock: () => Date,
): MailRecords {
  const targetAudit = async (operation: string, id: string, code = "OK") => {
    await tx.insert(mailAudit).values({
      id: randomUUID(),
      principalId,
      projectId: scope,
      operation,
      targetId: id,
      decision: "allowed",
      code,
    });
  };
  const account = async (id: string) => {
    const rows = await tx.execute(
      sql`select *, (select count(*)::int from mail_event e where e.account_id=mail_account.id and not e.processed) as pending_events,(select count(*)::int from mail_event e where e.account_id=mail_account.id and not e.processed and e.error is not null) as failed_events from mail_account where id=${id}::uuid ${scope ? sql`and project_id=${scope}::uuid` : sql``} for share`,
    );
    if (!rows.rows[0]) throw new MailError("NOT_FOUND");
    return mailAccountRecord(rows.rows[0]);
  };
  const message = async (id: string) => {
    const rows = await tx.execute(
      sql`select m.* from mail_message m join mail_account a on a.id=m.account_id where m.id=${id}::uuid ${scope ? sql`and a.project_id=${scope}::uuid` : sql``}`,
    );
    if (!rows.rows[0]) throw new MailError("NOT_FOUND");
    await targetAudit("mail.message.read", id);
    return mailMessageRecord(rows.rows[0]);
  };
  const draft = async (id: string) => {
    const rows = await tx.execute(
      sql`select d.* from mail_draft d join mail_account a on a.id=d.account_id where d.id=${id}::uuid ${scope ? sql`and a.project_id=${scope}::uuid` : sql``} for update of d`,
    );
    if (!rows.rows[0]) throw new MailError("NOT_FOUND");
    await targetAudit("mail.draft.read", id);
    return mailDraftRecord(rows.rows[0]);
  };
  return {
    principalId,
    owner,
    account,
    message,
    draft,
    async accounts() {
      const rows = await tx.execute(
        sql`select *, (select count(*)::int from mail_event e where e.account_id=mail_account.id and not e.processed) as pending_events,(select count(*)::int from mail_event e where e.account_id=mail_account.id and not e.processed and e.error is not null) as failed_events from mail_account ${scope ? sql`where project_id=${scope}::uuid` : sql``} order by name,id`,
      );
      return rows.rows.map(mailAccountRecord);
    },
    async createAccount(input) {
      if (!owner) throw new MailError("FORBIDDEN");
      const defaultRules: MailRule[] = [
        {
          id: randomUUID(),
          field: "subject",
          contains: "urgent",
          reason: "Subject mentions urgent",
          enabled: true,
        },
        {
          id: randomUUID(),
          field: "subject",
          contains: "action required",
          reason: "Subject requests action",
          enabled: true,
        },
        {
          id: randomUUID(),
          field: "recipient",
          contains: "privacy@",
          reason: "Privacy request inbox",
          enabled: true,
        },
      ];
      await tx.execute(
        sql`insert into mail_account(id,project_id,name,domains,rules) values (${input.id}::uuid,${input.projectId}::uuid,${input.name},${JSON.stringify(input.domains)}::jsonb,${JSON.stringify(defaultRules)}::jsonb)`,
      );
      return account(input.id);
    },
    async messages(q) {
      const c = pageCursor(q, scope, "messages");
      const rows = await tx.execute(
        sql`select m.* from mail_message m join mail_account a on a.id=m.account_id where ${condition(q, scope)} ${c.after ? sql`and (m.occurred_at,m.id) < (${c.after.at}::timestamptz,${c.after.id}::uuid)` : sql``} order by m.occurred_at desc,m.id desc limit ${q.limit + 1}`,
      );
      const items = rows.rows.slice(0, q.limit).map(mailMessageRecord),
        last = items.at(-1);
      return {
        items,
        nextCursor:
          rows.rows.length > q.limit && last
            ? c.next(last.id, last.occurredAt)
            : null,
      };
    },
    async counts(q) {
      const rows = await tx.execute(
        sql`select ${totals} from mail_message m join mail_account a on a.id=m.account_id where ${condition(q, scope)}`,
      );
      return rows.rows[0] as {
        received: number;
        sent: number;
        unread: number;
        attention: number;
      };
    },
    async domainCounts() {
      const result = await tx.execute(
        sql`select mm.domain,mm.account_id as "accountId",count(distinct m.id) filter(where m.direction='received')::int as received,count(distinct m.id) filter(where m.direction='sent')::int as sent,count(distinct m.id) filter(where m.direction='received' and m.unread)::int as unread,count(distinct m.id) filter(where m.attention='open' and jsonb_array_length(m.reasons)>0)::int as attention from mail_membership mm join mail_message m on m.id=mm.message_id join mail_account a on a.id=m.account_id ${scope ? sql`where a.project_id=${scope}::uuid` : sql``} group by mm.domain,mm.account_id order by mm.domain`,
      );
      return result.rows as (MailInbox & { domain: string })[];
    },
    async inboxes(q) {
      const c = pageCursor(q, scope, "inboxes");
      const rows = await tx.execute(
        sql`select mm.account_id as "accountId", mm.address, mm.domain, ${totals} from mail_membership mm join mail_message m on m.id=mm.message_id join mail_account a on a.id=m.account_id where ${condition({ ...q, q: "" }, scope)} ${q.q ? sql`and strpos(lower(mm.address),lower(${q.q}))>0` : sql``} ${q.address ? sql`and mm.address=${q.address}` : sql``} ${q.domain ? sql`and mm.domain=${q.domain}` : sql``} ${c.after ? sql`and (mm.account_id::text || '/' || mm.address) > ${c.after.id}` : sql``} group by mm.account_id,mm.address,mm.domain order by mm.account_id,mm.address limit ${q.limit + 1}`,
      );
      const items = rows.rows.slice(0, q.limit) as MailInbox[],
        last = items.at(-1);
      return {
        items,
        nextCursor:
          rows.rows.length > q.limit && last
            ? c.next(last.accountId + "/" + last.address)
            : null,
      };
    },
    async triage(input) {
      await message(input.id);
      const annotation =
        input.summary !== undefined
          ? {
              summary: input.summary,
              actorId: principalId,
              at: clock().toISOString(),
              verification: "unverified",
            }
          : undefined;
      const sets: SQL[] = [];
      if (input.unread !== undefined) sets.push(sql`unread=${input.unread}`);
      if (input.attention !== undefined)
        sets.push(sql`attention=${input.attention}`);
      if (annotation !== undefined)
        sets.push(sql`annotation=${JSON.stringify(annotation)}::jsonb`);
      const changed = await tx.execute(
        sql`update mail_message set ${sql.join(sets, sql`, `)},version=version+1 where id=${input.id}::uuid and version=${input.expectedVersion} returning id`,
      );
      if (!changed.rows.length) throw new MailError("VERSION_CONFLICT");
      await targetAudit(
        "mail.triage",
        input.id,
        input.attention ?? (input.unread ? "UNREAD" : "READ"),
      );
      return message(input.id);
    },
    async rules(id) {
      await account(id);
      const r = await tx.execute(
        sql`select rules,rules_version from mail_account where id=${id}::uuid`,
      );
      return {
        rules: r.rows[0]!.rules as MailRule[],
        version: Number(r.rows[0]!.rules_version),
      };
    },
    async setRules(input) {
      if (!owner) throw new MailError("FORBIDDEN");
      const r = await tx.execute(
        sql`update mail_account set rules=${JSON.stringify(input.rules)}::jsonb,rules_version=rules_version+1,received_cursor=null,sent_cursor=null,received_complete=false,sent_complete=false,received_due=now(),sent_due=now() where id=${input.accountId}::uuid and rules_version=${input.expectedVersion} returning rules_version`,
      );
      if (!r.rows.length) throw new MailError("VERSION_CONFLICT");
      return {
        version: Number(r.rows[0]!.rules_version),
        rules: input.rules,
        reclassification:
          "Runs during worker reconciliation; resolved reviews remain resolved.",
      };
    },
    async drafts(q) {
      const c = pageCursor(q, scope, "drafts");
      const r = await tx.execute(
        sql`select d.* from mail_draft d join mail_account a on a.id=d.account_id where true ${scope ? sql`and a.project_id=${scope}::uuid` : sql``} ${q.accountId ? sql`and d.account_id=${q.accountId}::uuid` : sql``} ${c.after ? sql`and (d.created_at,d.id)<(${c.after.at}::timestamptz,${c.after.id}::uuid)` : sql``} order by d.created_at desc,d.id desc limit ${q.limit + 1}`,
      );
      const items = r.rows.slice(0, q.limit).map(mailDraftRecord),
        last = items.at(-1);
      return {
        items,
        nextCursor:
          r.rows.length > q.limit && last
            ? c.next(last.id, last.createdAt)
            : null,
      };
    },
    async saveDraft(d) {
      const { createdAt: _createdAt, ...comparison } = d;
      void _createdAt;
      const result = await tx.execute(
        sql`insert into mail_draft(id,account_id,payload,created_by,created_at) values(${d.id}::uuid,${d.accountId}::uuid,${JSON.stringify(d)}::jsonb,${principalId},${d.createdAt}::timestamptz) on conflict(id) do nothing returning id`,
      );
      if (result.rows.length && d.supersedesId)
        await tx.execute(
          sql`update mail_draft set state='superseded',approved_by=null,approved_until=null where id=${d.supersedesId}::uuid and account_id=${d.accountId}::uuid and state in ('draft','approved','failed')`,
        );
      if (!result.rows.length) {
        const existing = await draft(d.id);
        const { createdAt: _at, ...old } = existing;
        void _at;
        // Lifecycle is mutable; the exact immutable payload and original author bind retries.
        const normalize = (v: typeof comparison) => ({
          ...v,
          state: "draft",
          approvedBy: null,
          approvedUntil: null,
          providerId: null,
          error: null,
          attemptedAt: null,
        });
        if (
          foundationDigest(normalize(old)) !==
          foundationDigest(normalize(comparison))
        )
          throw new MailError("VERSION_CONFLICT");
      }
      return draft(d.id);
    },
    async approve(id, until) {
      if (!owner) throw new MailError("FORBIDDEN");
      await draft(id);
      await tx.execute(
        sql`update mail_draft set state='approved',approved_by=${principalId},approved_until=${until}::timestamptz where id=${id}::uuid and state in ('draft','approved')`,
      );
      await targetAudit("mail.draft.approved", id, "EXACT_DRAFT_15_MINUTES");
      return draft(id);
    },
    async queue(id) {
      await draft(id);
      await tx.execute(
        sql`update mail_draft set state='queued' where id=${id}::uuid and state='approved'`,
      );
      await targetAudit("mail.send.queued", id, "OWNER_APPROVAL_BOUND");
      return draft(id);
    },
  };
}

export function createMailAccessRepository(
  db: CommandryDatabase,
  options: { environment: string; now?: () => Date },
): MailAccessPort {
  const clock = options.now ?? (() => new Date());
  return {
    async withAccess(authority, operation, action) {
      const snapshot = foundationDigest(authority),
        capability = mailCapability(operation);
      const outcome = await db.transaction(async (tx) => {
        let principalId: string,
          scope: string | null = null,
          owner = false;
        let authorize: () => Promise<void>;
        let deadline: string;
        let auditEnvironment = options.environment;
        if (authority.kind === "owner") {
          owner = true;
          deadline = authority.identity.expiresAt;
          principalId = authority.identity.principalId;
          authorize = () =>
            requireWorkflowOwnerSession(
              tx,
              authority.identity,
              clock(),
              true,
            ).then(() => undefined);
        } else {
          const req = authority.request;
          const [row] = await tx
            .select()
            .from(foundationClient)
            .where(eq(foundationClient.tokenDigest, req.tokenDigest))
            .for("share");
          if (!row) throw new FoundationError("INVALID_CREDENTIAL");
          const { tokenDigest: _digest, ...metadata } = row;
          void _digest;
          const client = foundationClientSchema.parse({
            ...metadata,
            schemaVersion: 1,
            createdAt: row.createdAt.toISOString(),
            expiresAt: row.expiresAt.toISOString(),
            revokedAt: row.revokedAt?.toISOString() ?? null,
          });
          deadline = client.expiresAt;
          auditEnvironment = client.environment;
          principalId = "foundation-client:" + row.id;
          scope = row.projectId;
          authorize = async () => {
            if (
              !capability ||
              req.operation !== capability ||
              req.environment !== options.environment
            )
              throw new FoundationError("FORBIDDEN");
            requireFoundationGrant(client, { ...req, now: clock() });
          };
        }
        let failure: unknown, value: unknown;
        try {
          value = await tx.transaction(async (sp) => {
            await authorize();
            const v = await action(
              records(sp, principalId, scope, owner, clock),
            );
            if (foundationDigest(authority) !== snapshot)
              throw new MailError("FORBIDDEN");
            await authorize();
            return v;
          });
        } catch (error) {
          if (!(
            error instanceof MailError ||
            error instanceof FoundationError ||
            error instanceof ZodError
          ))
            throw error;
          failure = error;
        }
        const code =
          failure instanceof MailError || failure instanceof FoundationError
            ? failure.code
            : failure
              ? "INVALID_INPUT"
              : "OK";
        await tx.insert(mailAudit).values({
          id: randomUUID(),
          principalId,
          projectId: scope,
          operation: "mail." + operation,
          decision: failure ? "denied" : "allowed",
          code,
        });
        if (authority.kind === "machine")
          await tx.insert(foundationAudit).values({
            id: randomUUID(),
            projectId: scope!,
            environment: auditEnvironment,
            principalId,
            clientId: principalId.slice(18),
            operation: capability ?? "mail.manage",
            targetId: null,
            correlationId: authority.request.correlationId,
            decision: failure ? "denied" : "allowed",
            code,
          });
        return { failure, value, deadline };
      });
      if (outcome.failure) throw outcome.failure;
      if (Date.parse(outcome.deadline) <= clock().getTime())
        throw new FoundationError("EXPIRED");
      if (foundationDigest(authority) !== snapshot)
        throw new MailError("FORBIDDEN");
      return outcome.value as Awaited<ReturnType<typeof action>>;
    },
  };
}
