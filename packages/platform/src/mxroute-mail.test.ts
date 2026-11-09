import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, expect, it } from "vitest";
import type { ImapFlow, FetchMessageObject } from "imapflow";
import { createMxrouteMailProvider, mxrouteReferenceId } from "./mxroute-mail";
import type { MailMetadata } from "@commandry/contracts";
const temps: string[] = [];
afterEach(async () => {
  for (const p of temps.splice(0))
    await rm(p, { recursive: true, force: true });
});
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "commandry-imap-"));
  temps.push(dir);
  const passwordFile = join(dir, "password");
  await writeFile(passwordFile, "synthetic-mailbox-password", { mode: 0o600 });
  const calls: { name: string; args: unknown[] }[] = [];
  let validity = "18";
  let closed = 0;
  const messages: FetchMessageObject[] = [1, 101].map((uid) => ({
    uid,
    seq: uid,
    flags: new Set(["\\Seen"]),
    internalDate: new Date("2026-11-08T12:00:00Z"),
    envelope: {
      from: [{ address: "sender@example.test" }],
      to: [{ address: "contact@isaacurman.com" }],
      subject: "Original MIME",
      messageId: `<${uid}@example.test>`,
    },
    headers: Buffer.from(
      "Message-ID: <original@example.test>\r\nReferences: <root@example.test>\r\nX-Original: preserved\r\n",
    ),
    bodyStructure: {
      type: "multipart/mixed",
      childNodes: [
        { part: "1", type: "text/plain", size: 10 },
        { part: "2", type: "text/html", size: 25 },
        { part: "3", type: "image/png", id: "<logo@example.test>", size: 5 },
        {
          part: "4",
          type: "text/html",
          disposition: "attachment",
          dispositionParameters: { filename: "untrusted.html" },
          size: 12,
        },
      ],
    },
  }));
  let bodyOversize = false;
  const createClient = () =>
    ({
      on() {},
      close() {
        closed++;
      },
      async connect() {},
      async list() {
        return [
          { path: "INBOX", flags: new Set() },
          { path: "Empty", flags: new Set() },
          { path: "Sent", flags: new Set(), specialUse: "\\Sent" },
          { path: "Container", flags: new Set(["\\Noselect"]) },
        ];
      },
      async mailboxOpen(...args: unknown[]) {
        calls.push({ name: "open", args });
        return {
          uidValidity: BigInt(validity),
          uidNext: args[0] === "INBOX" ? 102 : 1,
        };
      },
      async *fetch(range: string, query: unknown, opts: unknown) {
        calls.push({ name: "fetch", args: [range, query, opts] });
        const [a, b] = range.split(":").map(Number);
        for (const m of messages) if (m.uid >= a! && m.uid <= b!) yield m;
      },
      async fetchOne(uid: number, query: unknown, opts: unknown) {
        calls.push({ name: "one", args: [uid, query, opts] });
        return messages.find((m) => m.uid === uid) || false;
      },
      async download(uid: number, part: string, opts: unknown) {
        calls.push({ name: "download", args: [uid, part, opts] });
        return {
          content: Readable.from([
            bodyOversize
              ? Buffer.alloc(2097153)
              : Buffer.from(
                  part === "2"
                    ? "<p>Original HTML</p>"
                    : part === "3"
                      ? "image"
                      : "Original plain",
                ),
          ]),
        };
      },
    }) as unknown as ImapFlow;
  const p = createMxrouteMailProvider({ passwordFile, createClient });
  return {
    p,
    calls,
    messages,
    setValidity(v: string) {
      validity = v;
    },
    oversize() {
      bodyOversize = true;
    },
    get closed() {
      return closed;
    },
  };
}
it("traverses every folder and sparse UID window without source/body writes", async () => {
  const f = await fixture();
  let cursor: string | null = null;
  const all: MailMetadata[] = [];
  let n = 0;
  do {
    const page = await f.p.list("received", cursor);
    all.push(...page.items);
    cursor = page.nextCursor;
    n++;
  } while (cursor);
  expect(n).toBe(3);
  expect(all.map((m) => m.imap?.uid)).toEqual([1, 101]);
  expect(all[0]?.imap?.seen).toBe(true);
  expect(new Set(all.map((m) => m.externalId)).size).toBe(2);
  expect(
    f.calls
      .filter((c) => c.name === "open")
      .every((c) => (c.args[1] as { readOnly: boolean }).readOnly),
  ).toBe(true);
  expect(f.calls.some((c) => c.name === "download")).toBe(false);
  expect((await f.p.list("sent", null)).items).toEqual([]);
  const first = all[0]!;
  f.setValidity("19");
  expect((await f.p.list("received", null)).items[0]?.externalId).not.toBe(
    first.externalId,
  );
  await expect(
    f.p.read("received", first.externalId, first),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});
it("reads only decoded outer text parts and retains original headers/CID references", async () => {
  const f = await fixture();
  const m = (await f.p.list("received", null)).items[0]!;
  const original = await f.p.read("received", m.externalId, m);
  expect(original.html).toBe("<p>Original HTML</p>");
  expect(original.headers["x-original"]).toBe("preserved");
  expect(original.metadata.references).toEqual(["<root@example.test>"]);
  expect(
    f.calls.filter((c) => c.name === "download").map((c) => c.args[1]),
  ).toEqual(["1", "2"]);
  const a = await f.p.attachments("received", m.externalId, null, undefined, m);
  expect(a.items).toHaveLength(2);
  expect(a.items[0]?.contentId).toBe("<logo@example.test>");
  const selected = await f.p.attachments(
    "received",
    m.externalId,
    null,
    a.items[0]!.id,
    m,
  );
  expect(selected.items).toEqual([a.items[0]]);
  const file = await f.p.download!(m, a.items[0]!.id);
  expect(file.inline).toBe(true);
  expect(await new Response(file.body).text()).toBe("image");
  const htmlFile = await f.p.download!(m, a.items[1]!.id);
  expect(htmlFile.inline).toBe(false);
  await htmlFile.body.cancel();
});
it("refuses stale/spoofed references, invalid checkpoints, oversized parts and SMTP", async () => {
  const f = await fixture();
  const m = (await f.p.list("received", null)).items[0]!;
  await expect(
    f.p.read("received", m.externalId, {
      ...m,
      imap: { ...m.imap!, uid: 999 },
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(f.p.list("received", "invalid")).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
  await expect(f.p.send({} as never)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  expect(await f.p.domains()).toEqual([]);
  f.oversize();
  await expect(f.p.read("received", m.externalId, m)).rejects.toMatchObject({
    code: "UNAVAILABLE",
  });
  expect(f.closed).toBeGreaterThan(3);
});
it("bounds simultaneous transfers and releases connection slots on browser cancellation", async () => {
  const f = await fixture();
  const m = (await f.p.list("received", null)).items[0]!;
  const a = (
    await f.p.attachments("received", m.externalId, null, undefined, m)
  ).items[0]!;
  const first = await f.p.download!(m, a.id);
  const second = await f.p.download!(m, a.id);
  await expect(f.p.list("received", null)).rejects.toMatchObject({
    code: "UNAVAILABLE",
  });
  await first.body.cancel();
  await second.body.cancel();
  expect((await f.p.list("received", null)).items[0]?.externalId).toBe(
    mxrouteReferenceId("INBOX", "18", 1),
  );
});
