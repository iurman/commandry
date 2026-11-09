import { createHash, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import {
  mailMetadataSchema,
  type MailJob,
  type MailMetadata,
  type MailRule,
} from "@commandry/contracts";
import {
  MailError,
  mailAddress,
  mailDomain,
  mailAttentionReasons,
} from "@commandry/domain";
import type { MailWorkerPort } from "@commandry/application";
import type { CommandryDatabase } from "./client";
import type { FoundationTransaction } from "./foundation-record-repository";
import { mailAccountRecord, mailDraftRecord } from "./email-repository";
import { mailAudit } from "./email-schema";

async function upsert(
  tx: FoundationTransaction,
  accountId: string,
  domains: string[],
  rules: MailRule[],
  raw: MailMetadata,
  observation?: { status: string; at: string },
) {
  let m = mailMetadataSchema.parse(raw);
  const participants =
    m.direction === "received"
      ? [...m.to, ...m.cc, ...m.bcc, ...m.receivedFor]
      : [m.from];
  const addresses = [
    ...new Set(
      participants
        .map(mailAddress)
        .filter((a) => a && domains.includes(mailDomain(a))),
    ),
  ];
  if (!addresses.length) return;
  const existing = await tx.execute(
    sql`select id,metadata,status_at from mail_message where account_id=${accountId}::uuid and external_id=${m.externalId}::uuid and direction=${m.direction} for update`,
  );
  const old = existing.rows[0],
    id = old ? String(old.id) : randomUUID();
  const previous = old ? mailMetadataSchema.parse(old.metadata) : null;
  const statusAt =
    observation &&
    (!old?.status_at ||
      new Date(String(old.status_at)).getTime() <= Date.parse(observation.at))
      ? new Date(observation.at)
      : (old?.status_at ?? null);
  if (previous) {
    m = {
      ...m,
      inReplyTo: m.inReplyTo ?? previous.inReplyTo,
      references: m.references.length ? m.references : previous.references,
    };
    if (old?.status_at) m.status = previous.status;
  }
  if (
    observation &&
    (!old?.status_at ||
      new Date(String(old.status_at)).getTime() <= Date.parse(observation.at))
  )
    m.status = observation.status;
  const reasons = mailAttentionReasons(m, rules);
  await tx.execute(
    sql`insert into mail_message(id,account_id,external_id,direction,occurred_at,metadata,unread,reasons,status_at) values(${id}::uuid,${accountId}::uuid,${m.externalId}::uuid,${m.direction},${m.occurredAt}::timestamptz,${JSON.stringify(m)}::jsonb,${m.direction === "received" && !m.imap?.seen},${JSON.stringify(reasons)}::jsonb,${statusAt}::timestamptz) on conflict(account_id,external_id,direction) do update set metadata=excluded.metadata,reasons=excluded.reasons,status_at=excluded.status_at`,
  );
  for (const address of addresses)
    await tx.execute(
      sql`insert into mail_membership(message_id,account_id,address,domain) values(${id}::uuid,${accountId}::uuid,${address},${mailDomain(address)}) on conflict do nothing`,
    );
}
export function createMailWorkerRepository(
  db: CommandryDatabase,
  clock = () => new Date(),
): MailWorkerPort {
  return {
    async withAccount(id, callback) {
      return db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${"mail-account:" + id},0))`,
        );
        const rows = await tx.execute(
            sql`select * from mail_account where id=${id}::uuid for update`,
          ),
          row = rows.rows[0];
        if (!row) throw new MailError("NOT_FOUND");
        const account = mailAccountRecord(row);
        return callback({
          account,
          rules: row.rules as MailRule[],
          upsert: (m, observation) =>
            upsert(
              tx,
              id,
              account.domains,
              row.rules as MailRule[],
              m,
              observation,
            ),
          async checkpoint(direction, cursor, verifiedDomains) {
            const values = sql`verified_domains=${JSON.stringify(verifiedDomains.filter((d) => account.domains.includes(d)))}::jsonb,verified_at=${clock()}::timestamptz,last_synced_at=${clock()}::timestamptz,error=null`;
            await tx.execute(
              direction === "received"
                ? sql`update mail_account set ${values},received_cursor=${cursor},received_complete=received_complete or ${cursor === null},received_due=${new Date(clock().getTime() + (cursor ? 1000 : 300000))}::timestamptz where id=${id}::uuid`
                : sql`update mail_account set ${values},sent_cursor=${cursor},sent_complete=sent_complete or ${cursor === null},sent_due=${new Date(clock().getTime() + (cursor ? 1000 : 300000))}::timestamptz where id=${id}::uuid`,
            );
          },
          async events(externalId, direction) {
            const rows = await tx.execute(
              sql`select id,status,occurred_at from mail_event where account_id=${id}::uuid and external_id=${externalId}::uuid and direction=${direction} and not processed order by occurred_at,id`,
            );
            return rows.rows.map((r) => ({
              id: String(r.id),
              status: String(r.status),
              at: new Date(String(r.occurred_at)).toISOString(),
            }));
          },
          async completeEvents(ids) {
            for (const event of ids)
              await tx.execute(
                sql`update mail_event set processed=true where account_id=${id}::uuid and id=${event}`,
              );
          },
        });
      });
    },
    async failAccount(id, code, event) {
      await db.execute(
        sql`update mail_account set error=${code},received_due=greatest(received_due,now()+interval '1 minute'),sent_due=greatest(sent_due,now()+interval '1 minute') where id=${id}::uuid`,
      );
      if (event)
        await db.execute(
          sql`update mail_event set error=${code},next_attempt_at=now()+interval '5 minutes' where account_id=${id}::uuid and external_id=${event.externalId}::uuid and direction=${event.direction} and not processed`,
        );
    },
    async pending() {
      return db.transaction(async (tx) => {
        const jobs: MailJob[] = [];
        const accounts = await tx.execute(
          sql`select * from mail_account where enabled and (received_due<=now() or sent_due<=now()) order by least(received_due,sent_due),id limit 5 for update skip locked`,
        );
        for (const row of accounts.rows) {
          const id = String(row.id);
          if (new Date(String(row.received_due)) <= clock()) {
            jobs.push({
              kind: "reconcile",
              accountId: id,
              direction: "received",
            });
            await tx.execute(
              sql`update mail_account set received_due=now()+interval '1 minute' where id=${id}::uuid`,
            );
          }
          if (new Date(String(row.sent_due)) <= clock()) {
            jobs.push({ kind: "reconcile", accountId: id, direction: "sent" });
            await tx.execute(
              sql`update mail_account set sent_due=now()+interval '1 minute' where id=${id}::uuid`,
            );
          }
        }
        const events = await tx.execute(
          sql`select e.id,e.account_id,e.external_id,e.direction from mail_event e join mail_account a on a.id=e.account_id where not e.processed and a.enabled and e.next_attempt_at<=now() order by e.occurred_at,e.id limit 1 for update of e skip locked`,
        );
        for (const row of events.rows) {
          await tx.execute(
            sql`update mail_event set next_attempt_at=now()+interval '5 minutes' where account_id=${String(row.account_id)}::uuid and id=${String(row.id)}`,
          );
          jobs.push({
            kind: "hydrate",
            accountId: String(row.account_id),
            externalId: String(row.external_id),
            direction: row.direction as "received" | "sent",
          });
        }
        const drafts = await tx.execute(
          sql`select id from mail_draft where (state='queued' and (lease_until is null or lease_until<now())) or (state='sending' and lease_until<now()) order by created_at,id limit 2`,
        );
        for (const row of drafts.rows)
          jobs.push({ kind: "send", id: String(row.id) });
        return jobs;
      });
    },
    async claimSend(id) {
      return db.transaction(async (tx) => {
        const rows = await tx.execute(
            sql`select * from mail_draft where id=${id}::uuid for update`,
          ),
          row = rows.rows[0];
        if (!row || !["queued", "sending"].includes(String(row.state)))
          return null;
        if (
          row.state === "sending" &&
          row.lease_until &&
          new Date(String(row.lease_until)) > clock()
        )
          return null;
        const accounts = await tx.execute(
          sql`select * from mail_account where id=${String(row.account_id)}::uuid for share`,
        );
        if (!accounts.rows[0]) throw new MailError("NOT_FOUND");
        const updated = await tx.execute(
          sql`update mail_draft set state='sending',attempted_at=coalesce(attempted_at,${clock()}::timestamptz),lease_until=${new Date(clock().getTime() + 60000)}::timestamptz where id=${id}::uuid returning *`,
        );
        await tx.insert(mailAudit).values({
          id: randomUUID(),
          principalId: "worker:mail",
          projectId: String(accounts.rows[0].project_id),
          operation: "mail.send.attempted",
          targetId: id,
          decision: "allowed",
          code: "SENDING",
        });
        return {
          draft: mailDraftRecord(updated.rows[0]!),
          retrying: Boolean(row.attempted_at),
          account: mailAccountRecord(accounts.rows[0]),
        };
      });
    },
    async finishSend(id, result) {
      await db.transaction(async (tx) => {
        const r = await tx.execute(
            sql`select * from mail_draft where id=${id}::uuid for update`,
          ),
          row = r.rows[0];
        if (!row || row.state !== "sending") return;
        const d = mailDraftRecord(row);
        const canRetry =
          result.retryable &&
          result.uncertain &&
          d.approvedUntil &&
          Date.parse(d.approvedUntil) > clock().getTime() &&
          d.attemptedAt &&
          clock().getTime() - Date.parse(d.attemptedAt) < 23 * 3600000;
        const state = result.providerId
          ? "accepted"
          : canRetry
            ? "queued"
            : result.uncertain
              ? "uncertain"
              : "failed";
        await tx.execute(
          sql`update mail_draft set state=${state},provider_id=${result.providerId ?? null}::uuid,error=${result.error ?? null},lease_until=${canRetry ? new Date(clock().getTime() + 60000) : null}::timestamptz where id=${id}::uuid`,
        );
        await tx.insert(mailAudit).values({
          id: randomUUID(),
          principalId: "worker:mail",
          operation: "mail.send." + state,
          targetId: id,
          decision: result.providerId ? "allowed" : "denied",
          code: result.error ?? "PROVIDER_ACCEPTED",
        });
        if (result.providerId) {
          const accounts = await tx.execute(
              sql`select * from mail_account where id=${d.accountId}::uuid`,
            ),
            a = accounts.rows[0]!;
          await upsert(
            tx,
            d.accountId,
            a.domains as string[],
            a.rules as MailRule[],
            {
              externalId: result.providerId,
              direction: "sent",
              from: d.from,
              to: d.to,
              cc: d.cc,
              bcc: d.bcc,
              replyTo: [],
              receivedFor: [],
              subject: d.subject,
              occurredAt: clock().toISOString(),
              messageId: null,
              inReplyTo: d.inReplyTo,
              references: d.references,
              status: "sent",
              attachmentCount: 0,
            },
          );
        }
      });
    },
  };
}

/** Metadata-only inbox. Persist before acknowledging so provider retries remain safe. */
export async function acceptMailWebhook(
  db: CommandryDatabase,
  input: {
    accountId: string;
    id: string;
    raw: string;
    externalId: string;
    direction: "sent" | "received";
    status: string;
    occurredAt: string;
  },
) {
  const digest = createHash("sha256").update(input.raw).digest("hex");
  await db.transaction(async (tx) => {
    const accounts = await tx.execute(
      sql`select id from mail_account where id=${input.accountId}::uuid and provider='resend' and enabled for share`,
    );
    if (!accounts.rows.length) throw new MailError("NOT_FOUND");
    const result = await tx.execute(
      sql`insert into mail_event(account_id,id,digest,external_id,direction,status,occurred_at) values(${input.accountId}::uuid,${input.id},${digest},${input.externalId}::uuid,${input.direction},${input.status},${input.occurredAt}::timestamptz) on conflict(account_id,id) do nothing returning id`,
    );
    if (!result.rows.length) {
      const old = await tx.execute(
        sql`select digest from mail_event where account_id=${input.accountId}::uuid and id=${input.id}`,
      );
      if (old.rows[0]?.digest !== digest)
        throw new MailError("VERSION_CONFLICT");
    }
  });
}
