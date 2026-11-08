import { randomUUID } from "node:crypto";
import {
  MAIL_DOMAINS,
  mailAttachmentQuerySchema,
  mailCreateAccountSchema,
  mailDraftInputSchema,
  mailIdSchema,
  mailPageQuerySchema,
  mailReadSchema,
  mailRulesInputSchema,
  mailTriageSchema,
  type MailAccount,
  type MailAttachment,
  type MailContent,
  type MailCounts,
  type MailDraft,
  type MailDraftInput,
  type MailInbox,
  type MailMessage,
  type MailMetadata,
  type MailPage,
  type MailPageQuery,
  type MailRule,
  type MailTriage,
  type MailJob,
} from "@commandry/contracts";
import {
  MailError,
  mailAddress,
  requireMailApproval,
  requireMailIdentity,
} from "@commandry/domain";
import type { FoundationMachineRequest } from "./agent-foundation";
import type { ObservatoryOwnerIdentity } from "./observatory-management";

export type MailOperation =
  | "accounts"
  | "inboxes"
  | "messages"
  | "overview"
  | "read"
  | "attachments"
  | "drafts"
  | "draft"
  | "triage"
  | "rules"
  | "getRules"
  | "account"
  | "approve"
  | "send";
export type MailAuthority =
  | { kind: "owner"; identity: ObservatoryOwnerIdentity }
  | { kind: "machine"; request: FoundationMachineRequest };
export interface MailRecords {
  principalId: string;
  owner: boolean;
  accounts(): Promise<MailAccount[]>;
  account(id: string): Promise<MailAccount>;
  createAccount(input: {
    id: string;
    projectId: string;
    name: string;
    domains: string[];
  }): Promise<MailAccount>;
  messages(query: MailPageQuery): Promise<MailPage<MailMessage>>;
  inboxes(query: MailPageQuery): Promise<MailPage<MailInbox>>;
  counts(query: MailPageQuery): Promise<MailCounts>;
  domainCounts(): Promise<
    (MailCounts & { domain: string; accountId: string })[]
  >;
  message(id: string): Promise<MailMessage>;
  triage(input: MailTriage): Promise<MailMessage>;
  rules(accountId: string): Promise<{ version: number; rules: MailRule[] }>;
  setRules(input: {
    accountId: string;
    expectedVersion: number;
    rules: MailRule[];
  }): Promise<unknown>;
  drafts(query: MailPageQuery): Promise<MailPage<MailDraft>>;
  draft(id: string): Promise<MailDraft>;
  saveDraft(value: MailDraft): Promise<MailDraft>;
  approve(id: string, until: string): Promise<MailDraft>;
  queue(id: string): Promise<MailDraft>;
}
export interface MailAccessPort {
  withAccess<T>(
    authority: MailAuthority,
    operation: MailOperation,
    action: (records: MailRecords) => Promise<T>,
  ): Promise<T>;
}
export interface MailProvider {
  domains(): Promise<string[]>;
  list(
    direction: "received" | "sent",
    cursor: string | null,
  ): Promise<MailPage<MailMetadata>>;
  read(
    direction: "received" | "sent",
    externalId: string,
  ): Promise<MailContent>;
  attachments(
    direction: "received" | "sent",
    externalId: string,
    cursor: string | null,
    attachmentId?: string,
  ): Promise<MailPage<MailAttachment>>;
  send(draft: MailDraft): Promise<{ id: string }>;
}
export function mailCapability(
  operation: MailOperation,
): "mail.read" | "mail.triage" | "mail.draft" | "mail.send" | null {
  if (["account", "approve", "rules"].includes(operation)) return null;
  return operation === "triage"
    ? "mail.triage"
    : operation === "draft"
      ? "mail.draft"
      : operation === "send"
        ? "mail.send"
        : "mail.read";
}
export function createMailService(
  port: MailAccessPort,
  provider: (account: MailAccount) => MailProvider,
  options: { now?: () => Date } = {},
) {
  const clock = options.now ?? (() => new Date());
  return {
    async execute(
      authority: MailAuthority,
      operation: MailOperation,
      raw: unknown,
    ): Promise<unknown> {
      return port.withAccess(authority, operation, async (r) => {
        if (mailCapability(operation) === null && !r.owner)
          throw new MailError("FORBIDDEN");
        switch (operation) {
          case "accounts":
            return {
              items: await r.accounts(),
              mxroute: {
                state: "disconnected",
                address: "contact@isaacurman.com",
                reason:
                  "Independent MXroute IMAP credentials are not configured. Direct mailbox mail is outside this index.",
              },
            };
          case "account": {
            const input = mailCreateAccountSchema.parse(raw);
            return r.createAccount({
              ...input,
              id: randomUUID(),
              domains: [...MAIL_DOMAINS],
            });
          }
          case "messages":
            return r.messages(mailPageQuerySchema.parse(raw));
          case "inboxes":
            return r.inboxes(mailPageQuerySchema.parse(raw));
          case "overview": {
            const query = mailPageQuerySchema.parse(raw);
            return {
              domains: await r.domainCounts(),
              counts: await r.counts(query),
              recent: await r.messages({ ...query, limit: 5, cursor: null }),
              accounts: await r.accounts(),
              population:
                "Indexed provider-accessible messages. Received and sent are distinct messages; multi-recipient mail counts once in the unified total. Address totals overlap.",
              asOf: clock().toISOString(),
            };
          }
          case "read": {
            const input = mailReadSchema.parse(raw),
              message = await r.message(input.id);
            const original = await provider(
              await r.account(message.accountId),
            ).read(message.direction, message.externalId);
            const text = original.text,
              html = original.html,
              total = Math.max(text?.length ?? 0, html?.length ?? 0);
            return {
              message: { ...message, ...original.metadata },
              content: {
                text:
                  text?.slice(input.offset, input.offset + input.limit) ?? null,
                html:
                  html?.slice(input.offset, input.offset + input.limit) ?? null,
                headers: original.headers,
                offset: input.offset,
                nextOffset:
                  input.offset + input.limit < total
                    ? input.offset + input.limit
                    : null,
                totalCharacters: total,
              },
              source: "provider",
              untrusted: true,
            };
          }
          case "attachments": {
            const input = mailAttachmentQuerySchema.parse(raw),
              m = await r.message(input.id);
            return provider(await r.account(m.accountId)).attachments(
              m.direction,
              m.externalId,
              input.cursor,
              input.attachmentId,
            );
          }
          case "triage":
            return r.triage(mailTriageSchema.parse(raw));
          case "getRules": {
            const input = mailIdSchema.parse(raw);
            await r.account(input.id);
            return r.rules(input.id);
          }
          case "rules": {
            const input = mailRulesInputSchema.parse(raw);
            await r.account(input.accountId);
            return r.setRules(input);
          }
          case "drafts":
            return r.drafts(mailPageQuerySchema.parse(raw));
          case "draft": {
            const input = raw as { key: unknown; draft: unknown };
            const id = mailIdSchema.parse({ id: input?.key }).id;
            const draft: MailDraftInput = mailDraftInputSchema.parse(
              input?.draft,
            );
            const account = await r.account(draft.accountId);
            requireMailIdentity(account, draft.from, clock());
            let inReplyTo: string | null = null,
              references: string[] = [];
            if (draft.supersedesId) {
              const previous = await r.draft(draft.supersedesId);
              if (previous.accountId !== draft.accountId)
                throw new MailError("VERSION_CONFLICT");
              if (previous.state === "superseded") {
                const replay = await r.draft(id);
                if (replay.supersedesId !== previous.id)
                  throw new MailError("VERSION_CONFLICT");
              } else if (
                !["draft", "approved", "failed"].includes(previous.state)
              )
                throw new MailError("VERSION_CONFLICT");
            }
            if (draft.replyToId) {
              const source = await r.message(draft.replyToId);
              if (source.accountId !== draft.accountId)
                throw new MailError("FORBIDDEN");
              const original = await provider(account).read(
                source.direction,
                source.externalId,
              );
              const own =
                source.direction === "received"
                  ? [
                      ...source.to,
                      ...source.cc,
                      ...source.bcc,
                      ...source.receivedFor,
                    ].map(mailAddress)
                  : [mailAddress(source.from)];
              if (!own.includes(draft.from))
                throw new MailError("IDENTITY_UNVERIFIED");
              if (source.direction === "received") {
                const replyTo = original.metadata.replyTo.length
                  ? original.metadata.replyTo
                  : [source.from];
                if (!draft.to.some((a) => replyTo.map(mailAddress).includes(a)))
                  throw new MailError("INVALID_INPUT");
              }
              inReplyTo = original.metadata.messageId;
              references = [
                ...original.metadata.references,
                ...(inReplyTo ? [inReplyTo] : []),
              ].slice(-100);
            }
            return r.saveDraft({
              ...draft,
              id,
              createdBy: r.principalId,
              createdAt: clock().toISOString(),
              state: "draft",
              approvedBy: null,
              approvedUntil: null,
              providerId: null,
              error: null,
              attemptedAt: null,
              inReplyTo,
              references,
            });
          }
          case "approve": {
            const { id } = mailIdSchema.parse(raw),
              d = await r.draft(id);
            requireMailIdentity(await r.account(d.accountId), d.from, clock());
            if (!["draft", "approved"].includes(d.state))
              throw new MailError("VERSION_CONFLICT");
            return r.approve(
              id,
              new Date(clock().getTime() + 15 * 60000).toISOString(),
            );
          }
          case "send": {
            const { id } = mailIdSchema.parse(raw),
              d = await r.draft(id);
            if (["accepted", "queued", "sending"].includes(d.state)) return d;
            requireMailApproval(d, clock());
            requireMailIdentity(await r.account(d.accountId), d.from, clock());
            return r.queue(id);
          }
        }
      });
    },
  };
}

export interface MailWorkerRecords {
  account: MailAccount;
  rules: MailRule[];
  upsert(
    metadata: MailMetadata,
    observation?: { status: string; at: string },
  ): Promise<void>;
  checkpoint(
    direction: "received" | "sent",
    cursor: string | null,
    verifiedDomains: string[],
  ): Promise<void>;
  events(
    externalId: string,
    direction: "received" | "sent",
  ): Promise<{ id: string; status: string; at: string }[]>;
  completeEvents(ids: string[]): Promise<void>;
}
export interface MailWorkerPort {
  withAccount<T>(
    id: string,
    callback: (records: MailWorkerRecords) => Promise<T>,
  ): Promise<T>;
  failAccount(
    id: string,
    code: string,
    event?: { externalId: string; direction: "sent" | "received" },
  ): Promise<void>;
  pending(): Promise<MailJob[]>;
  claimSend(id: string): Promise<{
    draft: MailDraft;
    account: MailAccount;
    retrying: boolean;
  } | null>;
  finishSend(
    id: string,
    result: {
      providerId?: string;
      error?: string;
      uncertain?: boolean;
      retryable?: boolean;
    },
  ): Promise<void>;
}
/** One provider page per invocation. Transport owns retries; no mailbox loop in HTTP. */
export function createMailWorker(
  port: MailWorkerPort,
  provider: (account: MailAccount) => MailProvider,
  clock = () => new Date(),
) {
  return {
    pending: () => port.pending(),
    async process(job: MailJob): Promise<void> {
      if (job.kind === "send") {
        const claim = await port.claimSend(job.id);
        if (!claim) return;
        const { draft, account, retrying } = claim;
        try {
          requireMailApproval(draft, clock());
          const live = await provider(account).domains();
          requireMailIdentity(
            {
              ...account,
              verifiedAt: clock().toISOString(),
              verifiedDomains: live,
            },
            draft.from,
            clock(),
          );
          if (
            draft.attemptedAt &&
            clock().getTime() - Date.parse(draft.attemptedAt) >= 23 * 3600000
          )
            throw new MailError("RECONCILIATION_REQUIRED");
          const result = await provider(account).send(draft);
          await port.finishSend(draft.id, { providerId: result.id });
        } catch (error) {
          const code = error instanceof MailError ? error.code : "UNAVAILABLE";
          await port.finishSend(draft.id, {
            error: code,
            uncertain:
              retrying ||
              code === "UNAVAILABLE" ||
              code === "RECONCILIATION_REQUIRED",
            retryable: code === "UNAVAILABLE",
          });
        }
        return;
      }
      try {
        await port.withAccount(job.accountId, async (r) => {
          if (!r.account.enabled) return;
          const p = provider(r.account);
          if (job.kind === "reconcile") {
            const verified = await p.domains();
            const cursor =
              job.direction === "received"
                ? r.account.receivedCursor
                : r.account.sentCursor;
            const page = await p.list(job.direction, cursor);
            for (const m of page.items) await r.upsert(m);
            if (page.nextCursor !== null && page.nextCursor === cursor)
              throw new MailError("UNAVAILABLE");
            await r.checkpoint(job.direction, page.nextCursor, verified);
          } else {
            const original = await p.read(job.direction, job.externalId);
            const events = await r.events(job.externalId, job.direction);
            const latest = events.at(-1);
            await r.upsert(
              original.metadata,
              latest ? { status: latest.status, at: latest.at } : undefined,
            );
            await r.completeEvents(events.map((e) => e.id));
          }
        });
      } catch (error) {
        await port.failAccount(
          job.accountId,
          error instanceof MailError ? error.code : "UNAVAILABLE",
          job.kind === "hydrate"
            ? { externalId: job.externalId, direction: job.direction }
            : undefined,
        );
        throw error;
      }
    },
  };
}
