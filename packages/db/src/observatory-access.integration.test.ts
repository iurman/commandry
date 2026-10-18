import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { eq, and, inArray } from "drizzle-orm";
import {
  createFoundationOwnerService,
  createObservatoryManagementService,
  createObservatoryReadService,
  type FoundationMachineRequest,
} from "@commandry/application";
import { FoundationError, foundationTokenDigest } from "@commandry/domain";
import { createDatabase } from "./client";
import { createFoundationAccessRepository } from "./foundation-access-repository";
import { createRealIntegrationRepository } from "./real-integration-repository";
import { createObservatoryManagementRepository } from "./observatory-management-repository";
import {
  createObservatoryMachineReadRepository,
  createObservatoryOwnerReadRepository,
  type ObservatoryOwnerReadRequest,
} from "./observatory-read-repository";
import { collectObservatoryRecords } from "./observatory-records";
import { createObservatoryProviderRepository } from "./observatory-provider-repository";
import { observatoryProviderFeed } from "./observatory-provider-schema";
import { observatoryAnnotation, observatorySource } from "./observatory-schema";
import { foundationAudit, foundationClient } from "./foundation-schema";
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
  "Observatory evidence retains canonical project ownership and live authorization through audit",
  { timeout: 120000 },
  async (t) => {
    const admin = createDatabase({ connectionString: adminUrl, max: 4 });
    const runtime = createDatabase({
      connectionString: runtimeUrl.toString(),
      max: 4,
    });
    const now = new Date();
    const projectId = randomUUID(),
      otherProjectId = randomUUID(),
      hostId = randomUUID(),
      serviceId = randomUUID(),
      userId = randomUUID(),
      sessionId = randomUUID();
    await admin.db.insert(user).values({
      id: userId,
      name: "Access regression",
      email: userId + "@example.test",
    });
    await admin.db.insert(session).values({
      id: sessionId,
      userId,
      token: randomUUID(),
      expiresAt: new Date(now.getTime() + 3600000),
    });
    await admin.db.insert(project).values([
      { id: projectId, name: "Allowed A" },
      { id: otherProjectId, name: "Private B" },
    ]);
    await admin.db.insert(resource).values([
      { id: hostId, name: "Shared host", kind: "host" },
      {
        id: serviceId,
        name: "Shared service",
        kind: "service",
        parentResourceId: hostId,
      },
    ]);
    await admin.db.insert(projectResourceLink).values(
      [projectId, otherProjectId].flatMap((projectId) =>
        [hostId, serviceId].map((resourceId) => ({
          id: randomUUID(),
          projectId,
          resourceId,
          type: "relates_to" as const,
          sourceKind: "project" as const,
          targetKind: "resource" as const,
          lifecycle: "active" as const,
        })),
      ),
    );
    const owner = {
      principalId: "user:" + userId,
      sessionId,
      expiresAt: new Date(now.getTime() + 3600000).toISOString(),
    };
    const management = createObservatoryManagementService(
      createObservatoryManagementRepository(runtime.db),
    );
    const review = {
      evidenceRefs: ["fixture:original evidence "],
      note: "Reviewed explicit ownership",
    };
    const issuer = createFoundationOwnerService(
      createFoundationAccessRepository(runtime.db),
      owner,
      { environment: "test" },
    );
    const issued = await issuer.createClient(
      {
        name: "A-only Observatory",
        projectId,
        environment: "test",
        ttlSeconds: 300,
        operations: ["observatory.read", "observatory.signals.read"],
      },
      randomUUID(),
    );
    const request = (): FoundationMachineRequest => ({
      operation: "observatory.read",
      projectId,
      environment: "test",
      targetId: null,
      correlationId: randomUUID(),
      tokenDigest: foundationTokenDigest(issued.token),
    });
    const read = createObservatoryReadService(
      createObservatoryMachineReadRepository(runtime.db, "observatory.read"),
      { environment: "test" },
    );
    try {
      await t.test(
        "a shared resource never discloses B's newer metrics, diagnostics, raw RAM or envelope IDs to A",
        async () => {
          const sources = createRealIntegrationRepository(runtime.db);
          const make = async (
            projectId: string,
            totalBytes: number,
            age: number,
            prettyName: string,
          ) => {
            const source = (await sources.create(
              {
                name: "Private source " + totalBytes,
                kind: "linux-host",
                projectId,
                resourceId: hostId,
                identifier: "host-" + totalBytes,
                freshnessWindowMinutes: 5,
              },
              "test:observatory-access",
            ))!;
            const token = await sources.rotateToken(
              source.id,
              "test:observatory-access",
            );
            await sources.receive(source.id, token.token, {
              hostname: "host-" + totalBytes,
              sampleId: randomUUID(),
              observedAt: new Date(now.getTime() - age).toISOString(),
              memory: { totalBytes, availableBytes: totalBytes / 2 },
              disk: { totalBytes: 1000, availableBytes: 250 },
              uptimeSeconds: 500,
              load1Milli: totalBytes,
              os: { id: "debian", idLike: [], prettyName, platform: null },
            });
            return source.id;
          };
          const a = await make(projectId, 1000, 2000, "Debian A"),
            b = await make(otherProjectId, 42000, 1000, "Private B Debian");
          const global = await runtime.db.transaction((tx) =>
            collectObservatoryRecords(tx, {
              resourceIds: [hostId],
              scopeDigest: "owner",
            }),
          );
          assert.ok(global.resources[0]?.sources.some((s) => s.id === b));
          assert.equal(
            global.resources[0]?.metrics.find(
              (m) => m.name === "host_memory_total",
            )?.value,
            42000,
          );
          // The platform comes from the same latest validated sample as RAM.
          assert.equal(global.platforms?.[0]?.prettyName, "Private B Debian");
          assert.equal(
            global.platforms?.[0]?.evidenceRef,
            global.resources[0]?.metrics.find(
              (m) => m.name === "host_memory_total",
            )?.evidenceHref,
          );
          const allowed = await runtime.db.transaction((tx) =>
            collectObservatoryRecords(tx, {
              projectId,
              resourceIds: [hostId],
              scopeDigest: "A",
            }),
          );
          assert.deepEqual(
            allowed.resources[0]?.sources.map((s) => s.id),
            [a],
          );
          assert.equal(
            allowed.resources[0]?.metrics.find(
              (m) => m.name === "host_memory_total",
            )?.value,
            1000,
          );
          assert.deepEqual(
            allowed.platforms?.map((item) => item.prettyName),
            ["Debian A"],
          );
          const dto = await read.scene(request(), { projectId });
          const body = JSON.stringify(dto);
          assert.ok(body.includes(a));
          assert.deepEqual(
            dto.scene.platformObservations.map((item) => [
              item.resourceId,
              item.prettyName,
            ]),
            [[hostId, "Debian A"]],
          );
          for (const hidden of [b, otherProjectId, "Private B", "42000"])
            assert.ok(!body.includes(hidden), hidden);
          const foreignRefs = global.resources[0]!.metrics.filter(
            (m) => m.name === "host_memory_total",
          ).map((m) => m.evidenceHref);
          for (const href of foreignRefs) assert.ok(!body.includes(href), href);
        },
      );
      await t.test(
        "multiple A monitors preserve a current failure and cannot import a B monitor",
        async () => {
          const make = async (
            project: string,
            state: "passing" | "failing",
          ) => {
            const id = randomUUID();
            await management.review(owner, "source", {
              id,
              expectedVersion: 0,
              resourceId: serviceId,
              projectId: project,
              environment: "test",
              kind: "infraagent-monitor",
              externalId: id,
              enabled: true,
              freshnessSeconds: 300,
              review,
            });
            await runtime.db
              .update(observatorySource)
              .set({
                snapshot: {
                  details: { sourceState: "available" },
                  signals: [
                    {
                      id: "check:" + id,
                      resourceId: serviceId,
                      sourceId: id,
                      facet: "availability",
                      state,
                      observedAt: now.toISOString(),
                      freshnessMs: 300000,
                      evidenceRefs: ["fixture:" + id],
                      environment: "test",
                      incidentId: null,
                    },
                  ],
                },
                lastSuccessAt: now,
              })
              .where(eq(observatorySource.id, id));
            return id;
          };
          const a = await make(projectId, "passing"),
            b = await make(projectId, "failing"),
            hidden = await make(otherProjectId, "failing");
          const input = await runtime.db.transaction((tx) =>
            collectObservatoryRecords(tx, {
              projectId,
              resourceIds: null,
              scopeDigest: "A",
            }),
          );
          assert.equal(
            input.facetAccess?.filter(
              (f) => f.resourceId === serviceId && f.facet === "availability",
            ).length,
            1,
          );
          assert.deepEqual(
            input.signals?.map((s) => s.sourceId).sort(),
            [a, b].sort(),
          );
          const result = await read.scene(request(), { projectId });
          assert.equal(result.scene.summary.availability.failing, 1);
          assert.ok(!JSON.stringify(result).includes(hidden));
          // A pending monitor retains its last check, but that check cannot
          // borrow current coverage from a different monitor on this service.
          await runtime.db
            .update(observatorySource)
            .set({
              snapshot: {
                details: { sourceState: "unknown" },
                signals: input.signals!.filter(
                  (signal) => signal.sourceId === b,
                ),
              },
            })
            .where(eq(observatorySource.id, b));
          const pending = await read.scene(request(), { projectId });
          assert.equal(pending.scene.summary.availability.failing, 0);
          assert.equal(pending.scene.summary.availability.passing, 1);
          const pendingInput = await runtime.db.transaction((tx) =>
            collectObservatoryRecords(tx, {
              projectId,
              resourceIds: null,
              scopeDigest: "A",
            }),
          );
          assert.equal(
            pendingInput.signals!.find((signal) => signal.sourceId === b)!
              .sourceQualification,
            "last_known",
          );
          assert.equal(
            pendingInput.signals!.find((signal) => signal.sourceId === a)!
              .sourceQualification,
            "current",
          );
          await runtime.db
            .update(observatorySource)
            .set({
              snapshot: {
                details: { sourceState: "unknown" },
                signals: input.signals!.filter(
                  (signal) => signal.sourceId === a,
                ),
              },
            })
            .where(eq(observatorySource.id, a));
          const allPending = await read.scene(request(), { projectId });
          assert.equal(allPending.scene.summary.availability.passing, 0);
          assert.equal(allPending.scene.summary.availability.failing, 0);
          assert.equal(allPending.scene.summary.availability.unknown, 1);
          assert.equal(allPending.scene.summary.coverage.monitored, 0);
          assert.equal(
            allPending.facetAccess.find(
              (f) => f.resourceId === serviceId && f.facet === "availability",
            )!.state,
            "unavailable",
          );
          await runtime.db
            .update(observatorySource)
            .set({
              snapshot: {
                details: { sourceState: "available" },
                signals: input.signals!.filter(
                  (signal) => signal.sourceId === b,
                ),
              },
            })
            .where(eq(observatorySource.id, b));
          await runtime.db
            .update(observatorySource)
            .set({ enabled: false })
            .where(eq(observatorySource.id, a));
          assert.equal(
            (await read.scene(request(), { projectId })).scene.summary
              .availability.failing,
            1,
          );
          await runtime.db
            .update(observatorySource)
            .set({ lastError: "OPERATIONAL_UNAVAILABLE" })
            .where(eq(observatorySource.id, b));
          assert.equal(
            (await read.scene(request(), { projectId })).facetAccess.find(
              (f) => f.resourceId === serviceId && f.facet === "availability",
            )?.state,
            "unavailable",
          );
        },
      );
      await t.test(
        "operational detail SQL binds shared sources to their project before safe complete evidence reads",
        async () => {
          const subject = randomUUID();
          await admin.db.insert(resource).values({
            id: subject,
            kind: "service",
            name: "Detail scope fixture",
          });
          await admin.db.insert(projectResourceLink).values(
            [projectId, otherProjectId].map((id) => ({
              id: randomUUID(),
              projectId: id,
              resourceId: subject,
              type: "relates_to" as const,
              sourceKind: "project" as const,
              targetKind: "resource" as const,
              lifecycle: "active" as const,
            })),
          );
          const metadata = (id: string, project: string, index: number) => ({
            id,
            projectId: project,
            resourceId: subject,
            environment: "test",
            kind: "infraagent-monitor",
            externalId: "detail-" + index,
            enabled: true,
            version: 1,
            freshnessSeconds: 300,
            provenance: {
              actorId: "fixture:operational-detail",
              recordedAt: now.toISOString(),
              evidenceRefs: ["fixture:detail-ownership"],
            },
            snapshot: {
              observedAt: now.toISOString(),
              rawPayload: { secret: "PRIVATE_ORIGINAL" },
              details: {
                monitorId: "detail-" + index,
                monitorStatus: "up",
                enabled: true,
                sourceState: "available",
                reason: "observed",
                lastCheckedAt: now.toISOString(),
                latestCheck: {
                  checkedAt: now.toISOString(),
                  status: "up",
                  responseTimeMs: 12,
                  statusCode: 200,
                },
                openIncident: null,
                recentChecksLimit: 25,
                historyComplete: false,
              },
              signals: [],
            },
          });
          const ownIds = Array.from({ length: 137 }, () => randomUUID()),
            foreignId = randomUUID();
          await admin.db
            .insert(observatorySource)
            .values([
              ...ownIds.map((id, index) => metadata(id, projectId, index)),
              metadata(foreignId, otherProjectId, 999),
            ]);
          const query = {
            projectId,
            resourceId: subject,
            facet: "availability",
          };
          const machine = await read.operationalEvidence(request(), query);
          assert.equal(machine.items.length, 137);
          assert.deepEqual(
            machine.items.map((item) => item.sourceId).sort(),
            ownIds.sort(),
          );
          assert.ok(
            machine.items.every((item) => item.projectId === projectId),
          );
          assert.ok(!JSON.stringify(machine).includes("PRIVATE_ORIGINAL"));
          const ownerRead = createObservatoryReadService(
            createObservatoryOwnerReadRepository(runtime.db, {
              environment: "test",
            }),
            { environment: "test" },
          );
          const configured = await ownerRead.catalogue(
            { identity: owner, projectId },
            { projectId, resourceId: subject, kind: "source" },
          );
          assert.equal(configured.items.length, 137);
          assert.deepEqual(
            configured.items.map((item) => item.id).sort(),
            ownIds.sort(),
          );
          assert.ok(
            configured.items.every(
              (item) =>
                item.kind === "source" &&
                item.version === 1 &&
                item.projectId === projectId,
            ),
          );
          assert.ok(!JSON.stringify(configured).includes("PRIVATE_ORIGINAL"));
          const allConfigured = await ownerRead.catalogue(
            { identity: owner },
            { resourceId: subject, kind: "source" },
          );
          assert.equal(allConfigured.items.length, 138);
          assert.equal(
            (
              await ownerRead.operationalEvidence(
                { identity: owner, projectId },
                query,
              )
            ).items.length,
            137,
          );
          assert.equal(
            (
              await ownerRead.operationalEvidence(
                { identity: owner },
                { resourceId: subject, facet: "availability" },
              )
            ).items.length,
            138,
          );
          await admin.db
            .update(observatorySource)
            .set({
              snapshot: { details: { malformed: "FOREIGN_PRIVATE_DETAILS" } },
            })
            .where(eq(observatorySource.id, foreignId));
          assert.equal(
            (await read.operationalEvidence(request(), query)).items.length,
            137,
          );
          assert.equal(
            (
              await ownerRead.operationalEvidence(
                { identity: owner, projectId },
                query,
              )
            ).items.length,
            137,
          );
          await admin.db
            .update(projectResourceLink)
            .set({ lifecycle: "archived" })
            .where(
              and(
                eq(projectResourceLink.projectId, projectId),
                eq(projectResourceLink.resourceId, subject),
              ),
            );
          await assert.rejects(
            () => read.operationalEvidence(request(), query),
            denied("INVALID_REFERENCE"),
          );
        },
      );
      await t.test(
        "reviewed provider joins retain all structured notices, unknown axes and failed-feed disclosure behind separate grants",
        async () => {
          const providerId = randomUUID(),
            mappingId = randomUUID();
          await admin.db.insert(resource).values({
            id: providerId,
            kind: "provider",
            name: "Cloudflare fixture",
          });
          await admin.db.insert(projectResourceLink).values({
            id: randomUUID(),
            projectId,
            resourceId: providerId,
            type: "relates_to",
            sourceKind: "project",
            targetKind: "resource",
            lifecycle: "active",
          });
          const repo = createObservatoryProviderRepository(runtime.db, {
            now: () => now,
            jitterSeconds: () => 0,
          });
          const claim = await repo.claim();
          assert.ok(claim);
          const notices = Array.from({ length: 137 }, (_, index) => ({
            id: "fixture-notice-" + index,
            kind: "incident" as const,
            title: "Literal <script>untrusted</script>",
            status: "investigating",
            severity: "major",
            componentIds: ["other", "workers"],
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
            resolvedAt: null,
            scheduledFor: null,
            scheduledUntil: null,
            evidenceHref:
              "https://www.cloudflarestatus.com/incidents/fixture-notice-" +
              index,
            updates: [
              {
                id: "update-" + index,
                status: "investigating",
                body: "Literal source text only",
                occurredAt: now.toISOString(),
              },
            ],
          }));
          await repo.complete(claim, {
            snapshot: {
              provider: "cloudflare",
              endpoint: "https://www.cloudflarestatus.com/api/v2/summary.json",
              readAt: now.toISOString(),
              reportedAt: now.toISOString(),
              complete: true,
              components: [
                {
                  id: "workers",
                  name: "Workers fixture",
                  status: "degraded_performance",
                  groupId: null,
                },
              ],
              notices,
            },
            notModified: false,
            etag: "fixture-etag",
            retrySeconds: 120,
            rawPayload: { fixture: "public structured provider snapshot" },
          });
          await management.review(owner, "provider", {
            id: mappingId,
            expectedVersion: 0,
            feedId: "cloudflare",
            componentId: "workers",
            active: true,
            dependency: {
              id: mappingId,
              resourceId: serviceId,
              providerId,
              product: "workers",
              environment: "test",
              geography: "*",
              plane: "data",
            },
            review,
          });
          assert.equal(
            (await read.scene(request(), { projectId })).scene.providerExposures
              .length,
            0,
            "ordinary scene grants cannot disclose provider associations",
          );
          const providerClient = await issuer.createClient(
            {
              name: "Provider detail fixture",
              projectId,
              environment: "test",
              ttlSeconds: 300,
              operations: ["observatory.read", "observatory.providers.read"],
            },
            randomUUID(),
          );
          const providerRequest = {
            ...request(),
            tokenDigest: foundationTokenDigest(providerClient.token),
          };
          const current = await read.scene(providerRequest, { projectId });
          const reached: string[] = [];
          let cursor: Awaited<
            ReturnType<typeof read.providerFeed>
          >["nextCursor"] = null;
          do {
            const page = await read.providerFeed(providerRequest, {
              projectId,
              limit: 50,
              cursor,
            });
            assert.equal(page.feed.state, "current");
            reached.push(...page.items.map((item) => item.id));
            cursor = page.nextCursor;
          } while (cursor);
          assert.equal(new Set(reached).size, 137);
          await assert.rejects(
            () =>
              read.providerFeed(providerRequest, {
                projectId,
                cursor: {
                  afterId: "absent",
                  revision: 1,
                  scopeDigest: current.scene.scopeDigest,
                },
              }),
            denied("INVALID_REFERENCE"),
          );
          const reviewed = await read.catalogue(providerRequest, {
            projectId,
            kind: "provider",
            resourceId: serviceId,
          });
          assert.equal(reviewed.items.length, 1);
          assert.equal(reviewed.items[0]!.version, 1);
          assert.equal(reviewed.items[0]!.kind, "provider");
          await assert.rejects(
            () => read.catalogue(request(), { projectId, kind: "provider" }),
            denied("FORBIDDEN"),
          );
          await assert.rejects(
            () =>
              read.catalogue(providerRequest, { projectId, kind: "source" }),
            denied("FORBIDDEN"),
          );
          assert.equal(current.scene.providerExposures.length, 137);
          assert.ok(
            current.scene.providerExposures.every(
              (notice) =>
                notice.feedState === "current" &&
                notice.relevance === "unknown" &&
                notice.classification === "relevance_unknown",
            ),
          );
          assert.ok(
            current.scene.providerExposures.every(
              (notice) => notice.providerId === providerId,
            ),
          );
          assert.equal(
            current.scene.summary.provider.counts.potential_exposure ?? 0,
            0,
          );
          await admin.db
            .update(observatoryProviderFeed)
            .set({ lastError: "PROVIDER_TIMEOUT" })
            .where(eq(observatoryProviderFeed.id, "cloudflare"));
          const failed = await read.scene(providerRequest, { projectId });
          assert.equal(failed.scene.providerExposures.length, 137);
          assert.ok(
            failed.scene.providerExposures.every(
              (notice) => notice.feedState === "unavailable",
            ),
          );
          assert.equal(
            failed.facetAccess.find(
              (item) =>
                item.resourceId === serviceId && item.facet === "provider",
            )!.state,
            "unavailable",
          );
        },
      );
      await t.test(
        "whitespace review is rejected before persistence; accepted original references round-trip",
        async () => {
          const change = {
            resourceId: hostId,
            expectedVersion: 0,
            role: "operated",
            pinned: false,
            environment: "test",
            requirement: "required",
            review,
          };
          assert.throws(() =>
            management.review(owner, "annotation", {
              ...change,
              review: { ...review, evidenceRefs: ["  \t "] },
            }),
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
          await management.review(owner, "annotation", change);
          const input = await runtime.db.transaction((tx) =>
            collectObservatoryRecords(tx, {
              projectId,
              resourceIds: null,
              scopeDigest: "A",
            }),
          );
          assert.deepEqual(
            input.metadata?.[0]?.provenance.evidenceRefs,
            review.evidenceRefs,
          );
          await read.scene(request(), { projectId });
        },
      );
      await t.test(
        "owner authority and selected project are pinned across auxiliary reads",
        async () => {
          const replacementUser = randomUUID(),
            replacementSession = randomUUID();
          await admin.db.insert(user).values({
            id: replacementUser,
            name: "Replacement owner control",
            email: replacementUser + "@example.test",
          });
          await admin.db.insert(session).values({
            id: replacementSession,
            userId: replacementUser,
            token: randomUUID(),
            expiresAt: new Date(owner.expiresAt),
          });
          const replacement = {
            principalId: "user:" + replacementUser,
            sessionId: replacementSession,
            expiresAt: owner.expiresAt,
          };
          const mutations: ((request: ObservatoryOwnerReadRequest) => void)[] =
            [
              (request) => {
                request.identity = null;
              },
              (request) => {
                request.identity = replacement;
              },
              (request) => {
                request.projectId = otherProjectId;
              },
              (request) => {
                request.identity!.expiresAt = "2099-01-01T00:00:00Z";
              },
            ];
          for (const mutate of mutations) {
            const request: ObservatoryOwnerReadRequest = {
              identity: { ...owner },
              projectId,
            };
            const port = createObservatoryOwnerReadRepository(runtime.db, {
              environment: "test",
            });
            const before = await admin.db
              .select()
              .from(auditEvent)
              .where(eq(auditEvent.operation, "observatory.read"));
            await assert.rejects(
              () =>
                port.withRead(request, async (_access, records) => {
                  const result = await records.readCatalogue!();
                  mutate(request);
                  return result;
                }),
              denied("FORBIDDEN"),
            );
            const after = await admin.db
              .select()
              .from(auditEvent)
              .where(eq(auditEvent.operation, "observatory.read"));
            assert.equal(
              after.length,
              before.length,
              "changed owner context cannot commit a read audit",
            );
          }
        },
      );
      await t.test(
        "exact expiry and invalid clock after the actual final session query withhold delivery",
        async () => {
          for (const mode of ["expired", "invalid"] as const) {
            let delivered = false,
              finalQueries = 0;
            const clock = () =>
              delivered
                ? mode === "expired"
                  ? new Date(owner.expiresAt)
                  : new Date(Number.NaN)
                : new Date(now);
            const wrap = (builder: object): object =>
              new Proxy(builder, {
                get(target, key) {
                  if (key === "then")
                    return (
                      resolve: (value: unknown) => unknown,
                      reject: (error: unknown) => unknown,
                    ) =>
                      Promise.resolve(target)
                        .then((value) => {
                          finalQueries++;
                          delivered = true;
                          return value;
                        })
                        .then(resolve, reject);
                  const value = Reflect.get(target, key);
                  return typeof value === "function"
                    ? (...args: unknown[]) =>
                        wrap(Reflect.apply(value, target, args))
                    : value;
                },
              });
            const database = new Proxy(runtime.db, {
              get(target, key) {
                const value = Reflect.get(target, key);
                if (key === "select")
                  return (...args: unknown[]) =>
                    wrap(Reflect.apply(value, target, args));
                return typeof value === "function" ? value.bind(target) : value;
              },
            });
            const port = createObservatoryOwnerReadRepository(database, {
              environment: "test",
              now: clock,
            });
            await assert.rejects(
              () =>
                port.withRead(
                  { identity: { ...owner }, projectId },
                  async (_access, records) => records.readCatalogue!(),
                ),
              denied(mode === "expired" ? "EXPIRED" : "FORBIDDEN"),
            );
            assert.equal(
              finalQueries,
              1,
              "clock changes after the real post-commit canonical SELECT resolves",
            );
          }
        },
      );
      await t.test(
        "expiry after the awaited allowed audit rolls back canonical mutation and allowed audit",
        async () => {
          const target = randomUUID(),
            shortSession = randomUUID();
          await admin.db
            .insert(resource)
            .values({ id: target, name: "Expiry target", kind: "host" });
          await admin.db.insert(session).values({
            id: shortSession,
            userId,
            token: randomUUID(),
            expiresAt: new Date(now.getTime() + 1000),
          });
          let calls = 0;
          const clock = () =>
            new Date(now.getTime() + (++calls >= 3 ? 2000 : 0));
          const shortOwner = {
            ...owner,
            sessionId: shortSession,
            expiresAt: new Date(now.getTime() + 1000).toISOString(),
          };
          const service = createObservatoryManagementService(
            createObservatoryManagementRepository(runtime.db, clock),
          );
          await assert.rejects(
            () =>
              service.review(shortOwner, "annotation", {
                resourceId: target,
                expectedVersion: 0,
                role: "operated",
                pinned: false,
                environment: null,
                requirement: "unspecified",
                review,
              }),
            denied("EXPIRED"),
          );
          assert.ok(calls >= 3);
          assert.equal(
            (
              await runtime.db
                .select()
                .from(observatoryAnnotation)
                .where(eq(observatoryAnnotation.resourceId, target))
            ).length,
            0,
          );
          const audits = await runtime.db
            .select()
            .from(auditEvent)
            .where(eq(auditEvent.actor, owner.principalId));
          assert.equal(
            audits.filter(
              (a) =>
                a.details.targetId === target &&
                a.details.decision === "allowed",
            ).length,
            0,
          );
          assert.equal(
            audits.filter(
              (a) =>
                a.details.targetId === target &&
                a.details.decision === "denied" &&
                a.details.code === "EXPIRED",
            ).length,
            1,
          );
        },
      );
      await t.test(
        "actual machine adapter withholds expired reads, records denial and rejects revoked credentials",
        async () => {
          let ticks = 0;
          const clock = () =>
            new Date(now.getTime() + (++ticks > 7 ? 600000 : 0));
          const expiring = createObservatoryMachineReadRepository(
            runtime.db,
            "observatory.read",
            { now: clock },
          );
          const req = request();
          await assert.rejects(
            () =>
              expiring.withRead(req, async (_access, records) => {
                const result = await records.readObservatory();
                ticks = 100;
                return result;
              }),
            denied("EXPIRED"),
          );
          const audits = await runtime.db
            .select()
            .from(foundationAudit)
            .where(eq(foundationAudit.correlationId, req.correlationId));
          assert.deepEqual(
            audits.map((a) => [a.decision, a.code]),
            [["denied", "EXPIRED"]],
          );
          await admin.db
            .update(foundationClient)
            .set({ revokedAt: new Date() })
            .where(eq(foundationClient.id, issued.client.id));
          await assert.rejects(
            () => read.scene(request(), { projectId }),
            denied("REVOKED"),
          );
        },
      );
      await t.test(
        "owner adapter rechecks expiry after its read audit",
        async () => {
          const shortSession = randomUUID();
          await admin.db.insert(session).values({
            id: shortSession,
            userId,
            token: randomUUID(),
            expiresAt: new Date(now.getTime() + 1000),
          });
          let auditCompleted = false;
          const afterAudit = (builder: object): object =>
            new Proxy(builder, {
              get(target, key) {
                if (key === "then")
                  return (
                    resolve: (value: unknown) => unknown,
                    reject: (error: unknown) => unknown,
                  ) =>
                    Promise.resolve(target)
                      .then((value) => {
                        auditCompleted = true;
                        return value;
                      })
                      .then(resolve, reject);
                const value = Reflect.get(target, key);
                return typeof value === "function"
                  ? (...args: unknown[]) =>
                      afterAudit(Reflect.apply(value, target, args))
                  : value;
              },
            });
          const database = new Proxy(runtime.db, {
            get(target, key) {
              if (key === "transaction")
                return (...args: unknown[]) => {
                  const callback = args[0];
                  assert.equal(typeof callback, "function");
                  args[0] = (transaction: object) =>
                    Reflect.apply(
                      callback as (...values: unknown[]) => unknown,
                      undefined,
                      [
                        new Proxy(transaction, {
                          get(tx, member) {
                            const value = Reflect.get(tx, member);
                            if (member === "insert")
                              return (...values: unknown[]) => {
                                const builder = Reflect.apply(
                                  value,
                                  tx,
                                  values,
                                );
                                if (values[0] === auditEvent) {
                                  assert.ok(
                                    builder !== null &&
                                      typeof builder === "object",
                                  );
                                  return afterAudit(builder);
                                }
                                return builder;
                              };
                            return typeof value === "function"
                              ? value.bind(tx)
                              : value;
                          },
                        }),
                      ],
                    );
                  return Reflect.apply(target.transaction, target, args);
                };
              const value = Reflect.get(target, key);
              return typeof value === "function" ? value.bind(target) : value;
            },
          });
          const port = createObservatoryOwnerReadRepository(database, {
            environment: "test",
            now: () => new Date(now.getTime() + (auditCompleted ? 2000 : 0)),
          });
          const before = (
            await runtime.db
              .select()
              .from(auditEvent)
              .where(
                and(
                  eq(auditEvent.actor, owner.principalId),
                  eq(auditEvent.operation, "observatory.read"),
                ),
              )
          ).length;
          await assert.rejects(
            () =>
              port.withRead(
                {
                  identity: {
                    ...owner,
                    sessionId: shortSession,
                    expiresAt: new Date(now.getTime() + 1000).toISOString(),
                  },
                  projectId,
                },
                async (_access, records) => records.readObservatory(),
              ),
            denied("EXPIRED"),
          );
          assert.equal(
            auditCompleted,
            true,
            "Expiry changes only after the actual audit INSERT resolves",
          );
          assert.equal(
            (
              await runtime.db
                .select()
                .from(auditEvent)
                .where(
                  and(
                    eq(auditEvent.actor, owner.principalId),
                    eq(auditEvent.operation, "observatory.read"),
                  ),
                )
            ).length,
            before,
          );
        },
      );
    } finally {
      // Release only this fixture's scheduled sources; immutable evidence stays intact.
      await admin.db
        .update(observatorySource)
        .set({ enabled: false, leaseId: null, leaseUntil: null })
        .where(
          inArray(observatorySource.projectId, [projectId, otherProjectId]),
        );
      await runtime.close();
      await admin.close();
    }
  },
);
