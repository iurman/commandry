import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  ImapFlow,
  type FetchMessageObject,
  type MessageStructureObject,
} from "imapflow";
import { z } from "zod";
import {
  mailMetadataSchema,
  mailImapReferenceSchema,
  type MailMetadata,
  type MailAttachment,
} from "@commandry/contracts";
import { MailError } from "@commandry/domain";
import type { MailProvider } from "@commandry/application";

export type { ImapFlow as MxrouteClient } from "imapflow";

const ADDRESS = "contact@isaacurman.com";
const BODY_LIMIT = 2097152;
const FILE_LIMIT = 20 * 1024 * 1024;
let connections = 0;
const cursorSchema = z.strictObject({
  folder: z.string().min(1).max(512),
  validity: z.string().regex(/^[0-9]{1,10}$/),
  after: z.number().int().min(0).max(4294967295),
  upper: z.number().int().min(0).max(4294967295),
});
const encode = (v: z.infer<typeof cursorSchema>) =>
  Buffer.from(JSON.stringify(v)).toString("base64url");
export function mxrouteReferenceId(
  folder: string,
  uidValidity: string,
  uid: number,
): string {
  return stableId(JSON.stringify([ADDRESS, folder, uidValidity, uid]));
}
function stableId(value: string): string {
  const b = createHash("sha256").update(value).digest().subarray(0, 16);
  b[6] = (b[6]! & 15) | 80;
  b[8] = (b[8]! & 63) | 128;
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
function leaves(node?: MessageStructureObject): MessageStructureObject[] {
  if (!node) return [];
  // Attached RFC822 messages are attachments, not the outer message's body.
  if (node.type.toLowerCase() === "message/rfc822") return [node];
  return node.childNodes?.length ? node.childNodes.flatMap(leaves) : [node];
}
const clean = (s: string | undefined, max = 1000) =>
  (s ?? "").replace(/[\r\n\0]/g, " ").slice(0, max);
function attachments(
  m: FetchMessageObject,
  id: string,
): (MailAttachment & { part: string })[] {
  return leaves(m.bodyStructure)
    .filter(
      (p) =>
        p.disposition === "attachment" ||
        p.id ||
        !["text/plain", "text/html"].includes(p.type.toLowerCase()),
    )
    .map((p) => {
      const part = p.part || "1";
      return {
        id: stableId(id + ":" + part),
        part,
        filename: clean(
          p.dispositionParameters?.filename ||
            p.parameters?.name ||
            `part-${part}`,
          1000,
        ),
        contentType: clean(p.type.toLowerCase(), 200),
        size: p.size ?? 0,
        ...(p.id ? { contentId: clean(p.id) } : {}),
        disposition:
          p.disposition === "attachment"
            ? ("attachment" as const)
            : ("inline" as const),
      };
    });
}
function metadata(
  m: FetchMessageObject,
  folder: string,
  validity: string,
  direction: "sent" | "received",
): MailMetadata {
  const e = m.envelope;
  const addresses = (
    v: typeof e extends undefined ? never : NonNullable<typeof e>["to"],
  ) => (v ?? []).flatMap((a) => (a.address ? [clean(a.address)] : []));
  const id = mxrouteReferenceId(folder, validity, m.uid);
  const date = new Date(e?.date ?? m.internalDate ?? 0);
  return mailMetadataSchema.parse({
    externalId: id,
    imap: {
      folder,
      uidValidity: validity,
      uid: m.uid,
      seen: m.flags?.has("\\Seen") ?? false,
    },
    direction,
    from: addresses(e?.from)[0] || "unknown@invalid.local",
    to: addresses(e?.to),
    cc: addresses(e?.cc),
    bcc: addresses(e?.bcc),
    replyTo: addresses(e?.replyTo),
    receivedFor: direction === "received" ? [ADDRESS] : [],
    subject: clean(e?.subject, 2000),
    occurredAt: date.toISOString(),
    messageId: e?.messageId ? clean(e.messageId) : null,
    inReplyTo: e?.inReplyTo ? clean(e.inReplyTo) : null,
    references: [],
    status: direction === "sent" ? "sent" : "received",
    attachmentCount: attachments(m, id).length,
  });
}
/** Fixed owner mailbox. No host, password or mailbox command comes from email content. */
export function createMxrouteMailProvider(
  options: {
    passwordFile?: string;
    createClient?: (password: string) => ImapFlow;
  } = {},
): MailProvider {
  async function open() {
    if (!options.passwordFile || connections >= 2)
      throw new MailError("UNAVAILABLE");
    connections++;
    let client: ImapFlow | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      client?.close();
      connections--;
    };
    try {
      const password = (
        await readFile(/* turbopackIgnore: true */ options.passwordFile, "utf8")
      ).trim();
      if (!password || /[\r\n\0]/.test(password))
        throw new MailError("UNAVAILABLE");
      client =
        options.createClient?.(password) ??
        new ImapFlow({
          host: "witcher.mxrouting.net",
          port: 993,
          secure: true,
          auth: { user: ADDRESS, pass: password },
          logger: false,
          disableAutoIdle: true,
          disableCompression: true,
          connectionTimeout: 15000,
          greetingTimeout: 10000,
          socketTimeout: 20000,
          maxLineLength: 2097152,
          maxLiteralSize: 2097152,
          maxResponseSize: 4194304,
          tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" },
        });
      client.on("error", close);
      timer = setTimeout(close, 45000);
      timer.unref();
      await client.connect();
      return { client, close };
    } catch {
      close();
      throw new MailError("UNAVAILABLE");
    }
  }
  async function using<T>(action: (client: ImapFlow) => Promise<T>) {
    const session = await open();
    try {
      return await action(session.client);
    } catch (e) {
      if (e instanceof MailError) throw e;
      throw new MailError("UNAVAILABLE");
    } finally {
      session.close();
    }
  }
  async function folders(client: ImapFlow, direction: "received" | "sent") {
    const all = await client.list();
    return all
      .filter(
        (f) =>
          !f.flags.has("\\Noselect") &&
          (direction === "sent"
            ? f.specialUse === "\\Sent"
            : f.specialUse !== "\\Sent"),
      )
      .sort((a, b) =>
        a.path === b.path
          ? 0
          : a.path === "INBOX"
            ? -1
            : b.path === "INBOX"
              ? 1
              : a.path.localeCompare(b.path),
      );
  }
  async function locate(client: ImapFlow, m: MailMetadata | undefined) {
    if (!m?.imap) throw new MailError("NOT_FOUND");
    const ref = mailImapReferenceSchema.parse(m.imap);
    if (
      mxrouteReferenceId(ref.folder, ref.uidValidity, ref.uid) !== m.externalId
    )
      throw new MailError("NOT_FOUND");
    const box = await client.mailboxOpen(ref.folder, { readOnly: true });
    if (String(box.uidValidity) !== ref.uidValidity)
      throw new MailError("NOT_FOUND");
    const message = await client.fetchOne(
      ref.uid,
      {
        envelope: true,
        bodyStructure: true,
        internalDate: true,
        flags: true,
        headers: true,
      },
      { uid: true },
    );
    if (!message) throw new MailError("NOT_FOUND");
    return { ref, message };
  }
  async function textPart(client: ImapFlow, uid: number, part: string) {
    const download = await client.download(uid, part, {
      uid: true,
      maxBytes: BODY_LIMIT + 1,
      chunkSize: 65536,
    });
    if (!download.content) throw new MailError("NOT_FOUND");
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of download.content) {
      const b = Buffer.from(chunk);
      size += b.length;
      if (size > BODY_LIMIT) {
        download.content.destroy();
        throw new MailError("UNAVAILABLE");
      }
      chunks.push(b);
    }
    return Buffer.concat(chunks).toString("utf8");
  }
  return {
    // Receiving authentication is not authority to send as the mailbox.
    async domains() {
      return [];
    },
    async list(direction, cursor) {
      return using(async (client) => {
        let state: z.infer<typeof cursorSchema> | undefined;
        if (cursor) {
          try {
            state = cursorSchema.parse(
              JSON.parse(Buffer.from(cursor, "base64url").toString()),
            );
          } catch {
            throw new MailError("INVALID_INPUT");
          }
        }
        const available = await folders(client, direction);
        const folder =
          (state && available.find((f) => f.path === state?.folder)) ??
          available[0];
        if (!folder) return { items: [], nextCursor: null };
        const box = await client.mailboxOpen(folder.path, { readOnly: true });
        const validity = String(box.uidValidity);
        if (
          !state ||
          state.folder !== folder.path ||
          state.validity !== validity
        )
          state = {
            folder: folder.path,
            validity,
            after: 0,
            upper: Math.max(0, box.uidNext - 1),
          };
        const end = Math.min(state.upper, state.after + 100);
        const items: MailMetadata[] = [];
        if (end > state.after) {
          for await (const m of client.fetch(
            `${state.after + 1}:${end}`,
            {
              envelope: true,
              bodyStructure: true,
              internalDate: true,
              flags: true,
            },
            { uid: true },
          )) {
            // IMAP ranges are inclusive; retain an explicit snapshot bound.
            if (m.uid > state.after && m.uid <= end)
              items.push(metadata(m, folder.path, validity, direction));
          }
        }
        if (end < state.upper)
          return { items, nextCursor: encode({ ...state, after: end }) };
        const next =
          available[available.findIndex((f) => f.path === folder.path) + 1];
        return {
          items,
          nextCursor: next
            ? encode({ folder: next.path, validity: "0", after: 0, upper: 0 })
            : null,
        };
      });
    },
    async read(direction, id, m) {
      if (m?.externalId !== id) throw new MailError("NOT_FOUND");
      return using(async (client) => {
        const { ref, message } = await locate(client, m);
        const parts = leaves(message.bodyStructure).filter(
          (p) => p.disposition !== "attachment",
        );
        const plain = parts.find((p) => p.type.toLowerCase() === "text/plain");
        const html = parts.find((p) => p.type.toLowerCase() === "text/html");
        const original = metadata(
          message,
          ref.folder,
          ref.uidValidity,
          direction,
        );
        const headers: Record<string, string> = {};
        if ((message.headers?.length ?? 0) > 65536)
          throw new MailError("UNAVAILABLE");
        for (const line of (message.headers?.toString("utf8") ?? "")
          .replace(/\r?\n[ \t]+/g, " ")
          .split(/\r?\n/)) {
          const colon = line.indexOf(":");
          if (colon < 1) continue;
          const key = line.slice(0, colon).toLowerCase();
          const value = line.slice(colon + 1).trim();
          headers[key] = headers[key] ? headers[key] + ", " + value : value;
        }
        original.references = (headers.references ?? "")
          .split(/\s+/)
          .filter(Boolean)
          .slice(-100);
        return {
          metadata: original,
          text: plain
            ? await textPart(client, ref.uid, plain.part || "1")
            : null,
          html: html ? await textPart(client, ref.uid, html.part || "1") : null,
          headers,
        };
      });
    },
    async attachments(_direction, id, cursor, attachmentId, m) {
      if (m?.externalId !== id) throw new MailError("NOT_FOUND");
      return using(async (client) => {
        const { message } = await locate(client, m);
        const all = attachments(message, id);
        if (attachmentId) {
          const item = all.find((a) => a.id === attachmentId);
          if (!item) throw new MailError("NOT_FOUND");
          const { part: _part, ...value } = item;
          return { items: [value], nextCursor: null };
        }
        const start = cursor ? Number(cursor) : 0;
        if (!Number.isSafeInteger(start) || start < 0)
          throw new MailError("INVALID_INPUT");
        return {
          items: all
            .slice(start, start + 100)
            .map(({ part: _part, ...a }) => a),
          nextCursor: start + 100 < all.length ? String(start + 100) : null,
        };
      });
    },
    async download(m, attachmentId) {
      const session = await open();
      try {
        const { ref, message } = await locate(session.client, m);
        const part = attachments(message, m.externalId).find(
          (a) => a.id === attachmentId,
        );
        if (!part) throw new MailError("NOT_FOUND");
        if (part.size > FILE_LIMIT) throw new MailError("UNAVAILABLE");
        const download = await session.client.download(ref.uid, part.part, {
          uid: true,
          maxBytes: FILE_LIMIT + 1,
          chunkSize: 65536,
        });
        if (!download.content) throw new MailError("NOT_FOUND");
        const source = download.content;
        let size = 0;
        const iterator = source[Symbol.asyncIterator]();
        const body = new ReadableStream<Uint8Array>({
          async pull(controller) {
            try {
              const item = await iterator.next();
              if (item.done) {
                controller.close();
                session.close();
                return;
              }
              const chunk = Buffer.from(item.value);
              size += chunk.length;
              if (size > FILE_LIMIT) throw new MailError("UNAVAILABLE");
              controller.enqueue(chunk);
            } catch {
              source.destroy();
              session.close();
              controller.error(new MailError("UNAVAILABLE"));
            }
          },
          cancel() {
            source.destroy();
            session.close();
          },
        });
        return {
          body,
          filename: part.filename,
          contentType: part.contentType,
          inline: /^image\/(png|jpeg|gif|webp|avif)$/i.test(part.contentType),
        };
      } catch (e) {
        session.close();
        if (e instanceof MailError) throw e;
        throw new MailError("UNAVAILABLE");
      }
    },
    async send() {
      throw new MailError("FORBIDDEN");
    },
  };
}
