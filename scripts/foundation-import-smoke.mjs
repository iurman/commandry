import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";

// Synthetic owner review against a disposable built server, never a corpus scan.
export async function foundationImportSmoke({
  origin,
  cookie,
  trustedOrigin,
  projectId,
  otherProjectId,
  knowledgeId,
  source,
  machineToken,
  client,
  call,
}) {
  const base = "/api/v1/foundation/imports";
  const headers = {
    cookie,
    origin: trustedOrigin,
    "content-type": "application/json",
  };
  async function post(
    path,
    body,
    key = randomUUID(),
    status = 200,
    suppliedHeaders = headers,
  ) {
    const response = await fetch(`${origin}${base}${path}`, {
      method: "POST",
      headers: { ...suppliedHeaders, "idempotency-key": key },
      body: JSON.stringify(body),
    });
    assert.equal(
      response.status,
      status,
      "Selected import response status mismatch",
    );
    assert.equal(response.headers.get("cache-control"), "no-store");
    return response.json();
  }
  const sha = (text) => createHash("sha256").update(text, "utf8").digest("hex");
  const tiers = ["public", "private", "client", "unknown"];
  const originals = [
    source,
    "",
    "Synthetic CRLF\r\nretained",
    "Synthetic caf\u00e9\u0000source",
    "\ufeffSynthetic initial BOM",
  ];
  const envelope = {
    schemaVersion: 1,
    projectId,
    namespace: `synthetic-import-${randomUUID()}`,
    records: tiers.map((sourceTier) => ({
      externalId: sourceTier,
      knowledgeItemId: knowledgeId,
      statement: `Synthetic ${sourceTier} preference requires separate approval.`,
      category: "preference",
      sourceTier,
      selected: true,
      sources: Array.from({ length: 17 }, (_, ordinal) => {
        const originalContent =
          originals[ordinal] ?? `Synthetic original ${sourceTier}/${ordinal}`;
        return {
          evidence: {
            projectId,
            sourceKind: ordinal === 0 ? "knowledge_revision" : "artifact",
            sourceId:
              ordinal === 0
                ? knowledgeId
                : `synthetic:${sourceTier}:${ordinal}`,
            sourceVersion: ordinal === 0 ? "1" : null,
            contentDigest: sha(originalContent),
            locator:
              ordinal === 0
                ? `commandry:knowledge/${knowledgeId}/versions/1`
                : `artifact:synthetic/${sourceTier}/${ordinal}`,
            observedAt: "2026-10-15T12:34:56.123456+01:30",
            availability: "available",
          },
          originalContent,
        };
      }),
    })),
  };
  for (const suppliedHeaders of [
    { origin: trustedOrigin, "content-type": "application/json" },
    {
      authorization: `Bearer ${machineToken}`,
      origin: trustedOrigin,
      "content-type": "application/json",
    },
  ])
    await post("/preview", envelope, randomUUID(), 401, suppliedHeaders);
  await post("/preview", envelope, randomUUID(), 403, {
    ...headers,
    origin: "https://untrusted.invalid",
  });
  const noOrigin = { cookie, "content-type": "application/json" };
  await post("/preview", envelope, randomUUID(), 403, noOrigin);
  const preview = await post("/preview", envelope);
  assert.equal(preview.sideEffects, "none");
  assert.equal(preview.records.length, 4);
  for (const row of preview.records) {
    assert.equal(row.reviewedSelection, false);
    assert.equal(row.expectedExistingMemory, null);
    if (row.sourceTier !== "public") assert.equal(row.statement, null);
  }
  const reviewedInput = (inputEnvelope, plan) => ({
    envelope: inputEnvelope,
    decision: "apply_proposed_unverified",
    reviewedSelections: plan.records
      .filter((row) => row.selected)
      .map((row) => ({
        externalId: row.alias.externalId,
        selectionFingerprint: row.selectionFingerprint,
        expectedExistingMemory: row.expectedExistingMemory,
      })),
  });
  const input = reviewedInput(envelope, preview);
  await post(
    "/apply",
    { ...input, reviewedSelections: input.reviewedSelections.slice(1) },
    randomUUID(),
    400,
  );
  const key = randomUUID();
  const applied = await post("/apply", input, key);
  assert.equal(applied.replayed, false);
  assert.equal(applied.record.records.length, 4);
  assert.ok(applied.record.appliedBy.startsWith("user:"));
  assert.equal(
    applied.record.records.every(
      (row) =>
        row.action === "created" && row.version === 1 && row.sourceCount === 17,
    ),
    true,
  );
  const receiptText = JSON.stringify(applied);
  for (const row of envelope.records)
    assert.equal(receiptText.includes(row.statement), false);
  for (const marker of originals.slice(2))
    assert.equal(receiptText.includes(marker), false);
  async function get(path, status = 200, suppliedHeaders = headers) {
    const response = await fetch(`${origin}${base}${path}`, {
      headers: suppliedHeaders,
    });
    assert.equal(
      response.status,
      status,
      "Selected import read response mismatch",
    );
    assert.equal(response.headers.get("cache-control"), "no-store");
    return response.json();
  }
  for (
    let rowIndex = 0;
    rowIndex < applied.record.records.length;
    rowIndex += 1
  ) {
    const result = applied.record.records[rowIndex];
    const expected = envelope.records[rowIndex];
    const path = `/${result.importRevisionId}`;
    const metadata = await get(`${path}?projectId=${projectId}`);
    assert.equal(metadata.memoryId, result.memoryId);
    assert.equal(metadata.memoryVersion, 1);
    assert.equal(metadata.sourceCount, 17);
    assert.equal(Object.hasOwn(metadata, "sources"), false);
    assert.equal(Object.hasOwn(metadata, "originalContent"), false);
    await get(`${path}?projectId=${otherProjectId}`, 404);
    await get(
      `${path}?projectId=${projectId}&projectId=${otherProjectId}`,
      400,
    );
    await get(`${path}?projectId=${projectId}`, 401, {
      authorization: `Bearer ${machineToken}`,
    });
    const recovered = [];
    let ordinal = 0;
    do {
      const page = await get(
        `${path}/sources?projectId=${projectId}&fromOrdinal=${ordinal}&limit=5`,
      );
      recovered.push(...page.items);
      ordinal = page.nextOrdinal;
    } while (ordinal !== null);
    assert.equal(recovered.length, 17);
    recovered.forEach((item, index) => {
      assert.equal(item.ordinal, index);
      assert.equal(item.projectId, projectId);
      assert.equal(item.revisionId, result.importRevisionId);
      assert.equal(
        item.originalContent,
        expected.sources[index].originalContent,
      );
      assert.equal(
        item.contentDigest,
        expected.sources[index].evidence.contentDigest,
      );
    });
    const { memory } = await call(client, "get_memory_assertion", {
      id: result.memoryId,
    });
    assert.equal(memory.lifecycle, "proposed");
    assert.equal(memory.verification, "unverified");
    assert.deepEqual(
      memory.content.evidenceIds,
      recovered.map((item) => item.evidenceId),
    );
  }
  const replay = await post("/apply", input, key);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.record, applied.record);
  assert.equal(replay.correlationId, applied.correlationId);
  const changed = structuredClone(input);
  changed.envelope.records[0].statement += " Changed input.";
  await post("/apply", changed, key, 400);
  const changedPlan = await post("/preview", changed.envelope);
  await post("/apply", reviewedInput(changed.envelope, changedPlan), key, 409);
  const noopPlan = await post("/preview", envelope);
  const noop = await post("/apply", reviewedInput(envelope, noopPlan));
  assert.equal(
    noop.record.records.every((row) => row.action === "unchanged"),
    true,
  );
  assert.deepEqual(
    noop.record.records.map((row) => row.importRevisionId),
    applied.record.records.map((row) => row.importRevisionId),
  );
  const revisedEnvelope = structuredClone(envelope);
  const revisedSource = revisedEnvelope.records[0].sources[2];
  revisedSource.originalContent += " Synthetic source revision.";
  revisedSource.evidence.contentDigest = sha(revisedSource.originalContent);
  const revisedPlan = await post("/preview", revisedEnvelope);
  const revised = await post(
    "/apply",
    reviewedInput(revisedEnvelope, revisedPlan),
  );
  assert.equal(revised.record.records[0].action, "revised");
  assert.equal(
    revised.record.records[0].memoryId,
    applied.record.records[0].memoryId,
  );
  assert.equal(revised.record.records[0].version, 2);
  const { memory: first } = await call(client, "get_memory_assertion", {
    id: applied.record.records[0].memoryId,
  });
  const corrected = await call(client, "revise_memory", {
    memoryId: first.id,
    expectedVersion: first.version,
    content: {
      ...first.content,
      statement: "Synthetic correction must survive reimport.",
    },
    idempotencyKey: randomUUID(),
  });
  assert.equal(corrected.record.version, 3);
  const stalePlan = await post("/preview", revisedEnvelope);
  await post(
    "/apply",
    reviewedInput(revisedEnvelope, stalePlan),
    randomUUID(),
    400,
  );
  const historical = await post("/apply", input, key);
  assert.equal(historical.replayed, true);
  assert.deepEqual(historical.record, applied.record);
  assert.equal(
    (await call(client, "get_memory_assertion", { id: first.id })).memory
      .version,
    3,
  );
  const oversized = await fetch(`${origin}${base}/preview`, {
    method: "POST",
    headers,
    body: " ".repeat(8 * 1024 * 1024 + 1),
  });
  assert.equal(oversized.status, 413);
  assert.deepEqual(await oversized.json(), { code: "PAYLOAD_TOO_LARGE" });
  console.log(
    "Selected import built-app rehearsal passed: explicit synthetic review across four tiers, 68 exact originals, full continuation, canonical MCP identity, revision reset, owner correction protection and historical replay.",
  );
}
