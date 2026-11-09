/** Real runtime-role PostgreSQL and application/worker services. Only Resend is substituted. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { eq, sql } from "drizzle-orm";
import {
  createFoundationOwnerService,
  createMailService,
  createMailWorker,
  type MailAuthority,
  type MailProvider,
} from "@commandry/application";
import {
  MAIL_DOMAINS,
  type MailAccount,
  type MailDraft,
  type MailInbox,
  type MailMessage,
  type MailMetadata,
  type MailOverview,
  type MailPage,
} from "@commandry/contracts";
import {
  FoundationError,
  MailError,
  foundationTokenDigest,
} from "@commandry/domain";
import { createDatabase } from "./client";
import { createMailAccessRepository } from "./email-repository";
import {
  createMailWorkerRepository,
  acceptMailWebhook,
} from "./email-worker-repository";
import { createFoundationAccessRepository } from "./foundation-access-repository";
import { foundationClient } from "./foundation-schema";
import { project, session, user } from "./schema";

const adminUrl = process.env.COMMANDRY_TEST_DATABASE_URL,
  runtimePassword = process.env.COMMANDRY_TEST_RUNTIME_PASSWORD;
if (!adminUrl || !runtimePassword)
  throw new Error("Use the disposable PostgreSQL harness");
const runtimeUrl = new URL(adminUrl);
runtimeUrl.username = "commandry_app_integration";
runtimeUrl.password = runtimePassword;
const denied = (code: string) => (e: unknown) =>
  (e instanceof FoundationError || e instanceof MailError) && e.code === code;

test(
  "governed email with real SQL, provider replay/failure, address counts and durable sends",
  { timeout: 120000 },
  async (t) => {
    const admin = createDatabase({ connectionString: adminUrl, max: 3 }),
      runtime = createDatabase({
        connectionString: runtimeUrl.toString(),
        max: 2,
      });
    const projectId = randomUUID(),
      otherProject = randomUUID(),
      userId = randomUUID(),
      sessionId = randomUUID();
    let time = Date.now();
    const now = () => new Date(time),
      expiry = new Date(time + 3600000);
    await admin.db.insert(project).values([
      { id: projectId, name: "Synthetic email hub" },
      { id: otherProject, name: "Excluded email project" },
    ]);
    await admin.db.insert(user).values({
      id: userId,
      name: "Synthetic mail owner",
      email: userId + "@example.test",
    });
    await admin.db.insert(session).values({
      id: sessionId,
      userId,
      token: randomUUID(),
      expiresAt: expiry,
    });
    const identity = {
      principalId: "user:" + userId,
      sessionId,
      expiresAt: expiry.toISOString(),
    };
    const owner: MailAuthority = { kind: "owner", identity };
    const issueOwner = createFoundationOwnerService(
      createFoundationAccessRepository(runtime.db, { now }),
      identity,
      { environment: "test", now },
    );
    const issue = async (
      operations: (
        | "mail.read"
        | "mail.triage"
        | "mail.draft"
        | "mail.send"
        | "foundation.read"
      )[],
      scope = projectId,
    ) =>
      issueOwner.createClient(
        {
          projectId: scope,
          name: "Synthetic mail client",
          operations,
          environment: "test",
          ttlSeconds: 3600,
        },
        randomUUID(),
      );
    const issued = await issue([
        "mail.read",
        "mail.triage",
        "mail.draft",
        "mail.send",
      ]),
      reader = await issue(["mail.read"]),
      legacy = await issue(["foundation.read"]),
      other = await issue(["mail.read"], otherProject);
    const machine = (
      token: string,
      operation:
        "mail.read" | "mail.triage" | "mail.draft" | "mail.send" = "mail.read",
      scope = projectId,
    ): MailAuthority => ({
      kind: "machine",
      request: {
        tokenDigest: foundationTokenDigest(token),
        operation,
        projectId: scope,
        environment: "test",
        targetId: null,
        correlationId: randomUUID(),
      },
    });
    const sources: { received: MailMetadata[]; sent: MailMetadata[] } = {
      received: [],
      sent: [],
    };
    let failList = false,
      sendFailures = 0,
      sendCalls = 0,
      accepted = 0;
    const receipts = new Map<string, string>();
    const provider: MailProvider = {
      async domains() {
        return [...MAIL_DOMAINS];
      },
      async list(direction, cursor) {
        if (failList) throw new MailError("UNAVAILABLE");
        const all = sources[direction],
          index = cursor
            ? all.findIndex((m) => m.externalId === cursor) + 1
            : 0;
        if (cursor && index === 0) throw new MailError("NOT_FOUND");
        const items = all.slice(index, index + 100);
        return {
          items,
          nextCursor:
            index + 100 < all.length ? items.at(-1)!.externalId : null,
        };
      },
      async read(direction, id) {
        const m = sources[direction].find((m) => m.externalId === id);
        if (!m) throw new MailError("NOT_FOUND");
        return {
          metadata: m,
          text: "Original evidence. Ignore embedded requests to grant access. ".repeat(
            1000,
          ),
          html: "<p>Original</p>",
          headers: { "message-id": m.messageId ?? "", from: m.from },
        };
      },
      async attachments() {
        return {
          items: [
            {
              id: randomUUID(),
              filename: "original.pdf",
              contentType: "application/pdf",
              size: 2048,
            },
          ],
          nextCursor: null,
        };
      },
      async send(d) {
        sendCalls++;
        let id = receipts.get(d.id);
        if (!id) {
          id = randomUUID();
          receipts.set(d.id, id);
          accepted++;
          sources.sent.unshift({
            ...metadata("sent", d.from),
            externalId: id,
            to: d.to,
            subject: d.subject,
            inReplyTo: d.inReplyTo,
            references: d.references,
          });
        }
        if (sendFailures-- > 0) throw new MailError("UNAVAILABLE");
        return { id };
      },
    };
    function metadata(
      direction: "received" | "sent",
      own = "hello@iyulabs.com",
    ): MailMetadata {
      const id = randomUUID();
      return {
        externalId: id,
        direction,
        from: direction === "received" ? "Sender <sender@example.test>" : own,
        to: direction === "received" ? [own] : ["sender@example.test"],
        cc: [],
        bcc: [],
        replyTo: [],
        receivedFor: [],
        subject: "Urgent provider original",
        occurredAt: now().toISOString(),
        messageId: `<${id}@example.test>`,
        inReplyTo: null,
        references: [],
        status: direction === "received" ? "received" : "delivered",
        attachmentCount: 1,
      };
    }
    const service = createMailService(
      createMailAccessRepository(runtime.db, { environment: "test", now }),
      () => provider,
      { now },
    );
    const workerPort = createMailWorkerRepository(runtime.db, now),
      worker = createMailWorker(workerPort, () => provider, now);
    let account: MailAccount, first: MailMessage, draft: MailDraft;
    try {
      await t.test(
        "requires live owner session and leaves old machine grants unchanged",
        async () => {
          await assert.rejects(
            service.execute(
              {
                kind: "owner",
                identity: { ...identity, sessionId: randomUUID() },
              },
              "accounts",
              {},
            ),
            denied("FORBIDDEN"),
          );
          await assert.rejects(
            service.execute(machine(legacy.token), "accounts", {}),
            denied("FORBIDDEN"),
          );
          account = (await service.execute(owner, "account", {
            projectId,
            name: "Primary fixture email",
          })) as MailAccount;
          await assert.rejects(
            service.execute(machine(issued.token), "approve", {
              id: randomUUID(),
            }),
            denied("FORBIDDEN"),
          );
        },
      );
      await t.test(
        "indexes all seven domains and unknown actual addresses without forwarded duplicates",
        async () => {
          for (const domain of MAIL_DOMAINS)
            sources.received.push(metadata("received", "unlisted@" + domain));
          sources.received[0]!.cc = [
            "second@iyulabs.com",
            "unlisted@iyulabs.com",
          ];
          sources.received.push({
            ...metadata("received", "not-ours@excluded.test"),
            subject: "Excluded account domain",
          });
          sources.sent.push(metadata("sent"));
          await worker.process({
            kind: "reconcile",
            accountId: account.id,
            direction: "received",
          });
          await worker.process({
            kind: "reconcile",
            accountId: account.id,
            direction: "sent",
          });
          const view = (await service.execute(
            machine(issued.token),
            "overview",
            {},
          )) as MailOverview;
          assert.deepEqual(view.counts, {
            received: 7,
            sent: 1,
            unread: 7,
            attention: 8,
          });
          assert.equal(view.domains.length, 7);
          assert.equal(
            view.domains.find((d) => d.domain === "iyulabs.com")!.received,
            1,
          );
          const inboxes = (await service.execute(owner, "inboxes", {
            limit: 100,
          })) as MailPage<MailInbox>;
          assert.equal(inboxes.items.length, 9);
          assert.equal(
            inboxes.items.find((i) => i.address === "second@iyulabs.com")!
              .received,
            1,
          );
          const index = (await service.execute(owner, "messages", {
            direction: "received",
          })) as MailPage<MailMessage>;
          first = index.items.find((m) =>
            m.to.includes("unlisted@iyulabs.com"),
          )!;
          assert.ok(first);
          const before = await admin.db.execute(
            sql`select count(*)::int n from mail_message`,
          );
          await worker.process({
            kind: "reconcile",
            accountId: account.id,
            direction: "received",
          });
          assert.equal(
            (
              await admin.db.execute(
                sql`select count(*)::int n from mail_message`,
              )
            ).rows[0]!.n,
            before.rows[0]!.n,
          );
          assert.equal(
            (
              (await service.execute(
                machine(other.token, "mail.read", otherProject),
                "messages",
                {},
              )) as MailPage<MailMessage>
            ).items.length,
            0,
          );
          await assert.rejects(
            service.execute(
              machine(other.token, "mail.read", otherProject),
              "read",
              { id: first.id },
            ),
            denied("NOT_FOUND"),
          );
        },
      );
      await t.test(
        "keeps local triage on reconciliation, chunks originals and blocks missing write grants",
        async () => {
          await assert.rejects(
            service.execute(machine(reader.token, "mail.triage"), "triage", {
              id: first.id,
              expectedVersion: first.version,
              attention: "resolved",
            }),
            denied("FORBIDDEN"),
          );
          await service.execute(
            machine(issued.token, "mail.triage"),
            "triage",
            {
              id: first.id,
              expectedVersion: first.version,
              unread: false,
              attention: "resolved",
              summary:
                "Cited original message " +
                first.id +
                "; unverified local triage.",
            },
          );
          await assert.rejects(
            service.execute(machine(issued.token, "mail.triage"), "triage", {
              id: first.id,
              expectedVersion: first.version,
              attention: "open",
            }),
            denied("VERSION_CONFLICT"),
          );
          await worker.process({
            kind: "reconcile",
            accountId: account.id,
            direction: "received",
          });
          const read = (await service.execute(owner, "read", {
            id: first.id,
            limit: 100,
          })) as {
            message: MailMessage;
            content: { text: string; nextOffset: number };
          };
          assert.equal(read.message.unread, false);
          assert.equal(read.message.attention, "resolved");
          assert.equal(read.message.annotation?.verification, "unverified");
          assert.equal(read.content.text.length, 100);
          assert.equal(read.content.nextOffset, 100);
          const second = (await service.execute(owner, "read", {
            id: first.id,
            offset: 100,
            limit: 100,
          })) as { content: { text: string; offset: number } };
          assert.equal(second.content.offset, 100);
          const sourceIndex = sources.received.findIndex(
              (m) => m.externalId === first.externalId,
            ),
            removed = sources.received.splice(sourceIndex, 1)[0]!;
          const unavailable = (await service.execute(owner, "read", {
            id: first.id,
          })) as {
            availability: string;
            message: MailMessage;
            content: { text: null };
          };
          assert.equal(unavailable.availability, "unavailable");
          assert.equal(unavailable.message.from, first.from);
          assert.equal(unavailable.content.text, null);
          sources.received.splice(sourceIndex, 0, removed);
          const view = (await service.execute(
            owner,
            "overview",
            {},
          )) as MailOverview;
          assert.equal(view.counts.unread, 6);
          assert.equal(view.counts.attention, 7);
        },
      );
      await t.test(
        "commits webhook deduplication and applies ordered delivery events without rollback loss",
        async () => {
          const m = sources.sent[0]!,
            event = {
              accountId: account.id,
              id: "msg_delivery",
              raw: '{"signed":"fixture"}',
              externalId: m.externalId,
              direction: "sent" as const,
              status: "bounced",
              occurredAt: now().toISOString(),
            };
          await Promise.all([
            acceptMailWebhook(runtime.db, event),
            acceptMailWebhook(runtime.db, event),
          ]);
          await assert.rejects(
            acceptMailWebhook(runtime.db, {
              ...event,
              raw: "different signed payload",
            }),
            denied("VERSION_CONFLICT"),
          );
          await worker.process({
            kind: "hydrate",
            accountId: account.id,
            externalId: m.externalId,
            direction: "sent",
          });
          await worker.process({
            kind: "reconcile",
            accountId: account.id,
            direction: "sent",
          });
          const page = (await service.execute(owner, "messages", {
            direction: "sent",
          })) as MailPage<MailMessage>;
          assert.equal(page.items[0]!.status, "bounced");
          assert.ok(page.items[0]!.reasons.includes("Delivery: bounced"));
          await acceptMailWebhook(runtime.db, {
            ...event,
            id: "msg_old",
            raw: "older",
            status: "sent",
            occurredAt: new Date(time - 1000).toISOString(),
          });
          await worker.process({
            kind: "hydrate",
            accountId: account.id,
            externalId: m.externalId,
            direction: "sent",
          });
          assert.equal(
            (
              (await service.execute(owner, "messages", {
                direction: "sent",
              })) as MailPage<MailMessage>
            ).items[0]!.status,
            "bounced",
          );
          assert.equal(
            (
              await admin.db.execute(
                sql`select count(*)::int n from mail_event where not processed`,
              )
            ).rows[0]!.n,
            0,
          );
        },
      );
      await t.test(
        "retains partial hydration failure evidence and backs off the durable event",
        async () => {
          const missing = randomUUID();
          await acceptMailWebhook(runtime.db, {
            accountId: account.id,
            id: "msg_missing_original",
            raw: "missing original fixture",
            externalId: missing,
            direction: "received",
            status: "received",
            occurredAt: now().toISOString(),
          });
          await assert.rejects(
            worker.process({
              kind: "hydrate",
              accountId: account.id,
              externalId: missing,
              direction: "received",
            }),
            denied("NOT_FOUND"),
          );
          const accounts = (await service.execute(owner, "accounts", {})) as {
            items: MailAccount[];
          };
          assert.equal(accounts.items[0]!.pendingEvents, 1);
          assert.equal(accounts.items[0]!.failedEvents, 1);
          const jobs = await worker.pending();
          assert.ok(
            !jobs.some(
              (job) => job.kind === "hydrate" && job.externalId === missing,
            ),
          );
        },
      );
      await t.test(
        "rolls back failed pages and exposes cursor continuation beyond one page",
        async () => {
          for (let i = 0; i < 103; i++)
            sources.received.push({
              ...metadata("received", `page-${i}@iyulabs.com`),
              subject: "Pagination control",
            });
          failList = true;
          await assert.rejects(
            worker.process({
              kind: "reconcile",
              accountId: account.id,
              direction: "received",
            }),
            denied("UNAVAILABLE"),
          );
          failList = false;
          assert.equal(
            (
              (await service.execute(owner, "accounts", {})) as {
                items: MailAccount[];
              }
            ).items[0]!.error,
            "UNAVAILABLE",
          );
          await worker.process({
            kind: "reconcile",
            accountId: account.id,
            direction: "received",
          });
          const state = (
            (await service.execute(owner, "accounts", {})) as {
              items: MailAccount[];
            }
          ).items[0]!;
          assert.ok(state.receivedCursor);
          await worker.process({
            kind: "reconcile",
            accountId: account.id,
            direction: "received",
          });
          let cursor: string | null = null,
            count = 0;
          const ids = new Set<string>();
          do {
            const page = (await service.execute(owner, "messages", {
              direction: "received",
              limit: 11,
              cursor,
            })) as MailPage<MailMessage>;
            for (const m of page.items) {
              assert.ok(!ids.has(m.id));
              ids.add(m.id);
            }
            count += page.items.length;
            cursor = page.nextCursor;
          } while (cursor);
          assert.equal(count, 110);
          const page = (await service.execute(owner, "messages", {
            limit: 1,
          })) as MailPage<MailMessage>;
          await assert.rejects(
            service.execute(owner, "messages", {
              limit: 1,
              cursor: page.nextCursor,
              address: "second@iyulabs.com",
            }),
            denied("INVALID_INPUT"),
          );
        },
      );
      await t.test(
        "binds replies, immutable edits, owner approval, audit and permanent send receipts",
        async () => {
          const input = {
            accountId: account.id,
            from: "unlisted@iyulabs.com",
            to: ["sender@example.test"],
            bcc: ["private@example.test"],
            subject: "Re: Reviewed reply",
            text: "Approved fixture reply",
            replyToId: first.id,
          };
          await assert.rejects(
            service.execute(machine(issued.token, "mail.draft"), "draft", {
              key: randomUUID(),
              draft: { ...input, from: "hello@aviune.com" },
            }),
            denied("IDENTITY_UNVERIFIED"),
          );
          const key = randomUUID();
          draft = (await service.execute(
            machine(issued.token, "mail.draft"),
            "draft",
            { key, draft: input },
          )) as MailDraft;
          const replay = (await service.execute(
            machine(issued.token, "mail.draft"),
            "draft",
            { key, draft: input },
          )) as MailDraft;
          assert.equal(replay.id, draft.id);
          await assert.rejects(
            service.execute(machine(issued.token, "mail.send"), "send", {
              id: draft.id,
            }),
            denied("APPROVAL_REQUIRED"),
          );
          await service.execute(owner, "approve", { id: draft.id });
          const edited = (await service.execute(owner, "draft", {
            key: randomUUID(),
            draft: {
              ...input,
              text: "Changed exact body",
              supersedesId: draft.id,
            },
          })) as MailDraft;
          await assert.rejects(
            service.execute(machine(issued.token, "mail.send"), "send", {
              id: draft.id,
            }),
            denied("APPROVAL_REQUIRED"),
          );
          const approved = (await service.execute(owner, "approve", {
            id: edited.id,
          })) as MailDraft;
          assert.equal(approved.approvedBy, identity.principalId);
          await service.execute(machine(issued.token, "mail.send"), "send", {
            id: edited.id,
          });
          sendFailures = 1;
          await Promise.all([
            worker.process({ kind: "send", id: edited.id }),
            worker.process({ kind: "send", id: edited.id }),
          ]);
          time += 61000;
          await worker.process({ kind: "send", id: edited.id });
          assert.equal(accepted, 1);
          assert.equal(sendCalls, 2);
          const final = (await service.execute(
            owner,
            "drafts",
            {},
          )) as MailPage<MailDraft>;
          assert.equal(
            final.items.find((d) => d.id === edited.id)!.state,
            "accepted",
          );
          await worker.process({ kind: "send", id: edited.id });
          assert.equal(sendCalls, 2);
          const bccSearch = (await service.execute(owner, "messages", {
            q: "private@example.test",
          })) as MailPage<MailMessage>;
          assert.equal(bccSearch.items.length, 1);
          const literal = (await service.execute(owner, "messages", {
            q: "%' OR true --",
          })) as MailPage<MailMessage>;
          assert.equal(literal.items.length, 0);
          await assert.rejects(
            admin.db.execute(
              sql`update mail_draft set payload='{}'::jsonb where id=${edited.id}::uuid`,
            ),
          );
          await assert.rejects(admin.db.execute(sql`delete from mail_audit`));
          const audits = await admin.db.execute(
            sql`select principal_id,operation,target_id from mail_audit where target_id=${edited.id}::uuid`,
          );
          assert.ok(
            audits.rows.some(
              (a) =>
                a.operation === "mail.send.queued" &&
                a.principal_id === "foundation-client:" + issued.client.id,
            ),
          );
          const stored = await admin.db.execute(
            sql`select count(*)::int n from mail_message where external_id=${final.items.find((d) => d.id === edited.id)!.providerId}::uuid`,
          );
          assert.equal(stored.rows[0]!.n, 1);
        },
      );
      await t.test(
        "direct mailbox checkpoints, owner attachment reads and read-only action policy",
        async () => {
          const mailbox = (await service.execute(owner, "account", {
            provider: "mxroute",
            projectId,
            name: "Synthetic direct mailbox",
          })) as MailAccount;
          assert.equal(mailbox.provider, "mxroute");
          assert.deepEqual(mailbox.domains, ["isaacurman.com"]);
          assert.equal(mailbox.retentionDays, 0);
          await assert.rejects(
            acceptMailWebhook(runtime.db, {
              accountId: mailbox.id,
              id: "mxroute-cross-provider-control",
              raw: "synthetic signed Resend event",
              externalId: randomUUID(),
              direction: "received",
              status: "received",
              occurredAt: now().toISOString(),
            }),
            denied("NOT_FOUND"),
          );
          const rejectedEvents = await admin.db.execute(
            sql`select count(*)::int n from mail_event where account_id=${mailbox.id}::uuid`,
          );
          assert.equal(
            rejectedEvents.rows[0]!.n,
            0,
            "Resend events must not enter the direct IMAP account",
          );

          const source: MailMetadata = {
            ...metadata("received", "contact@isaacurman.com"),
            imap: { folder: "INBOX", uidValidity: "18", uid: 1, seen: true },
          };
          const attachmentId = randomUUID();
          let lists = 0;
          const direct: MailProvider = {
            async domains() {
              return [];
            },
            async list(_direction, cursor) {
              lists++;
              return {
                items: cursor ? [] : [source],
                nextCursor: cursor ? null : "imap-text-checkpoint",
              };
            },
            async read(_direction, id, m) {
              assert.equal(id, source.externalId);
              assert.deepEqual(m?.imap, source.imap);
              return {
                metadata: source,
                text: "Decoded direct original",
                html: '<img src="cid:logo">',
                headers: { "message-id": source.messageId! },
              };
            },
            async attachments() {
              return {
                items: [
                  {
                    id: attachmentId,
                    filename: "logo.png",
                    contentType: "image/png",
                    size: 4,
                    contentId: "logo",
                  },
                ],
                nextCursor: null,
              };
            },
            async download(m, id) {
              assert.equal(m.externalId, source.externalId);
              assert.equal(id, attachmentId);
              return {
                body: new ReadableStream({
                  start(c) {
                    c.enqueue(new Uint8Array([1, 2, 3, 4]));
                    c.close();
                  },
                }),
                contentType: "image/png",
                filename: "logo.png",
                inline: true,
              };
            },
            async send() {
              throw new Error("Read-only account attempted SMTP");
            },
          };
          const access = createMailAccessRepository(runtime.db, {
            environment: "test",
            now,
          });
          const directService = createMailService(access, () => direct, {
            now,
            appOrigin: "https://commandry.example.test",
          });
          const directWorker = createMailWorker(workerPort, () => direct, now);
          await directWorker.process({
            kind: "reconcile",
            accountId: mailbox.id,
            direction: "received",
          });
          let state = (await directService.execute(owner, "accounts", {})) as {
            items: MailAccount[];
            mxroute: { state: string };
          };
          assert.equal(
            state.items.find((a) => a.id === mailbox.id)?.receivedCursor,
            "imap-text-checkpoint",
          );
          assert.equal(state.mxroute.state, "connected");
          await directWorker.process({
            kind: "reconcile",
            accountId: mailbox.id,
            direction: "received",
          });
          state = (await directService.execute(
            owner,
            "accounts",
            {},
          )) as typeof state;
          assert.equal(
            state.items.find((a) => a.id === mailbox.id)?.receivedComplete,
            true,
          );
          assert.equal(lists, 2);
          const page = (await directService.execute(owner, "messages", {
            accountId: mailbox.id,
          })) as MailPage<MailMessage>;
          assert.equal(page.items.length, 1);
          assert.equal(page.items[0]!.unread, false);
          const message = page.items[0]!;
          const original = (await directService.execute(owner, "read", {
            id: message.id,
          })) as { content: { text: string } };
          assert.equal(original.content.text, "Decoded direct original");
          const files = (await directService.execute(owner, "attachments", {
            id: message.id,
          })) as MailPage<{ downloadUrl: string; ownerDownload: boolean }>;
          assert.equal(
            files.items[0]!.downloadUrl,
            `https://commandry.example.test/api/v1/email/attachment/${message.id}/${attachmentId}`,
          );
          assert.equal(files.items[0]!.ownerDownload, true);
          const stream = (await directService.execute(owner, "download", {
            id: message.id,
            attachmentId,
          })) as { body: ReadableStream<Uint8Array> };
          assert.equal(
            (await new Response(stream.body).arrayBuffer()).byteLength,
            4,
          );
          await assert.rejects(
            directService.execute(
              machine(other.token, "mail.read", otherProject),
              "read",
              { id: message.id },
            ),
            denied("NOT_FOUND"),
          );
          await assert.rejects(
            directService.execute(owner, "draft", {
              key: randomUUID(),
              draft: {
                accountId: mailbox.id,
                from: "contact@isaacurman.com",
                to: ["test@example.test"],
                subject: "Read-only control",
                text: "Do not send",
              },
            }),
            denied("FORBIDDEN"),
          );
          const existing = await admin.db.execute(
            sql`select received_cursor,sent_cursor from mail_account where id=${account.id}::uuid`,
          );
          assert.ok(
            existing.rows.length === 1,
            "Existing Resend account preserved",
          );
        },
      );
      await t.test(
        "expires approval, rejects revocation, and audits denial without disclosing originals",
        async () => {
          const d = (await service.execute(owner, "draft", {
            key: randomUUID(),
            draft: {
              accountId: account.id,
              from: "hello@iyulabs.com",
              to: ["recipient@example.test"],
              subject: "Expired control",
              text: "Do not send",
            },
          })) as MailDraft;
          await service.execute(owner, "approve", { id: d.id });
          time += 15 * 60000;
          await assert.rejects(
            service.execute(machine(issued.token, "mail.send"), "send", {
              id: d.id,
            }),
            denied("APPROVAL_REQUIRED"),
          );
          await admin.db
            .update(foundationClient)
            .set({ revokedAt: now() })
            .where(eq(foundationClient.id, reader.client.id));
          await assert.rejects(
            service.execute(machine(reader.token), "read", { id: first.id }),
            denied("REVOKED"),
          );
          await admin.db.delete(session).where(eq(session.id, sessionId));
          await assert.rejects(
            service.execute(owner, "read", { id: first.id }),
            denied("FORBIDDEN"),
          );
          const deniedAudits = await admin.db.execute(
            sql`select count(*)::int n from mail_audit where decision='denied'`,
          );
          assert.ok(Number(deniedAudits.rows[0]!.n) >= 8);
          const credentials = await admin.db.execute(
            sql`select token_digest from foundation_client where id=${issued.client.id}::uuid`,
          );
          assert.equal(
            credentials.rows[0]!.token_digest,
            foundationTokenDigest(issued.token),
          );
        },
      );
    } finally {
      await runtime.close();
      await admin.close();
    }
  },
);
