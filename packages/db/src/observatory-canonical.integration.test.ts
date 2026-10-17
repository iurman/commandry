import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { eq, sql } from "drizzle-orm";
import {
  createFoundationOwnerService,
  createObservatoryManagementService,
} from "@commandry/application";
import { FoundationError } from "@commandry/domain";
import { createDatabase } from "./client";
import { createFoundationAccessRepository } from "./foundation-access-repository";
import { createObservatoryManagementRepository } from "./observatory-management-repository";
import { collectObservatoryRecords } from "./observatory-records";
import {
  observatoryAnnotation,
  observatoryClientScope,
  observatorySource,
} from "./observatory-schema";
import { foundationClient } from "./foundation-schema";
import {
  auditEvent,
  project,
  projectResourceLink,
  resource,
  session,
  user,
} from "./schema";
const adminUrl = process.env.COMMANDRY_TEST_DATABASE_URL;
const password = process.env.COMMANDRY_TEST_RUNTIME_PASSWORD;
if (!adminUrl || !password)
  throw new Error("Use the disposable PostgreSQL harness");
const runtimeUrl = new URL(adminUrl);
runtimeUrl.username = "commandry_app_integration";
runtimeUrl.password = password;
const denied = (code: string) => (error: unknown) =>
  error instanceof FoundationError && error.code === code;

test(
  "reviewed Observatory records use actual owner sessions, canonical versions, exact bindings and atomic audits",
  { timeout: 120000 },
  async (t) => {
    const admin = createDatabase({ connectionString: adminUrl, max: 3 });
    const runtime = createDatabase({
      connectionString: runtimeUrl.toString(),
      max: 3,
    });
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 3600000).toISOString();
    const userId = randomUUID(),
      sessionId = randomUUID(),
      projectId = randomUUID(),
      otherProjectId = randomUUID(),
      hostId = randomUUID(),
      serviceId = randomUUID(),
      repoId = randomUUID(),
      foreignId = randomUUID();
    await admin.db.insert(user).values({
      id: userId,
      name: "Observatory owner",
      email: userId + "@example.test",
    });
    await admin.db.insert(session).values({
      id: sessionId,
      userId,
      token: randomUUID(),
      expiresAt: new Date(expiresAt),
    });
    await admin.db.insert(project).values([
      { id: projectId, name: "Authorized scene" },
      { id: otherProjectId, name: "Private project" },
    ]);
    await admin.db.insert(resource).values([
      { id: hostId, name: "Known host", kind: "host" },
      {
        id: serviceId,
        name: "Known service",
        kind: "service",
        parentResourceId: hostId,
      },
      { id: repoId, name: "Known repository", kind: "repository" },
      { id: foreignId, name: "Hidden", kind: "host" },
    ]);
    await admin.db.insert(projectResourceLink).values(
      [hostId, serviceId, repoId].map((resourceId) => ({
        id: randomUUID(),
        projectId,
        resourceId,
        type: "relates_to" as const,
        sourceKind: "project" as const,
        targetKind: "resource" as const,
        lifecycle: "active" as const,
      })),
    );
    await admin.db.insert(projectResourceLink).values({
      id: randomUUID(),
      projectId: otherProjectId,
      resourceId: foreignId,
      type: "relates_to",
      sourceKind: "project",
      targetKind: "resource",
      lifecycle: "active",
    });
    const owner = { principalId: "user:" + userId, sessionId, expiresAt };
    const service = createObservatoryManagementService(
      createObservatoryManagementRepository(runtime.db),
    );
    const review = {
      evidenceRefs: ["fixture:verified-source"],
      note: "Explicit reviewed record",
    };
    const annotation = {
      resourceId: hostId,
      expectedVersion: 0,
      role: "operated" as const,
      pinned: true,
      environment: "production",
      requirement: "required" as const,
      review,
    };
    try {
      await t.test(
        "an identity marker without its live canonical session grants no write",
        async () => {
          await assert.rejects(
            () =>
              service.review(
                { ...owner, sessionId: randomUUID() },
                "annotation",
                annotation,
              ),
            denied("FORBIDDEN"),
          );
          assert.equal(
            (
              await runtime.db
                .select()
                .from(observatoryAnnotation)
                .where(eq(observatoryAnnotation.resourceId, hostId))
            ).length,
            0,
          );
        },
      );
      await t.test(
        "two concurrent expected-version writes admit exactly one and preserve a denied audit",
        async () => {
          const results = await Promise.allSettled([
            service.review(owner, "annotation", annotation),
            service.review(owner, "annotation", {
              ...annotation,
              pinned: false,
            }),
          ]);
          assert.equal(
            results.filter((r) => r.status === "fulfilled").length,
            1,
          );
          const failure = results.find((r) => r.status === "rejected");
          assert.ok(
            failure &&
              failure.status === "rejected" &&
              denied("VERSION_CONFLICT")(failure.reason),
          );
          const [record] = await runtime.db
            .select()
            .from(observatoryAnnotation)
            .where(eq(observatoryAnnotation.resourceId, hostId));
          assert.equal(record?.version, 1);
          assert.equal(record?.metadata.provenance.actorId, owner.principalId);
          const audits = await runtime.db
            .select()
            .from(auditEvent)
            .where(eq(auditEvent.actor, owner.principalId));
          assert.equal(
            audits.filter((a) => a.details.decision === "allowed").length,
            1,
          );
          assert.equal(
            audits.filter((a) => a.details.decision === "denied").length,
            1,
          );
        },
      );
      await t.test(
        "real resource kinds prevent forged deployment relations",
        async () => {
          const id = randomUUID();
          await assert.rejects(
            () =>
              service.review(owner, "relation", {
                id,
                expectedVersion: 0,
                relation: {
                  id,
                  type: "deploys",
                  sourceId: repoId,
                  targetId: serviceId,
                  sourceKind: "repository",
                  targetKind: "deployment",
                  environment: "production",
                },
                active: true,
                review,
              }),
            denied("INVALID_REFERENCE"),
          );
        },
      );
      await t.test(
        "source identity edits fence leases and never reuse another target's observations",
        async () => {
          const id = randomUUID();
          await service.review(owner, "source", {
            id,
            expectedVersion: 0,
            resourceId: repoId,
            projectId,
            environment: "test",
            kind: "github-repository",
            externalId: "example/project",
            enabled: false,
            freshnessSeconds: 300,
            review,
          });
          await runtime.db
            .update(observatorySource)
            .set({
              snapshot: { signals: [{ resourceId: repoId }] },
              lastSuccessAt: now,
              leaseId: randomUUID(),
              leaseUntil: new Date(now.getTime() + 10000),
            })
            .where(eq(observatorySource.id, id));
          await service.review(owner, "source", {
            id,
            expectedVersion: 1,
            resourceId: repoId,
            projectId,
            environment: "test",
            kind: "github-repository",
            externalId: "example/new-project",
            enabled: false,
            freshnessSeconds: 300,
            review,
          });
          const [row] = await runtime.db
            .select()
            .from(observatorySource)
            .where(eq(observatorySource.id, id));
          assert.equal(row?.snapshot, null);
          assert.equal(row?.leaseId, null);
          assert.equal(row?.version, 2);
        },
      );
      await t.test(
        "a client resource restriction neither adds capabilities nor accepts foreign resources",
        async () => {
          const oldOwner = createFoundationOwnerService(
            createFoundationAccessRepository(runtime.db),
            owner,
            { environment: "test" },
          );
          const issued = await oldOwner.createClient(
            {
              name: "Old client",
              projectId,
              operations: ["resources.read"],
              environment: "test",
              ttlSeconds: 300,
            },
            randomUUID(),
          );
          const id = issued.client.id;
          await assert.rejects(
            () =>
              service.review(owner, "client_scope", {
                clientId: id,
                expectedVersion: 0,
                resourceIds: [foreignId],
                review,
              }),
            denied("INVALID_REFERENCE"),
          );
          await service.review(owner, "client_scope", {
            clientId: id,
            expectedVersion: 0,
            resourceIds: [serviceId],
            review,
          });
          const [client] = await runtime.db
            .select()
            .from(foundationClient)
            .where(eq(foundationClient.id, id));
          assert.deepEqual(client?.operations, ["resources.read"]);
          const [scope] = await runtime.db
            .select()
            .from(observatoryClientScope)
            .where(eq(observatoryClientScope.clientId, id));
          assert.deepEqual(scope?.resourceIds, [serviceId]);
        },
      );
      await t.test(
        "complete transaction-scoped collection follows every page and hides restricted parents",
        async () => {
          const extra = Array.from({ length: 137 }, (_, i) => ({
            id: randomUUID(),
            name: "Extra " + i,
            kind: "repository",
          }));
          await admin.db.insert(resource).values(extra);
          await admin.db.insert(projectResourceLink).values(
            extra.map((r) => ({
              id: randomUUID(),
              projectId,
              resourceId: r.id,
              type: "relates_to" as const,
              sourceKind: "project" as const,
              targetKind: "resource" as const,
              lifecycle: "active" as const,
            })),
          );
          const input = await runtime.db.transaction(
            (tx) =>
              collectObservatoryRecords(tx, {
                projectId,
                resourceIds: null,
                scopeDigest: "scope",
              }),
            { isolationLevel: "repeatable read" },
          );
          assert.equal(input.resources.length, 140);
          assert.equal(input.collection.resourceCount, 140);
          assert.ok(!JSON.stringify(input).includes("Private project"));
          const restricted = await runtime.db.transaction(
            (tx) =>
              collectObservatoryRecords(tx, {
                projectId,
                resourceIds: [serviceId],
                scopeDigest: "restricted",
              }),
            { isolationLevel: "repeatable read" },
          );
          assert.equal(restricted.resources.length, 1);
          assert.equal(restricted.resources[0]?.parentResourceId, null);
          assert.equal(restricted.resources[0]?.childCount, 0);
          assert.ok(!JSON.stringify(restricted).includes(hostId));
        },
      );
      await t.test(
        "additive migration repeats preserve populated IDs, links, versions and grants",
        async () => {
          const before = (
            await runtime.db.select({ id: resource.id }).from(resource)
          )
            .map((r) => r.id)
            .sort();
          const migration = await readFile(
            new URL(
              "../migrations/0070_observatory_canonical_records.sql",
              import.meta.url,
            ),
            "utf8",
          );
          await admin.db.execute(sql.raw(migration));
          await admin.db.execute(sql.raw(migration));
          assert.deepEqual(
            (await runtime.db.select({ id: resource.id }).from(resource))
              .map((r) => r.id)
              .sort(),
            before,
          );
          assert.equal(
            (
              await runtime.db
                .select()
                .from(observatoryAnnotation)
                .where(eq(observatoryAnnotation.resourceId, hostId))
            )[0]?.version,
            1,
          );
        },
      );
      await t.test(
        "revoked owner session cannot edit an existing reviewed record",
        async () => {
          await admin.db.delete(session).where(eq(session.id, sessionId));
          await assert.rejects(
            () =>
              service.review(owner, "annotation", {
                ...annotation,
                expectedVersion: 1,
              }),
            denied("FORBIDDEN"),
          );
        },
      );
    } finally {
      await runtime.close();
      await admin.close();
    }
  },
);
