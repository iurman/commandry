import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  observatoryViewSchema,
  observatoryViewCreateSchema,
  observatoryViewUpdateSchema,
  observatoryViewDeleteSchema,
  observatoryViewReadSchema,
  observatoryViewPageQuerySchema,
  observatoryViewPageSchema,
  observatoryViewDeletedSchema,
} from "./observatory-views";
const id = randomUUID(),
  projectId = randomUUID();
const configuration = { schemaVersion: 2 as const };
const create = {
  id,
  projectId,
  name: "Private view",
  expectedVersion: 0,
  configuration,
};
const view = {
  schemaVersion: 1,
  id,
  projectId,
  name: "Private view",
  version: 1,
  configuration,
  updatedAt: "2026-10-16T12:00:00.000Z",
};
describe("strict owner-private named-view contracts", () => {
  it("requires an opaque create UUID and exact version while preserving explicit project scope", () => {
    expect(
      observatoryViewCreateSchema.parse({
        ...create,
        id: id.toUpperCase(),
        name: "  Private view  ",
      }),
    ).toMatchObject({
      id,
      projectId,
      name: "Private view",
      expectedVersion: 0,
    });
    expect(
      observatoryViewCreateSchema.parse({
        id,
        name: "Global",
        expectedVersion: 0,
        configuration,
      }).projectId,
    ).toBeNull();
    for (const request of [
      { ...create, id: undefined },
      { ...create, id: "name-derived-key" },
      { ...create, expectedVersion: 1 },
      { ...create, expectedVersion: "0" },
      { ...create, name: " " },
      { ...create, projectId: "invalid" },
    ])
      expect(observatoryViewCreateSchema.safeParse(request).success).toBe(
        false,
      );
  });
  it("never allows omission to widen an update to global scope", () => {
    expect(
      observatoryViewUpdateSchema.parse({
        ...create,
        expectedVersion: 2,
        projectId: null,
      }).projectId,
    ).toBeNull();
    expect(
      observatoryViewUpdateSchema.safeParse({
        ...create,
        expectedVersion: 1,
        projectId: undefined,
      }).success,
    ).toBe(false);
    for (const expectedVersion of [0, -1, 1.5, "1", null])
      expect(
        observatoryViewUpdateSchema.safeParse({ ...create, expectedVersion })
          .success,
      ).toBe(false);
    expect(
      observatoryViewDeleteSchema.parse({ id, expectedVersion: 3 }),
    ).toEqual({ id, expectedVersion: 3 });
    expect(
      observatoryViewDeleteSchema.safeParse({ id, expectedVersion: 0 }).success,
    ).toBe(false);
  });
  it.each([
    "ownerId",
    "owner",
    "sessionId",
    "session",
    "principalId",
    "capabilities",
    "approved",
    "shareUrl",
  ])("rejects injected authority or sharing field %s", (field) => {
    expect(
      observatoryViewCreateSchema.safeParse({ ...create, [field]: "injected" })
        .success,
    ).toBe(false);
    expect(
      observatoryViewSchema.safeParse({ ...view, [field]: "injected" }).success,
    ).toBe(false);
    expect(
      observatoryViewReadSchema.safeParse({ id, [field]: "injected" }).success,
    ).toBe(false);
  });
  it("reuses valid v2 configuration and rejects corrupt or canonical mapping payloads", () => {
    const resourceIds = Array.from({ length: 1000 }, () => randomUUID());
    const parsed = observatoryViewCreateSchema.parse({
      ...create,
      configuration: {
        schemaVersion: 2,
        grouping: "custom",
        sectors: [
          {
            id: "private",
            label: "Private sector label",
            grouping: "providers",
            resourceIds,
          },
        ],
        palette: { impact: "#c05566" },
      },
    });
    expect(parsed.configuration.sectors[0]?.resourceIds).toHaveLength(1000);
    expect(parsed.configuration.camera).toBe("composed");
    expect(parsed.configuration.lens).toBe(false);
    for (const value of [
      null,
      { schemaVersion: 1 },
      { schemaVersion: 2, relations: [] },
      { schemaVersion: 2, ownerId: "private" },
      { schemaVersion: 2, palette: { impact: "javascript:x" } },
      {
        schemaVersion: 2,
        sectors: [
          { id: "x", label: "X", grouping: "hosts", resourceIds: [id, id] },
        ],
      },
    ])
      expect(
        observatoryViewCreateSchema.safeParse({
          ...create,
          configuration: value,
        }).success,
      ).toBe(false);
  });
  it("provides complete bounded continuation and distinct global/all-project filters", () => {
    expect(observatoryViewPageQuerySchema.parse({})).toEqual({
      cursor: null,
      limit: 25,
    });
    expect(observatoryViewPageQuerySchema.parse({ projectId: null })).toEqual({
      projectId: null,
      cursor: null,
      limit: 25,
    });
    expect(
      observatoryViewPageQuerySchema.parse({
        projectId,
        cursor: id,
        limit: 100,
      }),
    ).toMatchObject({ projectId, cursor: id, limit: 100 });
    for (const request of [
      { limit: 101 },
      { limit: 0 },
      { limit: "25" },
      { cursor: "opaque-not-uuid" },
      { ownerId: id },
    ])
      expect(observatoryViewPageQuerySchema.safeParse(request).success).toBe(
        false,
      );
    expect(
      observatoryViewPageSchema.safeParse({
        schemaVersion: 1,
        items: [view],
        total: 137,
        nextCursor: id,
      }).success,
    ).toBe(true);
    for (const page of [
      { items: [], total: 0, nextCursor: id },
      { items: [view, view], total: 137, nextCursor: id },
      { items: [view], total: 1, nextCursor: id },
      { items: [view], total: 0, nextCursor: null },
      { items: [view], total: 137, nextCursor: randomUUID() },
    ])
      expect(
        observatoryViewPageSchema.safeParse({ schemaVersion: 1, ...page })
          .success,
      ).toBe(false);
  });
  it("returns strict public records and deletion receipts without owner/session data", () => {
    expect(Object.keys(observatoryViewSchema.parse(view)).sort()).toEqual(
      [
        "schemaVersion",
        "id",
        "projectId",
        "name",
        "version",
        "configuration",
        "updatedAt",
      ].sort(),
    );
    expect(
      observatoryViewSchema.safeParse({ ...view, updatedAt: "not-time" })
        .success,
    ).toBe(false);
    expect(
      observatoryViewDeletedSchema.parse({
        schemaVersion: 1,
        id,
        version: 2,
        deleted: true,
        updatedAt: view.updatedAt,
      }),
    ).toMatchObject({ id, deleted: true });
  });
});
