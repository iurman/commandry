import assert from "node:assert/strict";
import { test } from "vitest";
import type { FoundationClient } from "@commandry/contracts";
import { FoundationError, foundationTokenDigest } from "@commandry/domain";
import {
  createFoundationAuthenticationService,
  type FoundationAuthenticationPort,
} from "./foundation-authentication.js";

const projectId = "10000000-0000-4000-8000-000000000001";
const clientId = "10000000-0000-4000-8000-000000000002";
const correlationId = "10000000-0000-4000-8000-000000000003";
const token = `af_${"A".repeat(43)}`;
const now = new Date("2026-10-16T00:00:00.000Z");
const client: FoundationClient = {
  schemaVersion: 1,
  id: clientId,
  projectId,
  name: "Write-only client",
  operations: ["memory.propose"],
  environment: "test",
  createdBy: "user:owner",
  createdAt: "2026-10-15T00:00:00.000Z",
  expiresAt: "2026-10-17T00:00:00.000Z",
  revokedAt: null,
};
const denied = (code: string) => (error: unknown) =>
  error instanceof FoundationError && error.code === code;

function fixture(record: FoundationClient = client) {
  const requests: unknown[] = [];
  const port: FoundationAuthenticationPort = {
    async withClientIdentity(request, action) {
      requests.push(request);
      return action(record);
    },
  };
  return {
    requests,
    service: createFoundationAuthenticationService(port, {
      environment: "test",
      now: () => now,
      createId: () => correlationId,
    }),
  };
}

test("credential authentication derives only self metadata without adding a read grant", async () => {
  const f = fixture(
    Object.freeze({
      ...client,
      operations: Object.freeze([
        ...client.operations,
      ]) as unknown as FoundationClient["operations"],
    }),
  );
  const actor = await f.service.authenticate(token, projectId.toUpperCase());
  assert.deepEqual(actor, {
    schemaVersion: 1,
    principalId: `foundation-client:${clientId}`,
    clientId,
    runId: null,
    projectId,
    environment: "test",
    resourceIds: [],
    capabilities: ["memory.propose"],
    expiresAt: client.expiresAt,
    correlationId,
  });
  assert.deepEqual(f.requests, [
    {
      tokenDigest: foundationTokenDigest(token),
      projectId,
      environment: "test",
      correlationId,
    },
  ]);
  assert.equal(JSON.stringify(f.requests).includes(token), false);
});

test("legacy and malformed credentials cannot enter the identity repository", async () => {
  for (const invalid of [`ck_${"A".repeat(43)}`, "af_invalid", ""]) {
    const f = fixture();
    await assert.rejects(
      f.service.authenticate(invalid, projectId),
      denied("INVALID_CREDENTIAL"),
    );
    assert.equal(f.requests.length, 0);
  }
});

test("identity metadata requires exact project, environment and a live unrevoked grant", async () => {
  for (const [change, code] of [
    [{ projectId: "20000000-0000-4000-8000-000000000001" }, "FORBIDDEN"],
    [{ environment: "production" }, "FORBIDDEN"],
    [{ expiresAt: now.toISOString() }, "EXPIRED"],
    [{ revokedAt: "2026-10-15T12:00:00.000Z" }, "REVOKED"],
  ] as const)
    await assert.rejects(
      fixture({ ...client, ...change }).service.authenticate(token, projectId),
      denied(code),
    );
});

test("owner-only and forged credential metadata fail rather than become an owner actor", async () => {
  const f = fixture({
    ...client,
    operations: [
      "instruction.approve",
    ] as unknown as FoundationClient["operations"],
  });
  await assert.rejects(f.service.authenticate(token, projectId));
});

test("reserved evaluation grants can identify themselves without claiming an implemented writer", async () => {
  const actor = await fixture({
    ...client,
    operations: ["evaluation.record"],
  }).service.authenticate(token, projectId);
  assert.deepEqual(actor.capabilities, ["evaluation.record"]);
  assert.equal("supportedOperations" in actor, false);
});
