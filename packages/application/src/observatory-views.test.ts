import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  OBSERVATORY_VIEW_POLICIES,
  createObservatoryViewsService,
} from "./observatory-views";
import type {
  ObservatoryViewRecords,
  ObservatoryViewsPort,
} from "./observatory-views";
import { observatoryViewSchema } from "@commandry/contracts";

const owner = {
  principalId: `user:${randomUUID()}`,
  sessionId: randomUUID(),
  expiresAt: "2026-10-16T13:00:00.000Z",
};
const id = randomUUID(),
  projectId = randomUUID();
const view = observatoryViewSchema.parse({
  schemaVersion: 1,
  id,
  projectId,
  name: "Private presentation",
  version: 1,
  configuration: { schemaVersion: 2 },
  updatedAt: "2026-10-16T12:00:00.000Z",
});
function setup() {
  const records: ObservatoryViewRecords = {
    create: vi.fn(async () => view),
    update: vi.fn(async () => ({ ...view, version: 2 })),
    delete: vi.fn(async () => ({
      schemaVersion: 1 as const,
      id,
      version: 3,
      deleted: true as const,
      updatedAt: view.updatedAt,
    })),
    read: vi.fn(async () => view),
    page: vi.fn(async () => ({
      schemaVersion: 1 as const,
      items: [view],
      total: 1,
      nextCursor: null,
    })),
  };
  const withOwner = vi.fn();
  const port: ObservatoryViewsPort = {
    async withOwner(identity, callback) {
      withOwner(identity);
      expect(identity).toBe(owner);
      return callback(records);
    },
  };
  return { records, withOwner, service: createObservatoryViewsService(port) };
}
describe("shared canonical named-view application service", () => {
  it("validates public input before requesting an owner transaction", async () => {
    const { service, withOwner } = setup();
    for (const input of [
      {
        id,
        name: "Invalid",
        expectedVersion: 0,
        configuration: { schemaVersion: 1 },
      },
      {
        id,
        name: "Injected",
        expectedVersion: 0,
        configuration: { schemaVersion: 2 },
        ownerId: owner.principalId,
      },
    ])
      await expect(service.create(owner, input)).rejects.toThrow();
    await expect(
      service.update(owner, {
        id,
        name: "Missing scope",
        expectedVersion: 1,
        configuration: view.configuration,
      }),
    ).rejects.toThrow();
    expect(withOwner).not.toHaveBeenCalled();
  });
  it("delegates each operation once with exact scope and expected version, preserving exact create retries", async () => {
    const { service, records, withOwner } = setup();
    const create = {
      id,
      projectId,
      name: view.name,
      expectedVersion: 0,
      configuration: view.configuration,
    };
    expect(await service.create(owner, create)).toEqual(view);
    expect(
      await service.create(owner, { ...create, id: id.toUpperCase() }),
    ).toEqual(view);
    expect(vi.mocked(records.create).mock.calls[0]?.[0]).toEqual(
      vi.mocked(records.create).mock.calls[1]?.[0],
    );
    await service.update(owner, { ...create, expectedVersion: 1 });
    expect(records.update).toHaveBeenLastCalledWith({
      ...create,
      expectedVersion: 1,
    });
    await service.read(owner, { id });
    await service.page(owner, { projectId: null, limit: 100, cursor: null });
    await service.delete(owner, { id, expectedVersion: 2 });
    expect(records.page).toHaveBeenCalledWith({
      projectId: null,
      limit: 100,
      cursor: null,
    });
    expect(records.delete).toHaveBeenCalledWith({ id, expectedVersion: 2 });
    expect(withOwner).toHaveBeenCalledTimes(6);
  });
  it("preserves explicit repository/session/version failures instead of treating them as saved views", async () => {
    const { service, records } = setup();
    const conflict = new Error("VERSION_CONFLICT"),
      denied = new Error("FORBIDDEN");
    vi.mocked(records.update).mockRejectedValue(conflict);
    await expect(
      service.update(owner, {
        id,
        projectId,
        name: view.name,
        expectedVersion: 1,
        configuration: view.configuration,
      }),
    ).rejects.toBe(conflict);
    vi.mocked(records.read).mockRejectedValue(denied);
    await expect(service.read(owner, { id })).rejects.toBe(denied);
  });
  it("rejects private fields or corrupt outputs from a broken repository boundary", async () => {
    const { service, records } = setup();
    vi.mocked(records.read).mockResolvedValue({
      ...view,
      ownerId: owner.principalId,
    } as typeof view);
    await expect(service.read(owner, { id })).rejects.toThrow();
    vi.mocked(records.page).mockResolvedValue({
      schemaVersion: 1,
      items: [view],
      total: 1,
      nextCursor: id,
    });
    await expect(service.page(owner)).rejects.toThrow();
  });
  it("declares owner-only audited read/reversible operations without adding machine authority", () => {
    for (const [action, policy] of Object.entries(OBSERVATORY_VIEW_POLICIES)) {
      expect(policy).toMatchObject({
        scope: "owner",
        projectScope: "optional_project",
        capability: "owner",
        approval: "owner_only",
        risk: action === "read" ? "read_only" : "reversible",
        auditEvent: `observatory.view.${action}`,
      });
    }
  });
});
