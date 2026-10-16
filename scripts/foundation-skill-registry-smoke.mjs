import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const digest = (content) =>
  createHash("sha256").update(content, "utf8").digest("hex");
const decode = (bytes) =>
  new TextDecoder("utf-8", { fatal: true }).decode(bytes);

function syntheticSelection() {
  return {
    schemaVersion: 1,
    sourceCommit: "a".repeat(40),
    selectedIds: ["synthetic-skill"],
    manifestContent:
      JSON.stringify(
        {
          schema: "manifest.schema.json",
          library: "mnemosyne-skills",
          version: "0.1.0",
          generated_from_commit: "b".repeat(40),
          entries: [
            {
              id: "synthetic-skill",
              version: "0.1.0",
              path: "skills/synthetic-skill",
              description: "Disposable exact-byte fixture, never installed.",
              harnesses: ["codex"],
              scope: "repo",
              status: "shipped",
              components: { skill: "skills/synthetic-skill" },
            },
          ],
        },
        null,
        2,
      ) + "\r\n",
    files: [
      {
        path: "skills/synthetic-skill/SKILL.md",
        content: "# Synthetic skill\r\nPreserve exact bytes: \u2603.\n",
      },
    ],
  };
}

// Invoked only by the disposable built-app authentication rehearsal. An optional
// explicit closed selection can exercise real shipped skill sources, without
// installing them, reading a corpus, or writing to production.
export async function foundationSkillRegistrySmoke({
  origin,
  projectId,
  token,
  client,
  call,
}) {
  const selectionPath = process.env.COMMANDRY_FOUNDATION_REGISTRY_SELECTION;
  const selection = selectionPath
    ? JSON.parse(decode(await readFile(selectionPath)))
    : syntheticSelection();
  const bundle = { ...selection, projectId };
  const temporary = await mkdtemp(
    join(tmpdir(), "commandry-registry-rehearsal-"),
  );
  const input = join(temporary, "bundle.json");
  const output = join(temporary, "report.json");
  const cli = fileURLToPath(
    new URL("./foundation-skill-registry.mjs", import.meta.url),
  );
  async function run() {
    const completed = await new Promise((resolve) => {
      execFile(
        process.execPath,
        [
          "--import",
          "tsx",
          cli,
          "--bundle",
          input,
          "--output",
          output,
          "--record",
          "--endpoint",
          `${origin}/mcp/foundation/${projectId}`,
        ],
        {
          env: { ...process.env, COMMANDRY_FOUNDATION_TOKEN: token },
          timeout: 60000,
          maxBuffer: 65536,
        },
        (error, stdout, stderr) =>
          resolve({ code: error?.code ?? 0, stdout, stderr }),
      );
    });
    assert.equal(
      completed.code,
      0,
      "Registry CLI must complete against the disposable built server",
    );
    assert.equal(
      completed.stdout.includes(token) || completed.stderr.includes(token),
      false,
    );
    const text = await readFile(output, "utf8");
    assert.equal(text.includes(token), false);
    return JSON.parse(text);
  }
  async function inventory() {
    const ids = [];
    let after;
    let asOf;
    do {
      const page = await call(client, "list_configuration_versions", {
        limit: 7,
        ...(after ? { after, asOf } : {}),
      });
      if (asOf) assert.equal(page.asOf, asOf);
      asOf = page.asOf;
      for (const item of page.items) {
        assert.equal(ids.includes(item.id), false);
        ids.push(item.id);
      }
      after = page.nextCursor;
    } while (after);
    return ids.sort();
  }
  try {
    await writeFile(input, JSON.stringify(bundle), { mode: 0o600 });
    const before = await inventory();
    const first = await run();
    assert.equal(first.status, "recorded");
    assert.equal(first.preview.missingComponents.length, 0);
    const receipts = [...first.receipts, first.index];
    assert.equal(
      new Set(receipts.map((row) => row.id)).size,
      first.preview.components.length + 2,
    );
    const manifest = first.receipts.find((row) => row.step === "manifest");
    const original = await call(client, "get_configuration_version", {
      id: manifest.id,
    });
    assert.ok(
      original.content === bundle.manifestContent,
      "Original manifest bytes must round-trip",
    );
    assert.equal(original.contentDigest, digest(bundle.manifestContent));
    assert.equal(original.sourceCommit, bundle.sourceCommit);
    assert.deepEqual(original.parentIds, []);
    const files = new Map(
      bundle.files.map((file) => [file.path, file.content]),
    );
    for (const component of first.preview.components) {
      const receipt = first.receipts.find(
        (row) => row.step === component.identityDigest,
      );
      assert.ok(receipt);
      const stored = await call(client, "get_configuration_version", {
        id: receipt.id,
      });
      assert.ok(
        stored.content === files.get(component.path),
        "Selected component bytes must round-trip",
      );
      assert.equal(stored.contentDigest, component.contentDigest);
      assert.deepEqual(stored.parentIds, [manifest.id]);
      assert.equal(stored.sourceCommit, bundle.sourceCommit);
    }
    const storedIndex = await call(client, "get_configuration_version", {
      id: first.index.id,
    });
    assert.equal(storedIndex.contentDigest, digest(storedIndex.content));
    assert.deepEqual(
      storedIndex.parentIds,
      first.receipts.map((row) => row.id),
    );
    const index = JSON.parse(storedIndex.content);
    assert.equal(index.registered, true);
    assert.equal(index.registrationState, "complete");
    assert.equal(index.manifestConfigurationId, manifest.id);
    assert.deepEqual(index.entries, first.preview.entries);
    assert.equal(index.components.length, first.preview.components.length);
    for (const state of ["installed", "invoked", "enforced"])
      assert.equal(index[state], "unknown");
    const after = await inventory();
    assert.equal(after.length - before.length, receipts.length);
    const second = await run();
    assert.deepEqual(second.receipts, first.receipts);
    assert.deepEqual(second.index, first.index);
    assert.deepEqual(await inventory(), after);
    console.log(
      `Foundation registry built-app rehearsal passed: ${index.entries.length} selected entries, ${index.components.length} exact components, ${receipts.length} persisted configurations, unchanged exact-key retry; installation/invocation/enforcement unknown. ${selectionPath ? "Explicit selected source bundle." : "Synthetic fixture."}`,
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
