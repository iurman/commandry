import { createHmac, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import {
  mailMetadataSchema,
  type MailAttachment,
  type MailContent,
  type MailDraft,
  type MailMetadata,
} from "@commandry/contracts";
import { MailError } from "@commandry/domain";
import type { MailProvider } from "@commandry/application";

const providerId = z.uuid();
const listSchema = z.object({
  data: z.array(z.record(z.string(), z.unknown())).max(100),
  has_more: z.boolean().default(false),
});
const strings = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string")
    : typeof v === "string"
      ? [v]
      : [];
export function normalizeResendMail(
  raw: Record<string, unknown>,
  direction: "received" | "sent",
): MailMetadata {
  const headers =
    raw.headers && typeof raw.headers === "object"
      ? (raw.headers as Record<string, string>)
      : {};
  const get = (name: string) =>
    Object.entries(headers).find(([k]) => k.toLowerCase() === name)?.[1] ??
    null;
  return mailMetadataSchema.parse({
    externalId: raw.id,
    direction,
    from: raw.from,
    to: strings(raw.to),
    cc: strings(raw.cc),
    bcc: strings(raw.bcc),
    replyTo: strings(raw.reply_to),
    receivedFor: strings(raw.received_for),
    subject: raw.subject ?? "",
    occurredAt: new Date(String(raw.created_at)).toISOString(),
    messageId: raw.message_id ?? get("message-id"),
    inReplyTo: get("in-reply-to"),
    references: (get("references") ?? "").split(/\s+/).filter(Boolean),
    status: direction === "received" ? "received" : (raw.last_event ?? "sent"),
    attachmentCount: Array.isArray(raw.attachments)
      ? raw.attachments.length
      : null,
  });
}
/** Fixed official origin; test transports are injected, never configured by mail content. */
export function createResendMailProvider(
  options: {
    keyFile?: string;
    fetch?: typeof fetch;
    minimumIntervalMs?: number;
  } = {},
): MailProvider {
  const requestFetch = options.fetch ?? fetch;
  let nextAt = 0;
  let serial: Promise<unknown> = Promise.resolve();
  async function request(
    path: string,
    body?: unknown,
    key?: string,
  ): Promise<Record<string, unknown>> {
    if (!options.keyFile) throw new MailError("UNAVAILABLE");
    let token: string;
    try {
      token = (
        await readFile(/* turbopackIgnore: true */ options.keyFile, "utf8")
      ).trim();
    } catch {
      throw new MailError("UNAVAILABLE");
    }
    if (!/^re_[A-Za-z0-9_\-]{20,}$/.test(token))
      throw new MailError("UNAVAILABLE");
    // Serialize starts in each process. One worker handler bounds account API traffic.
    const prior = serial;
    let release!: () => void;
    serial = new Promise<void>((resolve) => {
      release = resolve;
    });
    await prior;
    const delay = Math.max(0, nextAt - Date.now());
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    nextAt = Date.now() + (options.minimumIntervalMs ?? 600);
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await requestFetch("https://api.resend.com" + path, {
        method: body ? "POST" : "GET",
        headers: {
          Authorization: "Bearer " + token,
          "User-Agent": "Commandry-mail/1",
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(key ? { "Idempotency-Key": key } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
        redirect: "error",
        cache: "no-store",
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new MailError(
          response.status === 404
            ? "NOT_FOUND"
            : [401, 403].includes(response.status)
              ? "FORBIDDEN"
              : response.status === 422 || response.status === 400
                ? "INVALID_INPUT"
                : "UNAVAILABLE",
        );
      }
      const reader = response.body?.getReader();
      if (!reader) throw new MailError("UNAVAILABLE");
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const item = await reader.read();
          if (item.done) break;
          size += item.value.byteLength;
          if (size > 2097152) {
            await reader.cancel();
            throw new MailError("UNAVAILABLE");
          }
          chunks.push(item.value);
        }
      } finally {
        reader.releaseLock();
      }
      const result: unknown = JSON.parse(
        Buffer.concat(chunks).toString("utf8"),
      );
      if (!result || typeof result !== "object" || Array.isArray(result))
        throw new MailError("UNAVAILABLE");
      return result as Record<string, unknown>;
    } catch (error) {
      if (error instanceof MailError) throw error;
      throw new MailError("UNAVAILABLE");
    } finally {
      clearTimeout(timer);
      release();
    }
  }
  const prefix = (direction: "sent" | "received") =>
    direction === "received" ? "/emails/receiving" : "/emails";
  function next(data: {
    data: Record<string, unknown>[];
    has_more: boolean;
  }): string | null {
    if (!data.has_more) return null;
    const last = data.data.at(-1);
    if (!last) throw new MailError("UNAVAILABLE");
    return providerId.parse(last.id);
  }
  function attachment(raw: Record<string, unknown>): MailAttachment {
    const parsed = z
      .object({
        id: providerId,
        filename: z.string().max(1000),
        content_type: z.string().max(200),
        size: z.number().int().min(0),
        download_url: z.url().optional(),
        expires_at: z.iso.datetime({ offset: true }).optional(),
      })
      .parse(raw);
    if (parsed.download_url) {
      const u = new URL(parsed.download_url);
      if (u.protocol !== "https:" || u.username || u.password)
        throw new MailError("UNAVAILABLE");
    }
    return {
      id: parsed.id,
      filename: parsed.filename,
      contentType: parsed.content_type,
      size: parsed.size,
      ...(parsed.download_url ? { downloadUrl: parsed.download_url } : {}),
      ...(parsed.expires_at ? { expiresAt: parsed.expires_at } : {}),
    };
  }
  return {
    async domains() {
      const result: string[] = [];
      let after: string | null = null;
      do {
        const data = listSchema.parse(
          await request(
            "/domains?limit=100" +
              (after ? "&after=" + encodeURIComponent(after) : ""),
          ),
        );
        for (const d of data.data) {
          const caps = d.capabilities as Record<string, unknown> | undefined;
          if (d.status === "verified" && (!caps || caps.sending === "enabled"))
            result.push(String(d.name).toLowerCase());
        }
        const cursor = next(data);
        if (cursor && cursor === after) throw new MailError("UNAVAILABLE");
        after = cursor;
      } while (after);
      return result;
    },
    async list(direction, cursor) {
      const data = listSchema.parse(
        await request(
          prefix(direction) +
            "?limit=100" +
            (cursor
              ? "&after=" + encodeURIComponent(providerId.parse(cursor))
              : ""),
        ),
      );
      return {
        items: data.data.map((d) => normalizeResendMail(d, direction)),
        nextCursor: next(data),
      };
    },
    async read(direction, id): Promise<MailContent> {
      const raw = await request(
        prefix(direction) + "/" + encodeURIComponent(providerId.parse(id)),
      );
      const headers = z
        .record(z.string().max(200), z.string().max(8000))
        .parse(raw.headers ?? {});
      return {
        metadata: normalizeResendMail(raw, direction),
        text: typeof raw.text === "string" ? raw.text : null,
        html: typeof raw.html === "string" ? raw.html : null,
        headers,
      };
    },
    async attachments(direction, id, cursor, attachmentId) {
      const path =
        prefix(direction) +
        "/" +
        encodeURIComponent(providerId.parse(id)) +
        "/attachments";
      if (attachmentId)
        return {
          items: [
            attachment(
              await request(
                path + "/" + encodeURIComponent(providerId.parse(attachmentId)),
              ),
            ),
          ],
          nextCursor: null,
        };
      const data = listSchema.parse(
        await request(
          path +
            "?limit=100" +
            (cursor
              ? "&after=" + encodeURIComponent(providerId.parse(cursor))
              : ""),
        ),
      );
      return { items: data.data.map(attachment), nextCursor: next(data) };
    },
    async send(d: MailDraft) {
      return z.object({ id: providerId }).parse(
        await request(
          "/emails",
          {
            from: d.from,
            to: d.to,
            cc: d.cc,
            bcc: d.bcc,
            subject: d.subject,
            text: d.text,
            ...(d.inReplyTo
              ? {
                  headers: {
                    "In-Reply-To": d.inReplyTo,
                    References: d.references.join(" "),
                  },
                }
              : {}),
          },
          "commandry-mail/" + d.id,
        ),
      );
    },
  };
}

export async function verifyResendMailWebhook(
  raw: string,
  headers: Headers,
  secretFile: string | undefined,
  now = Date.now(),
) {
  if (!secretFile) throw new MailError("UNAVAILABLE");
  let secret: string;
  try {
    secret = (
      await readFile(/* turbopackIgnore: true */ secretFile, "utf8")
    ).trim();
  } catch {
    throw new MailError("UNAVAILABLE");
  }
  const id = headers.get("svix-id") ?? "",
    timestamp = headers.get("svix-timestamp") ?? "",
    signature = headers.get("svix-signature") ?? "";
  if (
    !/^[A-Za-z0-9_-]{1,200}$/.test(id) ||
    !/^\d{1,12}$/.test(timestamp) ||
    Math.abs(now / 1000 - Number(timestamp)) > 300 ||
    signature.length > 2000 ||
    !/^whsec_[A-Za-z0-9+/=]+$/.test(secret)
  )
    throw new MailError("FORBIDDEN");
  const expected = createHmac("sha256", Buffer.from(secret.slice(6), "base64"))
    .update(`${id}.${timestamp}.${raw}`)
    .digest();
  const matches = signature.split(" ").some((s) => {
    const [version, hash] = s.split(",");
    if (version !== "v1" || !hash) return false;
    const actual = Buffer.from(hash, "base64");
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  });
  if (!matches) throw new MailError("FORBIDDEN");
  const event = z
    .object({
      type: z.string().max(100),
      created_at: z.iso.datetime({ offset: true }),
      data: z.object({ email_id: providerId }),
    })
    .parse(JSON.parse(raw));
  const statuses = [
    "received",
    "sent",
    "delivered",
    "delivery_delayed",
    "bounced",
    "complained",
    "failed",
    "suppressed",
    "opened",
    "clicked",
    "scheduled",
  ];
  const status = event.type.startsWith("email.") ? event.type.slice(6) : "";
  if (!statuses.includes(status)) return null;
  return {
    id,
    externalId: event.data.email_id,
    direction:
      status === "received" ? ("received" as const) : ("sent" as const),
    status,
    occurredAt: event.created_at,
  };
}
