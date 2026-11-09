/** Test-only separate worker. Synthetic provider transports; no external network. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  createDatabase,
  createMailWorkerRepository,
} from "../packages/db/src/index";
import { createMailWorker } from "../packages/application/src/index";
import {
  createResendMailProvider,
  createMxrouteMailProvider,
} from "../packages/platform/src/index";
import type { MxrouteClient } from "../packages/platform/src/index";
import { MAIL_DOMAINS } from "../packages/contracts/src/index";

async function main() {
  const input = JSON.parse(readFileSync(0, "utf8")) as {
    url: string;
    accountId: string;
    keyFile: string;
    count: number;
    provider?: "resend" | "mxroute";
  };
  if (new URL(input.url).hostname !== "127.0.0.1" || input.count !== 100000)
    throw new Error("Use the isolated scale harness");
  const db = createDatabase({ connectionString: input.url, max: 2 });
  const id = (n: number) =>
    `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  let pages = 0,
    peakRss = process.memoryUsage().rss,
    bodyReads = 0;
  const attachmentBytes = 0;
  const cpu = process.cpuUsage(),
    started = performance.now();
  const fixtureFetch: typeof fetch = async (raw) => {
    const url = new URL(String(raw));
    if (url.hostname !== "api.resend.com")
      throw new Error("Unexpected external request");
    if (url.pathname === "/domains")
      return Response.json({
        data: MAIL_DOMAINS.map((name, i) => ({
          id: id(i + 1),
          name,
          status: "verified",
          capabilities: { sending: "enabled", receiving: "enabled" },
        })),
        has_more: false,
      });
    if (url.pathname !== "/emails/receiving") {
      bodyReads++;
      throw new Error(
        "Scale reconciliation must never retrieve bodies or attachments",
      );
    }
    const cursor = url.searchParams.get("after"),
      offset = cursor ? Number(cursor.slice(-12)) : 0;
    const data = Array.from(
      { length: Math.min(100, input.count - offset) },
      (_, i) => {
        const n = offset + i + 1,
          domain = MAIL_DOMAINS[n % 7];
        return {
          id: id(n),
          from: `Synthetic Sender ${n} <sender-${n}@example.test>`,
          to: [`inbox-${n % 1000}@${domain}`],
          cc: n % 10 === 0 ? [`second-${n % 100}@${domain}`] : [],
          bcc: [],
          reply_to: [],
          received_for: [],
          subject:
            (n % 20 === 0 ? "Urgent: " : "Indexed source: ") +
            createHash("sha256").update(String(n)).digest("hex").repeat(23),
          created_at: new Date(Date.UTC(2026, 10, 8) - n * 1000).toISOString(),
          message_id: `<${n}@example.test>`,
          attachments:
            n % 5 === 0
              ? [
                  {
                    id: id(n + 100001),
                    filename: "2MiB-source.pdf",
                    content_type: "application/pdf",
                    size: 2097152,
                  },
                ]
              : [],
        };
      },
    );
    return Response.json({
      data,
      has_more: offset + data.length < input.count,
    });
  };
  const provider =
    input.provider === "mxroute"
      ? createMxrouteMailProvider({
          passwordFile: input.keyFile,
          createClient: () =>
            ({
              on() {},
              close() {},
              async connect() {},
              async list() {
                return [{ path: "INBOX", flags: new Set<string>() }];
              },
              async mailboxOpen() {
                return { uidValidity: 18n, uidNext: input.count + 1 };
              },
              async *fetch(range: string) {
                const [start, end] = range.split(":").map(Number);
                for (let n = start!; n <= end!; n++)
                  yield {
                    uid: n,
                    seq: n,
                    flags: new Set<string>(),
                    internalDate: new Date(Date.UTC(2026, 10, 8) - n * 1000),
                    envelope: {
                      from: [{ address: `sender-${n}@example.test` }],
                      to: [{ address: "contact@isaacurman.com" }],
                      subject:
                        (n % 20 === 0 ? "Urgent: " : "Indexed source: ") +
                        createHash("sha256")
                          .update(String(n))
                          .digest("hex")
                          .repeat(23),
                      messageId: `<${n}@example.test>`,
                    },
                    bodyStructure: {
                      type: "multipart/mixed",
                      childNodes: [
                        { part: "1", type: "text/plain", size: 102400 },
                        ...(n % 5 === 0
                          ? [
                              {
                                part: "2",
                                type: "application/pdf",
                                disposition: "attachment",
                                size: 2097152,
                              },
                            ]
                          : []),
                      ],
                    },
                  };
              },
              async download() {
                bodyReads++;
                throw new Error("Scale sync must never fetch MIME bytes");
              },
            }) as unknown as MxrouteClient,
        })
      : createResendMailProvider({
          keyFile: input.keyFile,
          fetch: fixtureFetch,
          minimumIntervalMs: 0,
        });
  const worker = createMailWorker(
    createMailWorkerRepository(db.db),
    () => provider,
  );
  try {
    for (let i = 0; i < input.count / 200; i++) {
      await Promise.all([
        worker.process({
          kind: "reconcile",
          accountId: input.accountId,
          direction: "received",
        }),
        worker.process({
          kind: "reconcile",
          accountId: input.accountId,
          direction: "received",
        }),
      ]);
      pages += 2;
      peakRss = Math.max(peakRss, process.memoryUsage().rss);
      if (i % 50 === 0)
        process.stdout.write(JSON.stringify({ progress: pages }) + "\n");
    }
    const usage = process.cpuUsage(cpu);
    process.stdout.write(
      JSON.stringify({
        result: {
          count: input.count,
          provider: input.provider ?? "resend",
          pages,
          bodyReads,
          attachmentBytes,
          peakRss,
          elapsedMs: performance.now() - started,
          cpuMs: (usage.user + usage.system) / 1000,
        },
      }) + "\n",
    );
  } finally {
    await db.close();
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
