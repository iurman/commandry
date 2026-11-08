import { createHmac, randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createResendMailProvider,
  verifyResendMailWebhook,
} from "./resend-mail";
import type { MailDraft } from "@commandry/contracts";

const cleanup: string[] = [];
afterEach(async () => {
  for (const path of cleanup.splice(0))
    await rm(path, { recursive: true, force: true });
});
async function key(value = "re_" + "a".repeat(30)) {
  const dir = await mkdtemp(join(tmpdir(), "commandry-mail-test-"));
  cleanup.push(dir);
  const file = join(dir, "key");
  await writeFile(file, value, { mode: 0o600 });
  return file;
}
const id = randomUUID(),
  attachmentId = randomUUID();
const received = {
  id,
  from: "Sender <sender@example.test>",
  to: ["hello@iyulabs.com"],
  created_at: "2026-11-08T12:00:00Z",
  subject: "Provider original",
  message_id: "<original@example.test>",
  reply_to: ["reply@example.test"],
  cc: [],
  bcc: [],
  attachments: [
    {
      id: attachmentId,
      filename: "original.pdf",
      content_type: "application/pdf",
      size: 123,
    },
  ],
  text: "Original, not the forwarding wrapper",
  html: "<p>Original</p>",
  headers: {
    "in-reply-to": "<parent@example.test>",
    references: "<root@example.test> <parent@example.test>",
  },
};
describe("Resend provider protocol", () => {
  it("uses the separate receiving API, cursor pagination and fresh attachment lookup", async () => {
    const paths: string[] = [];
    const provider = createResendMailProvider({
      keyFile: await key(),
      minimumIntervalMs: 0,
      fetch: async (input, init) => {
        const path =
          new URL(String(input)).pathname + new URL(String(input)).search;
        paths.push(path);
        expect(init?.redirect).toBe("error");
        expect(new Headers(init?.headers).get("Authorization")).toMatch(
          /^Bearer re_/,
        );
        if (path.includes("/attachments/"))
          return Response.json({
            ...received.attachments[0],
            download_url: "https://example.resend.com/signed",
            expires_at: "2026-11-08T13:00:00Z",
          });
        if (path.includes("/attachments?"))
          return Response.json({ data: received.attachments, has_more: false });
        if (path.includes("?limit="))
          return Response.json({
            data: [received],
            has_more: !path.includes("after="),
          });
        return Response.json(received);
      },
    });
    const first = await provider.list("received", null);
    expect(first.nextCursor).toBe(id);
    expect(
      (await provider.list("received", first.nextCursor)).nextCursor,
    ).toBeNull();
    const original = await provider.read("received", id);
    expect(original.text).toBe(received.text);
    expect(original.metadata.inReplyTo).toBe("<parent@example.test>");
    const page = await provider.attachments("received", id, null);
    expect(page.items[0]?.id).toBe(attachmentId);
    expect(page.items[0]?.downloadUrl).toBeUndefined();
    const fresh = await provider.attachments(
      "received",
      id,
      null,
      attachmentId,
    );
    expect(fresh.items[0]?.downloadUrl).toBe(
      "https://example.resend.com/signed",
    );
    expect(paths).toContain(`/emails/receiving/${id}`);
    expect(paths).toContain(`/emails/receiving?limit=100&after=${id}`);
  });
  it("validates verified sending capabilities and stable send idempotency", async () => {
    let sent = 0;
    const provider = createResendMailProvider({
      keyFile: await key(),
      minimumIntervalMs: 0,
      fetch: async (input, init) => {
        if (String(input).includes("/domains"))
          return Response.json({
            data: [
              {
                id: randomUUID(),
                name: "iyulabs.com",
                status: "verified",
                capabilities: { sending: "enabled", receiving: "enabled" },
              },
              { id: randomUUID(), name: "evil.test", status: "pending" },
            ],
            has_more: false,
          });
        expect(new Headers(init?.headers).get("Idempotency-Key")).toBe(
          "commandry-mail/" + id,
        );
        const body = JSON.parse(String(init?.body));
        expect(body.from).toBe("hello@iyulabs.com");
        expect(body.headers["In-Reply-To"]).toBe("<original@example.test>");
        sent++;
        return Response.json({ id });
      },
    });
    expect(await provider.domains()).toEqual(["iyulabs.com"]);
    await provider.send({
      id,
      accountId: randomUUID(),
      replyToId: null,
      supersedesId: null,
      createdBy: "user:fixture",
      createdAt: "2026-11-08T12:00:00Z",
      state: "approved",
      approvedBy: "user:fixture",
      approvedUntil: "2026-11-08T12:15:00Z",
      providerId: null,
      error: null,
      attemptedAt: null,
      from: "hello@iyulabs.com",
      to: ["sender@example.test"],
      cc: [],
      bcc: [],
      subject: "Re: test",
      text: "A reviewed reply",
      inReplyTo: "<original@example.test>",
      references: ["<original@example.test>"],
    } as MailDraft);
    expect(sent).toBe(1);
  });
  it("fails closed on missing credentials, errors, oversized responses and unsafe URLs", async () => {
    await expect(
      createResendMailProvider().list("received", null),
    ).rejects.toThrow("UNAVAILABLE");
    for (const status of [401, 403, 404, 429, 500]) {
      const p = createResendMailProvider({
        keyFile: await key(),
        minimumIntervalMs: 0,
        fetch: async () =>
          new Response("provider detail must not leak", { status }),
      });
      await expect(p.read("received", id)).rejects.toThrow(
        status === 404
          ? "NOT_FOUND"
          : [401, 403].includes(status)
            ? "FORBIDDEN"
            : "UNAVAILABLE",
      );
    }
    const p = createResendMailProvider({
      keyFile: await key(),
      minimumIntervalMs: 0,
      fetch: async () => new Response("x".repeat(2097153)),
    });
    await expect(p.read("received", id)).rejects.toThrow("UNAVAILABLE");
    const a = createResendMailProvider({
      keyFile: await key(),
      minimumIntervalMs: 0,
      fetch: async () =>
        Response.json({
          ...received.attachments[0],
          download_url: "http://127.0.0.1/private",
        }),
    });
    await expect(
      a.attachments("received", id, null, attachmentId),
    ).rejects.toThrow("UNAVAILABLE");
  });
});
describe("signed webhook boundary", () => {
  it("verifies exact raw bytes, rotated signatures and both timestamp limits", async () => {
    const secret = Buffer.from("deterministic-test-signing-secret").toString(
        "base64",
      ),
      file = await key("whsec_" + secret),
      now = Date.parse("2026-11-08T12:00:00Z"),
      timestamp = String(now / 1000),
      eventId = "msg_fixture";
    const raw = JSON.stringify({
      type: "email.received",
      created_at: "2026-11-08T12:00:00Z",
      data: { email_id: id },
    });
    const hash = createHmac("sha256", Buffer.from(secret, "base64"))
      .update(`${eventId}.${timestamp}.${raw}`)
      .digest("base64");
    const headers = new Headers({
      "svix-id": eventId,
      "svix-timestamp": timestamp,
      "svix-signature": "v1,invalid v1," + hash,
    });
    expect(
      (await verifyResendMailWebhook(raw, headers, file, now))?.externalId,
    ).toBe(id);
    await expect(
      verifyResendMailWebhook(raw + " ", headers, file, now),
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      verifyResendMailWebhook(raw, headers, file, now + 301000),
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      verifyResendMailWebhook(raw, headers, file, now - 301000),
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      verifyResendMailWebhook(raw, headers, undefined, now),
    ).rejects.toThrow("UNAVAILABLE");
  });
});
