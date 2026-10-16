import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { expectedReport, scoreReport } from "./fixture.mjs";
import {
  claudeSubscription,
  codexSubscription,
  launch,
  trialEnvironment,
  validReply,
} from "./run.mjs";

test("the real MCP fixture requires all context, validates writes, preserves retries and rejects changed reports", async () => {
  const directory = await mkdtemp(
    resolve(tmpdir(), "commandry-runtime-fixture-"),
  );
  const client = new Client({ name: "runtime-fixture-test", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL("./fixture.mjs", import.meta.url)), directory],
  });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), [
      "read_context",
      "submit_report",
    ]);
    const early = await client.callTool({
      name: "submit_report",
      arguments: expectedReport,
    });
    assert.equal(early.isError, true);
    await assert.rejects(readFile(resolve(directory, "report.json")), {
      code: "ENOENT",
    });
    for (let cursor = 0; cursor !== null;) {
      const response = await client.callTool({
        name: "read_context",
        arguments: { cursor },
      });
      cursor = response.structuredContent.nextCursor;
    }
    const invalid = await client.callTool({
      name: "submit_report",
      arguments: { ...expectedReport, targetPath: "/tmp/not-authorized" },
    });
    assert.equal(invalid.isError, true);
    const first = await client.callTool({
      name: "submit_report",
      arguments: expectedReport,
    });
    assert.notEqual(first.isError, true);
    const bytes = await readFile(resolve(directory, "report.json"), "utf8");
    const retry = await client.callTool({
      name: "submit_report",
      arguments: expectedReport,
    });
    assert.notEqual(retry.isError, true);
    const conflict = await client.callTool({
      name: "submit_report",
      arguments: { ...expectedReport, automaticDispatch: true },
    });
    assert.equal(conflict.isError, true);
    assert.equal(
      await readFile(resolve(directory, "report.json"), "utf8"),
      bytes,
    );
    assert.equal(scoreReport(JSON.parse(bytes)).passed, true);
    const audit = (
      await readFile(resolve(directory, "mcp-events.jsonl"), "utf8")
    )
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.equal(
      audit.filter((event) => event.type === "context_read").length,
      3,
    );
    assert.equal(
      audit.filter((event) => event.type === "report_denied").length,
      2,
    );
  } finally {
    await client.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("a plausible but fabricated automatic or verified result fails evaluation", () => {
  assert.equal(
    scoreReport({ ...expectedReport, automaticDispatch: true }).passed,
    false,
  );
  assert.equal(
    scoreReport({ ...expectedReport, verification: "verified" }).passed,
    false,
  );
  assert.equal(
    scoreReport({ ...expectedReport, sources: ["policy", "processor"] }).passed,
    false,
  );
  assert.equal(
    scoreReport({
      ...expectedReport,
      sources: ["policy", "processor", "processor"],
    }).passed,
    false,
  );
  assert.equal(scoreReport({ ...expectedReport, extra: true }).passed, false);
});

test("API credentials and provider overrides fail admission rather than silently changing billing", () => {
  for (const name of [
    "OPENAI_API_KEY",
    "CODEX_API_KEY",
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_AUTH_TOKEN",
    "OPENAI_BASE_URL",
    "CLAUDE_CODE_USE_BEDROCK",
  ])
    assert.throws(
      () => trialEnvironment({ [name]: "not-a-real-secret" }),
      /CREDENTIAL_OR_PROVIDER_OVERRIDE_PRESENT/,
    );
  assert.deepEqual(trialEnvironment({ PATH: "/bin" }), { PATH: "/bin" });
  assert.deepEqual(
    trialEnvironment({
      PATH: "/bin",
      DATABASE_URL: "unrelated-test-secret",
      SSH_AUTH_SOCK: "/tmp/agent",
      CODEX_INTERNAL_HOST: "unrelated",
    }),
    { PATH: "/bin" },
  );
  assert.equal(codexSubscription({ account: { type: "apiKey" } }), false);
  assert.equal(
    codexSubscription({ account: { type: "chatgpt", planType: "pro" } }),
    true,
  );
  assert.equal(
    claudeSubscription({
      loggedIn: true,
      authMethod: "claude.ai",
      apiProvider: "firstParty",
      subscriptionType: "max",
    }),
    true,
  );
  assert.equal(
    claudeSubscription({
      loggedIn: true,
      authMethod: "api_key",
      apiProvider: "firstParty",
      subscriptionType: "max",
    }),
    false,
  );
});

test("a broken return contract prevents reading or scoring a report", () => {
  const path = "/tmp/trial/report.json";
  assert.equal(validReply(`Done: saved\n${path}`, path), true);
  assert.equal(validReply(`Here is a report\n${path}`, path), false);
  assert.equal(
    validReply(`Done: saved\n${path}\n${"line\n".repeat(40)}`, path),
    false,
  );
  assert.equal(validReply("Done: missing path", path), false);
});

test("a hung child times out, and process-start failures return without exposing stderr", async () => {
  const hung = launch(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    env: {},
    timeoutMs: 50,
  });
  try {
    const exit = await hung.exit;
    assert.equal(exit.signal, "SIGTERM");
    assert.equal(hung.stats().failure, "TIMEOUT");
  } finally {
    await hung.close();
  }
  const absent = launch("/no/such/runtime", [], { env: {}, timeoutMs: 100 });
  await absent.exit;
  await absent.close();
  assert.equal(absent.stats().failure, "PROCESS_START_FAILED");
});
