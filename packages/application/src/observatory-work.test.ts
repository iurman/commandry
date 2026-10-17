import { describe, expect, it } from "vitest";
import {
  foundationProjectWorkQuerySchema,
  type FoundationProjectWorkRecord,
} from "@commandry/contracts";
import { foundationDigest } from "@commandry/domain";
import {
  serializeFoundationProjectWorkPage,
  type FoundationWorkReadRecords,
} from "./foundation-work";
import {
  createObservatoryOwnerWorkService,
  type ObservatoryOwnerWorkReadPort,
} from "./observatory-work";
import type { ObservatoryOwnerIdentity } from "./observatory-management";

const id = (number: number) =>
  `00000000-0000-4000-8000-${number.toString(16).padStart(12, "0")}`;
const projectId = id(1),
  otherProjectId = id(2);
const at = "2026-10-16T12:00:00.000Z",
  expiresAt = "2026-10-16T13:00:00.000Z";
function work(): FoundationProjectWorkRecord {
  return {
    id: id(10).toUpperCase(),
    projectId,
    sourceCaptureId: id(20),
    generatedFromWorkItemId: null,
    title: "  Literal <script> title\r\n",
    description: "  exact cafe\u0301\r\n",
    workType: "task",
    assigneeKind: "unassigned",
    assigneeAgentId: null,
    assigneeLabel: null,
    status: "done",
    priority: null,
    dueOn: null,
    contextLink: null,
    createdAt: "2026-10-15T10:00:00.123456Z",
    updatedAt: "2026-10-15T10:01:00.000001Z",
  };
}
function fixture() {
  const owner: ObservatoryOwnerIdentity = {
    principalId: "user:canonical-owner",
    sessionId: "synthetic-canonical-session",
    expiresAt,
  };
  const state: {
    raw: unknown;
    time: string;
    mode: "single" | "none" | "repeat" | "swallowed";
    afterRead?: () => void;
    afterCallback?: (value: unknown) => unknown | Promise<unknown>;
    readError?: Error;
    clock?: () => Date;
  } = { raw: { items: [work()], nextCursor: null }, time: at, mode: "single" };
  const requests: { owner: ObservatoryOwnerIdentity; projectId: string }[] = [];
  const reads: Parameters<FoundationWorkReadRecords["listProjectWork"]>[0][] =
    [];
  const records: FoundationWorkReadRecords = {
    async listProjectWork(input) {
      reads.push(structuredClone(input));
      if (state.readError) throw state.readError;
      state.afterRead?.();
      return state.raw as Awaited<
        ReturnType<FoundationWorkReadRecords["listProjectWork"]>
      >;
    },
  };
  const port: ObservatoryOwnerWorkReadPort = {
    async withRead<T>(
      identity: ObservatoryOwnerIdentity,
      selectedProject: string,
      callback: (records: FoundationWorkReadRecords) => Promise<T>,
    ): Promise<T> {
      requests.push({ owner: identity, projectId: selectedProject });
      if (state.mode === "none") return state.raw as T;
      const value = await callback(records);
      if (state.mode === "repeat") await callback(records);
      if (state.mode === "swallowed") {
        try {
          await callback(records);
        } catch {
          /* Corrupt port cannot hide repeat. */
        }
      }
      return (
        state.afterCallback ? await state.afterCallback(value) : value
      ) as T;
    },
  };
  const service = createObservatoryOwnerWorkService(port, {
    now: () => (state.clock ? state.clock() : new Date(state.time)),
  });
  return { owner, state, requests, reads, service };
}
describe("canonical owner Observatory Work read", () => {
  it("uses the exact shared page serializer and canonical content with an actual selectedAt, without a machine identity", async () => {
    const f = fixture();
    f.state.afterRead = () => {
      f.state.time = "2026-10-16T12:00:01.000Z";
    };
    const rawQuery = { projectId: projectId.toUpperCase() };
    const page = await f.service.listProjectWork(f.owner, rawQuery);
    expect(page).toEqual(
      serializeFoundationProjectWorkPage(
        f.state.raw,
        foundationProjectWorkQuerySchema.parse(rawQuery),
        f.state.time,
      ),
    );
    expect(f.requests).toEqual([{ owner: f.owner, projectId }]);
    expect(f.requests[0]?.owner).toBe(f.owner);
    expect(f.reads).toEqual([{ projectId, limit: 25 }]);
    expect(page.items[0]).toEqual({
      work: work(),
      contentDigest: foundationDigest(work()),
    });
    expect(page.selectedAt).toBe("2026-10-16T12:00:01.000Z");
    expect(page.items[0]?.work.updatedAt).toBe(work().updatedAt);
    expect(page.consistency).toBe("live");
    for (const privateValue of [
      f.owner.sessionId,
      f.owner.principalId,
      "tokenDigest",
      "AgentRun",
      "running",
    ])
      expect(JSON.stringify(page)).not.toContain(privateValue);
  });
  it("keeps full canonical linked content and project-bound continuation unchanged", async () => {
    const f = fixture();
    const linked = {
      ...work(),
      projectId: otherProjectId,
      contextLink: { id: id(30), projectId, createdAt: at },
    };
    f.state.raw = { items: [linked], nextCursor: linked.id };
    const page = await f.service.listProjectWork(f.owner, {
      projectId,
      limit: 1,
    });
    expect(page.items[0]?.work).toEqual(linked);
    expect(page.nextCursor).toEqual({
      projectId,
      afterId: linked.id.toLowerCase(),
    });
    f.state.raw = { items: [], nextCursor: null };
    const empty = await f.service.listProjectWork(f.owner, {
      projectId,
      limit: 1,
      cursor: page.nextCursor,
    });
    expect(f.reads[1]).toEqual({
      projectId,
      limit: 1,
      cursor: linked.id.toLowerCase(),
    });
    expect(empty.items).toEqual([]);
  });
  it("rejects caller authority and foreign cursors before invoking the owner port", async () => {
    for (const extra of [
      { owner: true },
      { principalId: "user:other" },
      { sessionId: "body-session" },
      { grants: ["work.read"] },
      { environment: "test" },
      { operation: "work.read" },
      { limit: 101 },
      { cursor: { projectId: otherProjectId, afterId: id(90) } },
    ]) {
      const f = fixture();
      await expect(
        f.service.listProjectWork(f.owner, { projectId, ...extra }),
      ).rejects.toThrow();
      expect(f.requests).toEqual([]);
    }
  });
  it.each(["principal", "session", "expiry", "extra", "getter"])(
    "rejects malformed server %s identity without reading Work",
    async (mode) => {
      const f = fixture();
      let invoked = false;
      if (mode === "principal") f.owner.principalId = "body-supplied-owner";
      if (mode === "session") f.owner.sessionId = " ";
      if (mode === "expiry") f.owner.expiresAt = "invalid";
      if (mode === "extra") Object.assign(f.owner, { owner: true });
      if (mode === "getter")
        Object.defineProperty(f.owner, "sessionId", {
          enumerable: true,
          get() {
            invoked = true;
            return "unsafe";
          },
        });
      await expect(
        f.service.listProjectWork(f.owner, { projectId }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(f.reads).toEqual([]);
      expect(invoked).toBe(false);
    },
  );
  it.each(["initial", "read", "delivery"])(
    "withholds data on exact expiry during %s",
    async (phase) => {
      const f = fixture();
      if (phase === "initial") f.state.time = expiresAt;
      if (phase === "read")
        f.state.afterRead = () => {
          f.state.time = expiresAt;
        };
      if (phase === "delivery")
        f.state.afterCallback = async (value) => {
          await Promise.resolve();
          f.state.time = expiresAt;
          return value;
        };
      await expect(
        f.service.listProjectWork(f.owner, { projectId }),
      ).rejects.toMatchObject({ code: "EXPIRED" });
      expect(f.reads.length).toBe(phase === "initial" ? 0 : 1);
    },
  );
  it.each(["principalId", "sessionId", "expiresAt"] as const)(
    "rejects %s identity mutation during read and delivery",
    async (field) => {
      for (const phase of ["read", "delivery"]) {
        const f = fixture();
        const mutate = () => {
          f.owner[field] =
            field === "expiresAt"
              ? "2026-10-16T14:00:00.000Z"
              : "user:replacement";
        };
        if (phase === "read") f.state.afterRead = mutate;
        else
          f.state.afterCallback = (value) => {
            mutate();
            return value;
          };
        await expect(
          f.service.listProjectWork(f.owner, { projectId }),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
      }
    },
  );
  it.each(["none", "repeat", "swallowed"] as const)(
    "rejects %s callback delivery",
    async (mode) => {
      const f = fixture();
      f.state.mode = mode;
      await expect(
        f.service.listProjectWork(f.owner, { projectId }),
      ).rejects.toMatchObject({ code: "INVALID_REFERENCE" });
      expect(f.reads.length).toBe(mode === "none" ? 0 : 1);
    },
  );
  it("rejects raw page and delivered result tampering without executing accessors", async () => {
    for (const mode of ["foreign-page", "title", "extra", "getter"]) {
      const f = fixture();
      let invoked = false;
      if (mode === "foreign-page")
        f.state.raw = {
          items: [{ ...work(), projectId: otherProjectId }],
          nextCursor: null,
        };
      else
        f.state.afterCallback = (value) => {
          const page = value as { items: { work: { title: string } }[] };
          if (mode === "title") page.items[0]!.work.title = "tampered";
          if (mode === "extra")
            Object.assign(page, { originalContent: "private" });
          if (mode === "getter")
            Object.defineProperty(page, "items", {
              enumerable: true,
              get() {
                invoked = true;
                return [];
              },
            });
          return page;
        };
      await expect(
        f.service.listProjectWork(f.owner, { projectId }),
      ).rejects.toMatchObject({ code: "INVALID_REFERENCE" });
      expect(invoked).toBe(false);
    }
  });
  it("propagates repository and audit failures and requires a valid clock at every boundary", async () => {
    const read = fixture(),
      error = new Error("synthetic read failure");
    read.state.readError = error;
    await expect(
      read.service.listProjectWork(read.owner, { projectId }),
    ).rejects.toBe(error);
    const audit = fixture();
    audit.state.afterCallback = () => {
      throw error;
    };
    await expect(
      audit.service.listProjectWork(audit.owner, { projectId }),
    ).rejects.toBe(error);
    for (const invalidAt of [0, 1, 2, 3]) {
      const f = fixture();
      let calls = 0;
      f.state.clock = () =>
        calls++ === invalidAt ? new Date(NaN) : new Date(at);
      await expect(
        f.service.listProjectWork(f.owner, { projectId }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });
});
