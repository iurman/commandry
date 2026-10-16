import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import {
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
  link,
  symlink,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { foundationClientSchema } from "../packages/contracts/src/foundation-access.ts";
import {
  FoundationError,
  foundationTokenDigest,
} from "../packages/domain/src/agent-foundation.ts";
import { createFoundationMachineService } from "../packages/application/src/agent-foundation.ts";
import { createFoundationMcpServer } from "../apps/web/lib/foundation-mcp.ts";
import {
  parseFoundationSkillRegistryArguments,
  runFoundationSkillRegistry,
} from "./foundation-skill-registry.mjs";

const requireForWeb = createRequire(
  new URL("../apps/web/lib/foundation-mcp.ts", import.meta.url),
);
const { createMcpHandler } = await import(
  pathToFileURL(requireForWeb.resolve("@modelcontextprotocol/server")).href
);
const cli = fileURLToPath(
  new URL("./foundation-skill-registry.mjs", import.meta.url),
);
const projectId = "00000000-0000-4000-8000-000000000001";
const token = "af_" + "A".repeat(43);
const source = "PRIVATE_SOURCE_BYTES\r\n  exact \u2603 whitespace \n";
const digest = (content) =>
  createHash("sha256").update(content, "utf8").digest("hex");
function bundle(allRoles = false) {
  const components = allRoles
    ? {
        skill: "skills/public",
        rules: ["rules/public.md"],
        commands: ["commands/public.md"],
        agents: ["agents/public.md"],
        git_hooks: ["hooks/git-public"],
        hooks: {
          codex: "hooks/public.codex.json",
          cursor: "hooks/public.cursor.json",
          claude_code: "hooks/public.claude_code.json",
        },
        chat: "chat/public.md",
      }
    : { skill: "skills/public" };
  const paths = allRoles
    ? [
        "skills/public/SKILL.md",
        "rules/public.md",
        "commands/public.md",
        "agents/public.md",
        "hooks/git-public",
        "hooks/public.codex.json",
        "hooks/public.cursor.json",
        "hooks/public.claude_code.json",
        "chat/public.md",
      ]
    : ["skills/public/SKILL.md"];
  return {
    schemaVersion: 1,
    projectId,
    sourceCommit: "a".repeat(40),
    manifestContent:
      JSON.stringify(
        {
          schema: "manifest.schema.json",
          library: "mnemosyne-skills",
          version: "0.1.0",
          generated_from_commit: "b".repeat(40),
          entries: [
            {
              id: "public",
              version: "0.1.0",
              path: "skills/public",
              description: "Public synthetic fixture.",
              harnesses: ["codex", "cursor", "claude_code"],
              scope: "user",
              status: "shipped",
              components,
            },
          ],
        },
        null,
        2,
      ) + "\r\n",
    selectedIds: ["public"],
    files: paths.map((path) => ({ path, content: source })),
  };
}
async function files(t, raw = bundle()) {
  const root = await mkdtemp(join(tmpdir(), "commandry-skill-registry-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const input = join(root, "bundle.json");
  const output = join(root, "report.json");
  const text = JSON.stringify(raw);
  await writeFile(input, text, { mode: 0o600 });
  return { input, output, root, text, raw };
}
function run(input, output, args = [], credential = token) {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      ["--import", "tsx", cli, "--bundle", input, "--output", output, ...args],
      {
        env: { ...process.env, COMMANDRY_FOUNDATION_TOKEN: credential },
        timeout: 15000,
        maxBuffer: 1024 * 1024,
      },
      (error, stdout, stderr) =>
        resolve({ code: error?.code ?? 0, stdout, stderr }),
    );
  });
}
function noPrivateBytes(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  assert.equal(text.includes(token), false);
  assert.equal(text.includes("PRIVATE_SOURCE_BYTES"), false);
  assert.equal(text.includes("Representative public source"), false);
}
async function fixture(t, operations = ["configuration.record"]) {
  // Synthetic transaction port only. The actual application service and SDK run;
  // this fixture does not prove PostgreSQL transaction/locking behavior.
  const configurations = new Map();
  const receipts = new Map();
  const attempts = [];
  const state = { failAfterCommitAt: null, failed: false, requests: 0 };
  const client = foundationClientSchema.parse({
    schemaVersion: 1,
    id: randomUUID(),
    projectId,
    name: "Synthetic skill writer",
    operations,
    environment: "test",
    createdAt: "2026-10-01T00:00:00.000Z",
    expiresAt: "2026-10-17T00:00:00.000Z",
    revokedAt: null,
    createdBy: "synthetic-owner",
  });
  const records = {
    async idempotent(key, requestDigest, perform) {
      attempts.push(key);
      const stored = receipts.get(key);
      if (stored) {
        if (stored.requestDigest !== requestDigest)
          throw new FoundationError("IDEMPOTENCY_CONFLICT");
        return { value: structuredClone(stored.value), replayed: true };
      }
      const value = await perform();
      receipts.set(key, { requestDigest, value: structuredClone(value) });
      return { value, replayed: false };
    },
    async assertReferences(input) {
      assert.deepEqual(input.evidenceIds, []);
      assert.deepEqual(input.memoryIds, []);
      for (const parent of input.configurationIds)
        assert.equal(configurations.get(parent)?.projectId, projectId);
    },
    async insertConfiguration(record) {
      assert.equal(record.projectId, projectId);
      assert.equal(configurations.has(record.id), false);
      configurations.set(record.id, structuredClone(record));
      return structuredClone(record);
    },
  };
  const service = createFoundationMachineService(
    {
      async withClient(request, callback) {
        assert.equal(request.tokenDigest, foundationTokenDigest(token));
        assert.equal(request.projectId, projectId);
        const value = await callback(client, records);
        // A committed result is deliberately lost once, exercising exact-key
        // uncertain-response retry through the SDK and application idempotency.
        if (!state.failed && state.failAfterCommitAt === configurations.size) {
          state.failed = true;
          throw new Error("Synthetic uncertain response");
        }
        return value;
      },
    },
    { environment: "test", now: () => new Date("2026-10-16T00:00:00.000Z") },
  );
  const actor = {
    schemaVersion: 1,
    principalId: "foundation-client:" + client.id,
    clientId: client.id,
    runId: null,
    capabilities: client.operations,
    projectId,
    resourceIds: [],
    environment: "test",
    expiresAt: client.expiresAt,
    correlationId: randomUUID(),
  };
  const handler = createMcpHandler(
    () => createFoundationMcpServer(service, token, actor),
    { responseMode: "json" },
  );
  const http = createServer(async (request, response) => {
    state.requests++;
    if (request.headers.authorization !== "Bearer " + token) {
      response.writeHead(401);
      response.end();
      return;
    }
    try {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      const result = await handler.fetch(
        new Request("http://127.0.0.1" + request.url, {
          method: request.method,
          headers: request.headers,
          ...(body.length ? { body } : {}),
        }),
      );
      response.writeHead(result.status, Object.fromEntries(result.headers));
      response.end(Buffer.from(await result.arrayBuffer()));
    } catch {
      response.writeHead(500);
      response.end();
    }
  });
  await new Promise((resolve) => http.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await handler.close();
    await new Promise((resolve, reject) =>
      http.close((error) => (error ? reject(error) : resolve())),
    );
  });
  const endpoint =
    "http://127.0.0.1:" + http.address().port + "/mcp/foundation/" + projectId;
  return { configurations, receipts, attempts, state, endpoint };
}

test("argument parsing rejects secret flags, missing explicit files and unsafe reuse", () => {
  for (const argv of [
    [],
    ["--bundle", "a"],
    ["--bundle", "a", "--output", "a"],
    ["--bundle", "a", "--output", "b", "--token", token],
    ["--bundle", "a", "--output", "b", "--record"],
    ["--bundle", "a", "--output", "b", "--endpoint", "https://example.test"],
    ["--bundle", "a", "--output", "b", "--record", "--record"],
  ])
    assert.throws(() => parseFoundationSkillRegistryArguments(argv), {
      message: "Foundation skill registry failed",
    });
});

test("preview child process writes safe exact-digest report with no network", async (t) => {
  const f = await files(t, bundle(true));
  const server = await fixture(t);
  const result = await run(f.input, f.output);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(server.state.requests, 0);
  const report = JSON.parse(await readFile(f.output, "utf8"));
  assert.equal(report.status, "preview");
  assert.equal(report.preview.registered, false);
  assert.equal(report.preview.components.length, 9);
  assert.equal(report.preview.manifestDigest, digest(f.raw.manifestContent));
  assert.equal(
    report.preview.components.every((c) => c.contentDigest === digest(source)),
    true,
  );
  assert.deepEqual(report.receipts, []);
  assert.equal(report.index, null);
  assert.equal((await stat(f.output)).mode & 0o777, 0o600);
  assert.equal(await readFile(f.input, "utf8"), f.text);
  noPrivateBytes(result.stdout + result.stderr);
  noPrivateBytes(report);
});

test("record uses actual SDK/application configurations with exact bytes and graph; rerun creates no duplicates", async (t) => {
  const f = await files(t, bundle(true));
  const server = await fixture(t);
  const first = await run(f.input, f.output, [
    "--record",
    "--endpoint",
    server.endpoint,
  ]);
  assert.equal(first.code, 0, first.stderr);
  assert.equal(server.configurations.size, 11);
  const report = JSON.parse(await readFile(f.output, "utf8"));
  assert.equal(report.status, "recorded");
  assert.equal(report.receipts.length, 10);
  const records = [...server.configurations.values()];
  const manifest = records.find((r) => r.content === f.raw.manifestContent);
  assert.ok(manifest);
  assert.deepEqual(manifest.parentIds, []);
  const components = records.filter((r) => r.content === source);
  assert.equal(components.length, 9);
  assert.deepEqual(
    new Set(components.map((r) => r.kind)),
    new Set(["skill", "settings", "prompt", "hook"]),
  );
  for (const component of components) {
    assert.deepEqual(component.parentIds, [manifest.id]);
    assert.equal(component.contentDigest, digest(source));
    assert.equal(component.sourceCommit, f.raw.sourceCommit);
  }
  const index = server.configurations.get(report.index.id);
  assert.equal(index.parentIds.length, 10);
  assert.deepEqual(
    new Set(index.parentIds),
    new Set([manifest.id, ...components.map((r) => r.id)]),
  );
  const registry = JSON.parse(index.content);
  assert.equal(registry.manifestConfigurationId, manifest.id);
  assert.equal(registry.historicalGeneratedCommit, "b".repeat(40));
  assert.equal(registry.sourceCommit, "a".repeat(40));
  assert.equal(registry.registered, true);
  assert.equal(registry.installed, "unknown");
  assert.equal(registry.invoked, "unknown");
  assert.equal(registry.enforced, "unknown");
  assert.equal(
    registry.components.every((c) =>
      server.configurations.has(c.configurationId),
    ),
    true,
  );
  const beforeKeys = [...server.receipts.keys()];
  const second = await run(f.input, f.output, [
    "--record",
    "--endpoint",
    server.endpoint,
  ]);
  assert.equal(second.code, 0, second.stderr);
  assert.equal(server.configurations.size, 11);
  assert.deepEqual([...server.receipts.keys()], beforeKeys);
  assert.deepEqual(JSON.parse(await readFile(f.output, "utf8")), report);
  assert.equal(await readFile(f.input, "utf8"), f.text);
  for (const value of [
    first.stdout + first.stderr,
    second.stdout + second.stderr,
    report,
    registry,
  ])
    noPrivateBytes(value);
});

test("uncertain mid-registration response preserves partial checkpoint and exact-key retry without duplicates", async (t) => {
  const f = await files(t);
  const server = await fixture(t);
  server.state.failAfterCommitAt = 2;
  const first = await run(f.input, f.output, [
    "--record",
    "--endpoint",
    server.endpoint,
  ]);
  assert.equal(first.code, 1);
  const partial = JSON.parse(await readFile(f.output, "utf8"));
  assert.equal(partial.status, "failed");
  assert.equal(partial.receipts.length, 1);
  assert.equal(partial.index, null);
  assert.equal(server.configurations.size, 2);
  assert.equal(
    [...server.configurations.values()].some((r) =>
      r.content.includes('"registrationState"'),
    ),
    false,
  );
  const uncertainKey = server.attempts[1];
  const second = await run(f.input, f.output, [
    "--record",
    "--endpoint",
    server.endpoint,
  ]);
  assert.equal(second.code, 0, second.stderr);
  assert.equal(server.configurations.size, 3);
  assert.equal(server.attempts.filter((key) => key === uncertainKey).length, 2);
  assert.equal(JSON.parse(await readFile(f.output, "utf8")).status, "recorded");
  for (const value of [
    partial,
    first.stdout + first.stderr,
    second.stdout + second.stderr,
  ])
    noPrivateBytes(value);
});

test("missing content stays partial and unavailable in the final immutable index", async (t) => {
  const raw = bundle();
  raw.files[0].content = null;
  const f = await files(t, raw);
  const server = await fixture(t);
  const result = await run(f.input, f.output, [
    "--record",
    "--endpoint",
    server.endpoint,
  ]);
  assert.equal(result.code, 0, result.stderr);
  const report = JSON.parse(await readFile(f.output, "utf8"));
  assert.equal(report.status, "partial");
  assert.equal(server.configurations.size, 2);
  const index = JSON.parse(server.configurations.get(report.index.id).content);
  assert.equal(index.components[0].configurationId, null);
  assert.equal(index.components[0].availability, "unavailable");
  assert.equal(index.registrationState, "partial");
  noPrivateBytes(report);
});

test("discovery without record capability fails before writes with safe receipts", async (t) => {
  const f = await files(t);
  const server = await fixture(t, ["foundation.read"]);
  const result = await run(f.input, f.output, [
    "--record",
    "--endpoint",
    server.endpoint,
  ]);
  assert.equal(result.code, 1);
  const report = JSON.parse(await readFile(f.output, "utf8"));
  assert.equal(report.failure, "CAPABILITY_UNAVAILABLE");
  assert.deepEqual(report.receipts, []);
  assert.equal(server.configurations.size, 0);
  noPrivateBytes(report);
  noPrivateBytes(result.stdout + result.stderr);
});

test("rejects insecure/mismatched endpoints, token argv and source output aliases without modification", async (t) => {
  const f = await files(t);
  for (const endpoint of [
    "http://remote.example/mcp/foundation/" + projectId,
    "https://example.test/mcp/foundation/00000000-0000-4000-8000-000000000002",
    "https://example.test/mcp/foundation/" + projectId + "?token=private",
    "https://user:pass@example.test/mcp/foundation/" + projectId,
    "https://example.test/mcp/foundation/" + projectId + "/",
  ]) {
    const result = await run(f.input, f.output, [
      "--record",
      "--endpoint",
      endpoint,
    ]);
    assert.equal(result.code, 1);
    noPrivateBytes(result.stdout + result.stderr);
  }
  const argvSecret = await run(f.input, f.output, ["--token", token]);
  assert.equal(argvSecret.code, 1);
  noPrivateBytes(argvSecret.stdout + argvSecret.stderr);
  const hardlink = join(f.root, "hardlink.json");
  await link(f.input, hardlink);
  assert.equal((await run(f.input, hardlink)).code, 1);
  const symlinkPath = join(f.root, "symlink.json");
  await symlink(f.input, symlinkPath);
  assert.equal((await run(f.input, symlinkPath)).code, 1);
  assert.equal(await readFile(f.input, "utf8"), f.text);
});

test("rejects invalid UTF-8 anywhere in bundle bytes before network or report writes", async (t) => {
  const f = await files(t);
  const server = await fixture(t);
  const reportBytes = Buffer.from("existing report remains exact\r\n");
  await writeFile(f.output, reportBytes);
  const serialized = Buffer.from(f.text);
  const locations = [0, serialized.indexOf("PRIVATE_SOURCE_BYTES") + 8];
  for (const position of locations) {
    const invalid = Buffer.concat([
      serialized.subarray(0, position),
      Buffer.from([0xff]),
      serialized.subarray(position),
    ]);
    await writeFile(f.input, invalid);
    await assert.rejects(
      runFoundationSkillRegistry(
        {
          bundle: f.input,
          output: f.output,
          record: true,
          endpoint: server.endpoint,
        },
        token,
      ),
      { message: "Foundation skill registry failed", code: "INVALID_BUNDLE" },
    );
    for (const args of [[], ["--record", "--endpoint", server.endpoint]]) {
      const result = await run(f.input, f.output, args);
      assert.equal(result.code, 1);
      assert.equal(result.stderr, "Foundation skill registry failed.\n");
      noPrivateBytes(result.stdout + result.stderr);
    }
    assert.deepEqual(await readFile(f.input), invalid);
    assert.deepEqual(await readFile(f.output), reportBytes);
  }
  assert.equal(server.state.requests, 0);
  assert.equal(server.configurations.size, 0);
});

test("legitimate replacement characters retain their exact valid UTF-8 source bytes", async (t) => {
  const raw = bundle();
  raw.files[0].content += "\ufffd";
  const f = await files(t, raw);
  const server = await fixture(t);
  const result = await run(f.input, f.output, [
    "--record",
    "--endpoint",
    server.endpoint,
  ]);
  assert.equal(result.code, 0, result.stderr);
  const component = [...server.configurations.values()].find(
    (record) => record.kind === "skill",
  );
  assert.equal(component.content, raw.files[0].content);
  assert.equal(component.contentDigest, digest(raw.files[0].content));
  assert.deepEqual(await readFile(f.input), Buffer.from(f.text));
  noPrivateBytes(result.stdout + result.stderr);
});

test("oversized derived index rejects before network, configurations or report writes", async (t) => {
  const raw = bundle();
  const manifest = JSON.parse(raw.manifestContent);
  const commands = Array.from(
    { length: 999 },
    (_, index) =>
      "commands/" + index.toString().padStart(3, "0") + "/" + "x".repeat(871),
  );
  const entry = manifest.entries[0];
  entry.components = { commands };
  raw.manifestContent = JSON.stringify(manifest);
  entry.description += "x".repeat(895442 - raw.manifestContent.length);
  raw.manifestContent = JSON.stringify(manifest);
  raw.files = commands.map((path) => ({ path, content: "x" }));
  assert.equal(raw.manifestContent.length, 895442);
  assert.equal(
    Buffer.byteLength(raw.manifestContent) + raw.files.length,
    896441,
  );
  const f = await files(t, raw);
  const server = await fixture(t);
  const reportBytes = Buffer.from("existing report remains exact\r\n");
  await writeFile(f.output, reportBytes);
  for (const args of [[], ["--record", "--endpoint", server.endpoint]]) {
    const result = await run(f.input, f.output, args);
    assert.equal(result.code, 1);
    assert.equal(result.stderr, "Foundation skill registry failed.\n");
    assert.deepEqual(await readFile(f.output), reportBytes);
    assert.equal(await readFile(f.input, "utf8"), f.text);
    noPrivateBytes(result.stdout + result.stderr);
  }
  assert.equal(server.state.requests, 0);
  assert.equal(server.configurations.size, 0);
  assert.equal(server.attempts.length, 0);
});

test("repo scope survives CLI preview and registered index, while project rejects before network", async (t) => {
  const raw = bundle();
  const manifest = JSON.parse(raw.manifestContent);
  manifest.entries[0].scope = "repo";
  raw.manifestContent = JSON.stringify(manifest);
  const f = await files(t, raw);
  const server = await fixture(t);
  const preview = await run(f.input, f.output);
  assert.equal(preview.code, 0, preview.stderr);
  assert.equal(
    JSON.parse(await readFile(f.output, "utf8")).preview.entries[0].scope,
    "repo",
  );
  assert.equal(server.state.requests, 0);
  const recorded = await run(f.input, f.output, [
    "--record",
    "--endpoint",
    server.endpoint,
  ]);
  assert.equal(recorded.code, 0, recorded.stderr);
  const report = JSON.parse(await readFile(f.output, "utf8"));
  const index = JSON.parse(server.configurations.get(report.index.id).content);
  assert.equal(index.entries[0].scope, "repo");
  assert.equal(
    [...server.configurations.values()].some(
      (record) => record.content === raw.manifestContent,
    ),
    true,
  );
  const before = server.state.requests;
  const output = await readFile(f.output);
  manifest.entries[0].scope = "project";
  raw.manifestContent = JSON.stringify(manifest);
  await writeFile(f.input, JSON.stringify(raw));
  const invalid = await run(f.input, f.output, [
    "--record",
    "--endpoint",
    server.endpoint,
  ]);
  assert.equal(invalid.code, 1);
  assert.equal(server.state.requests, before);
  assert.deepEqual(await readFile(f.output), output);
  assert.equal(await readFile(f.input, "utf8"), JSON.stringify(raw));
});
