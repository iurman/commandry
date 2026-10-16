import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { eq, sql } from "drizzle-orm";
import { FoundationError } from "@commandry/domain";
import { createCatalogRepository, resourceSummary } from "./catalog-repository";
import { createDatabase } from "./client";
import { migrateDatabase } from "./migrate";
import {
  canonicalResourceSummary,
  listCanonicalProjectResources,
} from "./project-resource-query";
import { project, projectResourceLink, resource } from "./schema";

const connectionString = process.env.COMMANDRY_TEST_DATABASE_URL;
if (!connectionString) throw new Error("Use the disposable PostgreSQL harness");

async function fixture() {
  await migrateDatabase({ connectionString: connectionString! });
  const database = createDatabase({
    connectionString: connectionString!,
    max: 1,
  });
  try {
    const projectId = randomUUID();
    const foreignProjectId = randomUUID();
    const emptyProjectId = randomUUID();
    await database.db.insert(project).values([
      { id: projectId, name: "Canonical project resources" },
      { id: foreignProjectId, name: "Foreign resource context" },
      { id: emptyProjectId, name: "No resource edges" },
    ]);
    const foreignParentId = randomUUID();
    const unrelatedChildId = randomUUID();
    const archivedResourceId = randomUUID();
    const foreignResourceId = randomUUID();
    await database.db.insert(resource).values([
      {
        id: foreignParentId,
        kind: "provider",
        name: "Private parent metadata",
        externalUrl: "https://example.invalid/private-parent",
      },
      { id: archivedResourceId, kind: "document", name: "Archived edge only" },
      { id: foreignResourceId, kind: "host", name: "Foreign edge only" },
    ]);
    const kinds = [
      "host",
      "service",
      "repository",
      "other",
      "document",
      "provider",
    ];
    const states = [null, "online", "offline", "archived", "unknown"];
    const resources = Array.from({ length: 136 }, (_, index) => ({
      id: randomUUID(),
      kind: kinds[index % kinds.length]!,
      name: ` \ufeff Resource cafe\u0301 ${index}\r\n `,
      subtype: index % 2 ? null : " Exact subtype ",
      parentResourceId: index === 0 ? foreignParentId : null,
      state: states[index % states.length]!,
      externalUrl:
        index % 2
          ? null
          : `https://example.invalid/resource/${index}?exact=%20#section`,
      lastObservedAt:
        index % 2 ? null : new Date(Date.UTC(2026, 9, 16, 12, 0, 0, index)),
    }));
    await database.db.insert(resource).values(resources);
    // A scoped child's parent and a scoped parent's child stay outside the
    // population unless they have their own active edge in the requested project.
    await database.db.insert(resource).values({
      id: unrelatedChildId,
      kind: "service",
      name: "Unlinked child",
      parentResourceId: resources[1]!.id,
    });
    const prefix = randomUUID().slice(0, 8);
    const edgeId = (value: number) =>
      `${prefix}-0000-4000-8000-${value.toString(16).padStart(12, "0")}`;
    const links = resources.map((item, index) => ({
      id: edgeId((index + 1) * 2),
      projectId,
      resourceId: item.id,
      ...(index % 2
        ? {
            type: "relates_to" as const,
            sourceKind: "project" as const,
            targetKind: "resource" as const,
          }
        : {
            type: "supports" as const,
            sourceKind: "resource" as const,
            targetKind: "project" as const,
          }),
    }));
    links.push({
      id: edgeId(274),
      projectId,
      resourceId: resources[0]!.id,
      type: "relates_to",
      sourceKind: "project",
      targetKind: "resource",
    });
    // Insert backwards so a passing order assertion cannot follow insertion order.
    await database.db.insert(projectResourceLink).values([...links].reverse());
    const foreignCursor = edgeId(101);
    const archivedCursor = edgeId(103);
    const missingCursor = edgeId(105);
    await database.db.insert(projectResourceLink).values([
      {
        id: foreignCursor,
        projectId: foreignProjectId,
        resourceId: resources[0]!.id,
        type: "supports",
        sourceKind: "resource",
        targetKind: "project",
      },
      {
        id: edgeId(99),
        projectId: foreignProjectId,
        resourceId: foreignResourceId,
        type: "supports",
        sourceKind: "resource",
        targetKind: "project",
      },
      {
        id: archivedCursor,
        projectId,
        resourceId: archivedResourceId,
        type: "relates_to",
        sourceKind: "project",
        targetKind: "resource",
        lifecycle: "archived",
      },
    ]);
    const expected = links.map((link) => {
      const item = resources.find(
        (candidate) => candidate.id === link.resourceId,
      )!;
      return {
        id: link.id,
        type: link.type,
        inverseType: link.type === "supports" ? "supported_by" : "relates_to",
        resource: {
          ...item,
          lastObservedAt: item.lastObservedAt?.toISOString() ?? null,
        },
      };
    });
    return {
      database,
      catalog: createCatalogRepository(database.db),
      projectId,
      foreignProjectId,
      emptyProjectId,
      foreignParentId,
      unrelatedChildId,
      archivedResourceId,
      foreignResourceId,
      resources,
      expected,
      foreignCursor,
      archivedCursor,
      missingCursor,
      edgeId,
    };
  } catch (error) {
    await database.close();
    throw error;
  }
}

test(
  "canonical helper and facade page all 137 active relationship edges with exact resource projection",
  { timeout: 30_000 },
  async () => {
    const f = await fixture();
    try {
      assert.equal(resourceSummary, canonicalResourceSummary);
      const seen = new Set<string>();
      const items: typeof f.expected = [];
      let cursor: string | undefined;
      let pages = 0;
      do {
        const input = { limit: 23, ...(cursor ? { cursor } : {}) };
        const page = await listCanonicalProjectResources(
          f.database.db,
          f.projectId,
          input,
          { requireValidCursor: true },
        );
        assert.deepEqual(
          page,
          await listCanonicalProjectResources(
            f.database.db,
            f.projectId,
            input,
          ),
        );
        assert.deepEqual(
          page,
          await f.catalog.listProjectResourceLinks(f.projectId, input),
        );
        assert.deepEqual(
          page.items,
          f.expected.slice(pages * 23, (pages + 1) * 23),
        );
        assert.equal(page.items.length, pages < 5 ? 23 : 22);
        for (const item of page.items) {
          assert.equal(seen.has(item.id), false);
          seen.add(item.id);
          items.push(item);
        }
        pages++;
        assert.ok(
          pages <= 6,
          "Traversal must end after the full eligible population",
        );
        assert.equal(page.nextCursor, pages < 6 ? page.items.at(-1)!.id : null);
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      assert.equal(pages, 6);
      assert.equal(seen.size, 137);
      assert.deepEqual(items, f.expected);
      assert.deepEqual([...seen], [...seen].sort());
      assert.equal(new Set(items.map((item) => item.resource.id)).size, 136);
      const shared = items.filter(
        (item) => item.resource.id === f.resources[0]!.id,
      );
      assert.deepEqual(
        shared.map((item) => [item.type, item.inverseType]),
        [
          ["supports", "supported_by"],
          ["relates_to", "relates_to"],
        ],
      );
      assert.deepEqual(shared[0]!.resource, shared[1]!.resource);
      assert.equal(shared[0]!.resource.parentResourceId, f.foreignParentId);
      for (const hidden of [
        f.foreignParentId,
        f.unrelatedChildId,
        f.archivedResourceId,
        f.foreignResourceId,
      ])
        assert.equal(
          items.some((item) => item.resource.id === hidden),
          false,
        );
      assert.deepEqual(
        new Set(items.map((item) => item.resource.kind)),
        new Set([
          "host",
          "service",
          "repository",
          "other",
          "document",
          "provider",
        ]),
      );
      assert.equal(
        items.some((item) => item.resource.state === "archived"),
        true,
      );
      assert.equal(
        items.some((item) => item.resource.state === null),
        true,
      );
      const nullable = items.find(
        (item) => item.resource.id === f.resources[1]!.id,
      )!.resource;
      for (const field of [
        nullable.subtype,
        nullable.parentResourceId,
        nullable.externalUrl,
        nullable.lastObservedAt,
      ])
        assert.equal(field, null);
      assert.deepEqual(
        Object.keys(nullable).sort(),
        [
          "id",
          "kind",
          "name",
          "subtype",
          "parentResourceId",
          "state",
          "externalUrl",
          "lastObservedAt",
        ].sort(),
      );
      const [persisted] = await f.database.db
        .select()
        .from(resource)
        .where(eq(resource.id, f.resources[0]!.id));
      assert.deepEqual(
        canonicalResourceSummary(persisted!),
        f.expected[0]!.resource,
      );
      assert.deepEqual(
        await f.catalog.getResource(f.resources[0]!.id),
        f.expected[0]!.resource,
      );
      const exact = await listCanonicalProjectResources(
        f.database.db,
        f.projectId,
        { limit: 137 },
      );
      assert.deepEqual(exact, { items: f.expected, nextCursor: null });
      const lookahead = await listCanonicalProjectResources(
        f.database.db,
        f.projectId,
        { limit: 136 },
      );
      assert.deepEqual(lookahead, {
        items: f.expected.slice(0, 136),
        nextCursor: f.expected[135]!.id,
      });
      assert.deepEqual(
        await listCanonicalProjectResources(
          f.database.db,
          f.projectId,
          { limit: 1, cursor: f.expected.at(-1)!.id },
          { requireValidCursor: true },
        ),
        { items: [], nextCursor: null },
      );
      assert.deepEqual(
        await listCanonicalProjectResources(
          f.database.db,
          f.emptyProjectId,
          { limit: 23 },
          { requireValidCursor: true },
        ),
        { items: [], nextCursor: null },
      );
    } finally {
      await f.database.close();
    }
  },
);

test(
  "strict cursors require a live scoped edge while default UUID boundaries retain existing facade behavior",
  { timeout: 30_000 },
  async () => {
    const f = await fixture();
    const unavailable = (error: unknown) =>
      error instanceof FoundationError && error.code === "INVALID_REFERENCE";
    try {
      for (const cursor of [
        f.missingCursor,
        f.foreignCursor,
        f.archivedCursor,
      ]) {
        await assert.rejects(
          listCanonicalProjectResources(
            f.database.db,
            f.projectId,
            { limit: 7, cursor },
            { requireValidCursor: true },
          ),
          unavailable,
        );
        const remainder = f.expected.filter((item) => item.id > cursor);
        const expected = {
          items: remainder.slice(0, 7),
          nextCursor: remainder[6]!.id,
        };
        assert.deepEqual(
          await listCanonicalProjectResources(f.database.db, f.projectId, {
            limit: 7,
            cursor,
          }),
          expected,
        );
        assert.deepEqual(
          await listCanonicalProjectResources(
            f.database.db,
            f.projectId,
            { limit: 7, cursor },
            { requireValidCursor: false },
          ),
          expected,
        );
        assert.deepEqual(
          await f.catalog.listProjectResourceLinks(f.projectId, {
            limit: 7,
            cursor,
          }),
          expected,
        );
      }
      const liveCursor = f.expected[20]!.id;
      const beforeArchive = await listCanonicalProjectResources(
        f.database.db,
        f.projectId,
        { limit: 7, cursor: liveCursor },
        { requireValidCursor: true },
      );
      assert.deepEqual(beforeArchive.items, f.expected.slice(21, 28));
      await assert.rejects(
        listCanonicalProjectResources(
          f.database.db,
          f.foreignProjectId,
          { limit: 7, cursor: liveCursor },
          { requireValidCursor: true },
        ),
        unavailable,
      );
      await f.database.db
        .update(projectResourceLink)
        .set({ lifecycle: "archived" })
        .where(eq(projectResourceLink.id, liveCursor));
      await assert.rejects(
        listCanonicalProjectResources(
          f.database.db,
          f.projectId,
          { limit: 7, cursor: liveCursor },
          { requireValidCursor: true },
        ),
        unavailable,
      );
      assert.deepEqual(
        await f.catalog.listProjectResourceLinks(f.projectId, {
          limit: 7,
          cursor: liveCursor,
        }),
        beforeArchive,
      );
      assert.deepEqual(
        await listCanonicalProjectResources(f.database.db, f.projectId, {
          limit: 7,
          cursor: liveCursor,
        }),
        beforeArchive,
      );
      const restarted = await listCanonicalProjectResources(
        f.database.db,
        f.projectId,
        { limit: 200 },
        { requireValidCursor: true },
      );
      assert.deepEqual(
        restarted.items,
        f.expected.filter((item) => item.id !== liveCursor),
      );
      assert.equal(restarted.nextCursor, null);
      assert.deepEqual(
        await f.catalog.listProjectResourceLinks(f.projectId, {
          limit: 7,
          cursor: f.edgeId(1000),
        }),
        { items: [], nextCursor: null },
      );
    } finally {
      await f.database.close();
    }
  },
);

test(
  "helper runs on the supplied single-connection transaction and its select-only read works in a read-only transaction",
  { timeout: 30_000 },
  async () => {
    const f = await fixture();
    try {
      const input = { limit: 7, cursor: f.expected[6]!.id };
      const outside = await listCanonicalProjectResources(
        f.database.db,
        f.projectId,
        input,
        { requireValidCursor: true },
      );
      await f.database.db.transaction(async (tx) => {
        await tx.execute(sql`set transaction read only`);
        assert.deepEqual(
          await listCanonicalProjectResources(tx, f.projectId, input, {
            requireValidCursor: true,
          }),
          outside,
        );
      });
      const rollback = new Error("Roll back synthetic transaction fixture");
      const uncommittedResourceId = randomUUID();
      const uncommittedLinkId = f.edgeId(276);
      await assert.rejects(
        f.database.db.transaction(async (tx) => {
          await tx.insert(resource).values({
            id: uncommittedResourceId,
            kind: "other",
            name: "Visible only inside supplied transaction",
          });
          await tx.insert(projectResourceLink).values({
            id: uncommittedLinkId,
            projectId: f.projectId,
            resourceId: uncommittedResourceId,
            type: "supports",
            sourceKind: "resource",
            targetKind: "project",
          });
          const page = await listCanonicalProjectResources(
            tx,
            f.projectId,
            { limit: 7, cursor: f.expected.at(-1)!.id },
            { requireValidCursor: true },
          );
          assert.equal(page.items.length, 1);
          assert.equal(page.items[0]!.id, uncommittedLinkId);
          assert.equal(page.items[0]!.resource.id, uncommittedResourceId);
          assert.equal(page.nextCursor, null);
          const end = await listCanonicalProjectResources(
            tx,
            f.projectId,
            { limit: 7, cursor: uncommittedLinkId },
            { requireValidCursor: true },
          );
          assert.deepEqual(end, { items: [], nextCursor: null });
          throw rollback;
        }),
        (error: unknown) => error === rollback,
      );
      assert.deepEqual(
        await listCanonicalProjectResources(f.database.db, f.projectId, {
          limit: 200,
        }),
        { items: f.expected, nextCursor: null },
      );
      assert.deepEqual(
        await f.database.db
          .select()
          .from(resource)
          .where(eq(resource.id, uncommittedResourceId)),
        [],
      );
    } finally {
      await f.database.close();
    }
  },
);
