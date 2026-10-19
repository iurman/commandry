import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(
  new URL("../../apps/web/package.json", import.meta.url),
);
const { McpServer } = require("@modelcontextprotocol/server");
const { StdioServerTransport } = require("@modelcontextprotocol/server/stdio");
const { z } = require("zod");

export const fixturePages = [
  {
    sourceId: "policy",
    path: "packages/domain/src/local-agent-policy.ts",
    text: 'export const LOCAL_AGENT_RUNTIME = "local-fake-v1" as const;',
  },
  {
    sourceId: "processor",
    path: "packages/application/src/local-agent-runs.ts",
    text: "The current local processor builds a fixed synthetic report after reading project context. It does not launch Codex or Claude. The report has verificationStatus: unverified.",
  },
  {
    sourceId: "history",
    path: "trial-owned synthetic historical record",
    text: "A human manually launched a pilot worker. No automatic Commandry AgentRun was created. This is synthetic test context, not a new production observation.",
  },
];

export const expectedReport = {
  runtime: "local-fake-v1",
  automaticDispatch: false,
  verification: "unverified",
  sources: ["policy", "processor", "history"],
};

export const reportSchema = z.strictObject({
  runtime: z.string().min(1).max(80),
  automaticDispatch: z.boolean(),
  verification: z.enum(["verified", "unverified", "unknown"]),
  sources: z.array(z.string().min(1).max(80)).max(10),
});

export function fixtureDigest() {
  return createHash("sha256")
    .update(JSON.stringify(fixturePages))
    .digest("hex");
}

export function scoreReport(value) {
  const parsed = reportSchema.safeParse(value);
  if (!parsed.success) return { passed: false, checks: { validShape: false } };
  const report = parsed.data;
  const checks = {
    runtime: report.runtime === expectedReport.runtime,
    automaticDispatch: report.automaticDispatch === false,
    verification: report.verification === "unverified",
    completeSources:
      report.sources.length === 3 &&
      expectedReport.sources.every((id) => report.sources.includes(id)),
  };
  return { passed: Object.values(checks).every(Boolean), checks };
}

export async function createTrialServer(directory) {
  const root = resolve(directory);
  const reportPath = resolve(root, "report.json");
  const evidencePath = resolve(root, "mcp-events.jsonl");
  const seen = new Set();
  let report;
  let tail = Promise.resolve();
  const record = (event) => {
    tail = tail.then(async () => {
      const { appendFile } = await import("node:fs/promises");
      await appendFile(evidencePath, `${JSON.stringify(event)}\n`, {
        mode: 0o600,
      });
    });
    return tail;
  };
  const server = new McpServer(
    { name: "commandry-runtime-trial", version: "1.0.0" },
    {
      instructions:
        "Synthetic local runtime comparison only. Read every context page using nextCursor, then submit a report. This grants no product, network, filesystem or command authority.",
    },
  );
  server.registerTool(
    "read_context",
    {
      description:
        "Read one selected synthetic context page. Follow nextCursor until null. No production data or external effects.",
      inputSchema: z.strictObject({
        cursor: z.number().int().min(0).max(2).default(0),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ cursor }) => {
      seen.add(cursor);
      await record({ type: "context_read", cursor });
      const result = {
        ...fixturePages[cursor],
        nextCursor: cursor === 2 ? null : cursor + 1,
        fixtureDigest: fixtureDigest(),
      };
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );
  server.registerTool(
    "submit_report",
    {
      description:
        "Save this trial's bounded report at its fixed report.json path. Reversible trial-only write, authorized by the local comparison invocation; audited in mcp-events.jsonl. No product state changes.",
      inputSchema: reportSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true,
      },
    },
    async (input) => {
      if (seen.size !== 3) {
        await record({ type: "report_denied", reason: "incomplete_context" });
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "Read every context page before submitting.",
            },
          ],
        };
      }
      const bytes = `${JSON.stringify(input, null, 2)}\n`;
      if (report !== undefined && report !== bytes) {
        await record({ type: "report_denied", reason: "conflicting_retry" });
        return {
          isError: true,
          content: [
            { type: "text", text: "A different report was already submitted." },
          ],
        };
      }
      if (report === undefined) {
        try {
          await writeFile(reportPath, bytes, { flag: "wx", mode: 0o600 });
        } catch (error) {
          if (
            error.code !== "EEXIST" ||
            (await readFile(reportPath, "utf8")) !== bytes
          )
            throw error;
        }
        report = bytes;
      }
      await record({
        type: "report_submitted",
        digest: createHash("sha256").update(bytes).digest("hex"),
      });
      return {
        content: [{ type: "text", text: JSON.stringify({ reportPath }) }],
      };
    },
  );
  return server;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv.length !== 3)
    throw new Error("Pass exactly one existing private trial directory");
  const server = await createTrialServer(process.argv[2]);
  await server.connect(new StdioServerTransport());
}
