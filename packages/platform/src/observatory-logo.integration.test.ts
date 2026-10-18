import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { eq, sql } from "drizzle-orm";
import sharp from "sharp";
import {
  createObservatoryLogoService,
  createObservatoryReadService,
  type ObservatoryLogoRepositoryReader,
} from "@commandry/application";
import { FoundationError } from "@commandry/domain";
import {
  createDatabase,
  createObservatoryLogoRepository,
  createObservatoryOwnerReadRepository,
  schema,
} from "@commandry/db";
import { createObservatoryLogoProcessor } from "./observatory-logo-image";

const { auditEvent, project, projectResourceLink, resource, session, user } =
  schema;
const adminUrl = process.env.COMMANDRY_TEST_DATABASE_URL;
const password = process.env.COMMANDRY_TEST_RUNTIME_PASSWORD;
if (!adminUrl || !password)
  throw new Error("Use the disposable PostgreSQL harness");
const runtimeUrl = new URL(adminUrl);
runtimeUrl.username = "commandry_app_integration";
runtimeUrl.password = password;
const denied = (code: string) => (error: unknown) =>
  (error instanceof FoundationError || error instanceof Error) &&
  (error as { code?: string }).code === code;

test(
  "owner-reviewed repository logos are versioned, audited, scoped and projected",
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
      repoId = randomUUID(),
      publicRepoId = randomUUID(),
      hostId = randomUUID();
    await admin.db.insert(user).values({
      id: userId,
      name: "Logo owner",
      email: userId + "@example.test",
    });
    await admin.db.insert(session).values({
      id: sessionId,
      userId,
      token: randomUUID(),
      expiresAt: new Date(expiresAt),
    });
    await admin.db.insert(project).values([
      { id: projectId, name: "ResuPals" },
      { id: otherProjectId, name: "Unrelated" },
    ]);
    await admin.db.insert(resource).values([
      { id: repoId, name: "resupals", kind: "repository" },
      {
        id: publicRepoId,
        name: "lap-fitness",
        kind: "repository",
        externalUrl: "https://github.com/iurman/lap-fitness",
      },
      { id: hostId, name: "electra", kind: "host" },
    ]);
    await admin.db.insert(projectResourceLink).values(
      [repoId, publicRepoId, hostId].map((resourceId) => ({
        id: randomUUID(),
        projectId,
        resourceId,
        type: "relates_to" as const,
        sourceKind: "project" as const,
        targetKind: "resource" as const,
        lifecycle: "active" as const,
      })),
    );
    const owner = { principalId: "user:" + userId, sessionId, expiresAt };
    const port = createObservatoryLogoRepository(runtime.db);
    const file = new Uint8Array(
      await sharp({
        create: {
          width: 64,
          height: 32,
          channels: 4,
          background: { r: 30, g: 120, b: 220, alpha: 1 },
        },
      })
        .png()
        .toBuffer(),
    );
    const commitSha = "c".repeat(40);
    const reader: ObservatoryLogoRepositoryReader = {
      readFile: async () => ({
        bytes: file,
        commitSha,
        blobSha: "b".repeat(40),
      }),
    };
    const logos = createObservatoryLogoService({
      port,
      processor: createObservatoryLogoProcessor(),
      repositoryReader: reader,
    });
    const upload = {
      kind: "upload" as const,
      fileName: "resupals.png",
      dataBase64: Buffer.from(file).toString("base64"),
    };
    const review = {
      evidenceRefs: ["owner:inspector-preview"],
      note: "Official ResuPals mark",
    };
    const audits = async (operation: string) =>
      runtime.db
        .select()
        .from(auditEvent)
        .where(eq(auditEvent.operation, operation));
    const read = createObservatoryReadService(
      createObservatoryOwnerReadRepository(runtime.db, { environment: "test" }),
      { environment: "test" },
    );
    const logoOf = async (resourceId: string) =>
      (await read.scene({ identity: owner }, {})).scene.representations.find(
        (node) => node.resourceId === resourceId && !node.referenceTo,
      )?.logo;
    const rows = async (resourceId: string) =>
      (
        await runtime.db.execute(
          sql`select version, active, digest, octet_length(image) as bytes, source, provenance from observatory_resource_logo where resource_id = ${resourceId}`,
        )
      ).rows as {
        version: number;
        active: boolean;
        digest: string;
        bytes: number;
        source: { kind: string };
        provenance: { evidenceRefs: string[] };
      }[];
    try {
      let digest = "";
      await t.test("a forged session neither previews nor writes", async () => {
        await assert.rejects(
          () =>
            logos.preview(
              { ...owner, sessionId: randomUUID() },
              { resourceId: repoId, input: upload },
            ),
          denied("FORBIDDEN"),
        );
        assert.equal((await audits("observatory.logo.preview")).length, 0);
      });

      await t.test("only repository resources accept a logo", async () => {
        await assert.rejects(
          () => logos.preview(owner, { resourceId: hostId, input: upload }),
          denied("INVALID_REFERENCE"),
        );
      });

      await t.test("preview is audited and writes no logo", async () => {
        const preview = await logos.preview(owner, {
          resourceId: repoId,
          input: upload,
        });
        digest = preview.image.digest;
        assert.equal(preview.image.width, 128);
        const [audit] = await audits("observatory.logo.preview");
        assert.deepEqual(audit?.details, {
          targetId: repoId,
          sourceKind: "upload",
          target: "resupals.png",
          decision: "allowed",
        });
        assert.deepEqual(await rows(repoId), []);
      });

      await t.test(
        "two concurrent approvals at one version admit exactly one",
        async () => {
          const approve = () =>
            logos.review(owner, {
              expectedVersion: 0,
              resourceId: repoId,
              active: true,
              expectedDigest: digest,
              input: upload,
              review,
            });
          const results = await Promise.allSettled([approve(), approve()]);
          assert.equal(
            results.filter((result) => result.status === "fulfilled").length,
            1,
          );
          const rejected = results.find(
            (result) => result.status === "rejected",
          ) as PromiseRejectedResult;
          assert.ok(denied("VERSION_CONFLICT")(rejected.reason));
          const decisions = (await audits("observatory.logo.review")).map(
            (row) => (row.details as { decision: string }).decision,
          );
          assert.deepEqual(decisions.sort(), ["allowed", "denied"]);
          const allowed = (await audits("observatory.logo.review")).find(
            (row) =>
              (row.details as { decision: string }).decision === "allowed",
          )!;
          assert.equal(
            (allowed.details as { imageDigest: string }).imageDigest,
            digest,
          );
          assert.equal((allowed.details as { note: string }).note, review.note);
        },
      );

      await t.test(
        "the approved logo reaches the scene, catalogue and digest read",
        async () => {
          assert.deepEqual(await logoOf(repoId), {
            digest,
            mediaType: "image/png",
            width: 128,
            height: 128,
            version: 1,
          });
          assert.equal(await logoOf(publicRepoId), undefined);
          const catalogue = await read.catalogue(
            { identity: owner },
            { kind: "logo", resourceId: repoId },
          );
          assert.equal(catalogue.kind, "logo");
          const [item] = catalogue.items as Record<string, unknown>[];
          assert.equal(item?.digest, digest);
          assert.equal(item?.active, true);
          assert.equal("dataBase64" in item!, false);
          assert.equal((item?.source as { kind: string }).kind, "upload");
          const image = await read.logo(
            { identity: owner },
            { resourceId: repoId, digest },
          );
          assert.equal(image.version, 1);
          assert.equal(
            (
              await sharp(
                Buffer.from(image.image.dataBase64, "base64"),
              ).metadata()
            ).width,
            128,
          );
          await assert.rejects(
            () =>
              read.logo(
                { identity: owner },
                { resourceId: repoId, digest: "0".repeat(64) },
              ),
            denied("NOT_FOUND"),
          );
        },
      );

      await t.test(
        "the image read stays inside the authorized project scope",
        async () => {
          await assert.rejects(
            () =>
              read.logo(
                { identity: owner, projectId: otherProjectId },
                { projectId: otherProjectId, resourceId: repoId, digest },
              ),
            denied("INVALID_REFERENCE"),
          );
          await assert.rejects(
            () =>
              read.logo(
                { identity: { ...owner, sessionId: randomUUID() } },
                { resourceId: repoId, digest },
              ),
            denied("FORBIDDEN"),
          );
        },
      );

      await t.test(
        "a repository file needs a reviewed identity, checked again at write",
        async () => {
          await assert.rejects(
            () =>
              logos.preview(owner, {
                resourceId: repoId,
                input: {
                  kind: "repository_file",
                  repository: "iurman/resupals",
                  path: "public/logo.png",
                  ref: null,
                },
              }),
            denied("LOGO_REPOSITORY_NOT_REVIEWED"),
          );
          const preview = await logos.preview(owner, {
            resourceId: publicRepoId,
            input: {
              kind: "repository_file",
              repository: "iurman/Lap-Fitness",
              path: "public/logo.png",
              ref: null,
            },
          });
          assert.equal(preview.source.kind, "repository_file");
          // The canonical URL changes between preview and approval.
          await admin.db
            .update(resource)
            .set({ externalUrl: "https://github.com/iurman/other" })
            .where(eq(resource.id, publicRepoId));
          await assert.rejects(
            () =>
              port.review(owner, {
                resourceId: publicRepoId,
                expectedVersion: 0,
                active: true,
                image: {
                  png: Buffer.from(preview.image.dataBase64, "base64"),
                  digest: preview.image.digest,
                },
                source: preview.source,
                review,
                contentDigest: "e".repeat(64),
              }),
            denied("INVALID_REFERENCE"),
          );
          assert.deepEqual(await rows(publicRepoId), []);
        },
      );

      await t.test(
        "retiring hides the logo but keeps the reviewed image and source",
        async () => {
          await assert.rejects(
            () =>
              logos.review(owner, {
                expectedVersion: 0,
                resourceId: repoId,
                active: false,
                expectedDigest: null,
                input: null,
                review,
              }),
            denied("VERSION_CONFLICT"),
          );
          const receipt = await logos.review(owner, {
            expectedVersion: 1,
            resourceId: repoId,
            active: false,
            expectedDigest: null,
            input: null,
            review: { evidenceRefs: ["owner:rebrand"], note: "Retired" },
          });
          assert.equal(receipt.version, 2);
          assert.equal(await logoOf(repoId), undefined);
          const [row] = await rows(repoId);
          assert.equal(row?.active, false);
          assert.equal(row?.version, 2);
          assert.equal(row?.digest, digest);
          assert.equal(row?.source.kind, "upload");
          assert.deepEqual(row?.provenance.evidenceRefs, ["owner:rebrand"]);
          assert.ok(row && row.bytes > 33);
          const retired = await read.catalogue(
            { identity: owner },
            { kind: "logo", resourceId: repoId },
          );
          assert.equal(
            (retired.items[0] as { active: boolean } | undefined)?.active,
            false,
          );
        },
      );

      await t.test("a resource without a logo cannot be retired", async () => {
        await assert.rejects(
          () =>
            logos.review(owner, {
              expectedVersion: 0,
              resourceId: publicRepoId,
              active: false,
              expectedDigest: null,
              input: null,
              review,
            }),
          denied("NOT_FOUND"),
        );
      });
    } finally {
      await admin.db.execute(
        sql`delete from observatory_resource_logo where resource_id in (${repoId}, ${publicRepoId})`,
      );
      await runtime.pool.end();
      await admin.pool.end();
    }
  },
);
