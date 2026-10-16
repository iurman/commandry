import { describe, expect, it } from "vitest";
import {
  foundationActorSchema,
  foundationClientSchema,
  type FoundationClient,
  type FoundationProjectWorkPage,
  type FoundationProjectWorkRecord,
} from "@commandry/contracts";
import {
  FoundationError,
  foundationDigest,
  foundationTokenDigest,
} from "@commandry/domain";
import type { FoundationMachineRequest } from "./agent-foundation";
import {
  createFoundationWorkService,
  type FoundationWorkReadPort,
  type FoundationWorkReadRecords,
} from "./foundation-work";

// Synthetic transaction fixture only. These checks do not prove PostgreSQL
// membership, exact timestamp ordering, grant locks, persistence or MCP wiring.
const id = (value: number) =>
  "00000000-0000-4000-8000-" + value.toString(16).padStart(12, "0");
const projectId = id(10);
const foreignProjectId = id(11);
const token = "af_" + "A".repeat(43);
const createdAt = "2026-10-01T00:00:00.000Z";
const startedAt = "2026-10-15T12:00:00.100Z";
const expiresAt = "2026-10-16T00:00:00.000Z";
const correlationId = id(12);
const query = { projectId };
type PortPage = Awaited<
  ReturnType<FoundationWorkReadRecords["listProjectWork"]>
>;

function work(index = 100): FoundationProjectWorkRecord {
  return {
    id: id(index).toUpperCase(),
    projectId: projectId.toUpperCase(),
    sourceCaptureId: id(500).toUpperCase(),
    generatedFromWorkItemId: null,
    title: "  exact title \u2603\r\n\t",
    description: "  Unicode \u03bb\u00e9\u0301 \ud83c\udf0c\r\n\t\n",
    workType: "task",
    assigneeKind: "unassigned",
    assigneeAgentId: null,
    assigneeLabel: null,
    status: "open",
    priority: null,
    dueOn: null,
    contextLink: null,
    createdAt: "2026-10-15T13:00:00.123456+02:00",
    updatedAt: "2026-10-15T11:00:01.000001Z",
  };
}

function fixture() {
  const client = foundationClientSchema.parse({
    schemaVersion: 1,
    id: id(20),
    projectId,
    name: "Synthetic Work reader",
    operations: ["work.read"],
    environment: "test",
    createdAt,
    expiresAt,
    revokedAt: null,
    createdBy: "synthetic-owner",
  });
  const state: {
    client: FoundationClient;
    rawPage: unknown;
    time: string;
    callbackMode: "single" | "none" | "repeat" | "swallowed-repeat";
    beforeRead: (() => void) | undefined;
    afterRead: (() => void) | undefined;
    afterCallback: ((value: unknown) => unknown | Promise<unknown>) | undefined;
    readError: Error | undefined;
    clock: (() => Date) | undefined;
  } = {
    client,
    rawPage: { items: [work()], nextCursor: null },
    time: startedAt,
    callbackMode: "single",
    beforeRead: undefined,
    afterRead: undefined,
    afterCallback: undefined,
    readError: undefined,
    clock: undefined,
  };
  const requests: FoundationMachineRequest[] = [];
  const reads: Parameters<FoundationWorkReadRecords["listProjectWork"]>[0][] =
    [];
  const records: FoundationWorkReadRecords = {
    async listProjectWork(input) {
      reads.push(structuredClone(input));
      state.beforeRead?.();
      if (state.readError) throw state.readError;
      const result = state.rawPage;
      state.afterRead?.();
      return result as PortPage;
    },
  };
  const port: FoundationWorkReadPort = {
    async withClient<T>(
      request: FoundationMachineRequest,
      callback: (
        client: FoundationClient,
        records: FoundationWorkReadRecords,
      ) => Promise<T>,
    ): Promise<T> {
      requests.push(structuredClone(request));
      if (state.callbackMode === "none") return state.rawPage as T;
      const result = await callback(state.client, records);
      if (state.callbackMode === "repeat") {
        await callback(state.client, records);
      }
      if (state.callbackMode === "swallowed-repeat") {
        try {
          await callback(state.client, records);
        } catch {
          // A corrupt adapter cannot hide its repeated callback from delivery.
        }
      }
      return (
        state.afterCallback ? await state.afterCallback(result) : result
      ) as T;
    },
  };
  const service = createFoundationWorkService(port, {
    environment: "test",
    now: () => (state.clock ? state.clock() : new Date(state.time)),
    createId: () => correlationId.toUpperCase(),
  });
  return { state, requests, reads, port, service };
}

async function rejectPage(rawPage: unknown, input: unknown = query) {
  const f = fixture();
  f.state.rawPage = rawPage;
  await expect(f.service.listProjectWork(token, input)).rejects.toMatchObject({
    code: "INVALID_REFERENCE",
  });
}

describe("canonical foundation Work read service", () => {
  it("binds work.read, digest, environment and correlation on the server", async () => {
    const f = fixture();
    const page = await f.service.listProjectWork(token, {
      projectId: projectId.toUpperCase(),
    });
    expect(f.requests).toEqual([
      {
        operation: "work.read",
        projectId,
        environment: "test",
        targetId: null,
        correlationId,
        tokenDigest: foundationTokenDigest(token),
      },
    ]);
    expect(JSON.stringify(f.requests)).not.toContain(token);
    expect(f.reads).toEqual([{ projectId, limit: 25 }]);
    expect(page).toEqual({
      schemaVersion: 1,
      requestedProjectId: projectId,
      consistency: "live",
      selectedAt: startedAt,
      items: [{ work: work(), contentDigest: foundationDigest(work()) }],
      nextCursor: null,
    });
    expect(page.items[0]?.work.id).toBe(work().id);
    expect(page.items[0]?.work.description).toBe(work().description);
    expect(page.items[0]?.work.createdAt).toBe(work().createdAt);
    expect(page.items[0]?.work.updatedAt).toBe(work().updatedAt);
    expect(page.items[0]?.work.sourceCaptureId).toBe(work().sourceCaptureId);
  });

  it("keeps Work permission separate from foundation.read", async () => {
    const denied = fixture();
    denied.state.client.operations = ["foundation.read"];
    await expect(
      denied.service.listProjectWork(token, query),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(denied.reads).toEqual([]);
    const allowed = fixture();
    await expect(
      allowed.service.listProjectWork(token, query),
    ).resolves.toMatchObject({
      consistency: "live",
    });
  });

  it("rejects injected authority, unsupported filters and foreign cursors before access", async () => {
    for (const extra of [
      { actor: { principalId: "owner" } },
      { targetId: id(99) },
      { capabilities: ["work.read"] },
      { operation: "foundation.read" },
      { environment: "production" },
      { asOf: startedAt },
      { dueAsOf: startedAt },
      { limit: 0 },
      { limit: 101 },
      { limit: "25" },
      { cursor: { projectId: foreignProjectId, afterId: id(99) } },
      { cursor: { projectId, afterId: id(99), approved: true } },
    ]) {
      const f = fixture();
      await expect(
        f.service.listProjectWork(token, { ...query, ...extra }),
      ).rejects.toThrow();
      expect(f.requests).toEqual([]);
    }
    for (const credential of ["", "ck_" + "A".repeat(43), token + "\n"]) {
      const f = fixture();
      await expect(
        f.service.listProjectWork(credential, query),
      ).rejects.toMatchObject({ code: "INVALID_CREDENTIAL" });
      expect(f.requests).toEqual([]);
    }
  });

  it("checks initial scope, environment, revocation and exact expiry", async () => {
    for (const [change, code] of [
      [{ projectId: foreignProjectId }, "FORBIDDEN"],
      [{ environment: "production" }, "FORBIDDEN"],
      [{ revokedAt: startedAt }, "REVOKED"],
      [{ expiresAt: startedAt }, "EXPIRED"],
    ] as const) {
      const f = fixture();
      Object.assign(f.state.client, change);
      await expect(
        f.service.listProjectWork(token, query),
      ).rejects.toMatchObject({ code });
      expect(f.reads).toEqual([]);
    }
  });

  it("reparses the live grant after the read and after callback delivery", async () => {
    const mutations: [Partial<FoundationClient>, string][] = [
      [{ operations: ["foundation.read"] }, "FORBIDDEN"],
      [{ projectId: foreignProjectId }, "FORBIDDEN"],
      [{ environment: "production" }, "FORBIDDEN"],
      [{ revokedAt: startedAt }, "REVOKED"],
      [{ expiresAt: startedAt }, "EXPIRED"],
      [{ id: id(21) }, "INVALID_REFERENCE"],
    ];
    for (const [change, code] of mutations) {
      for (const phase of ["read", "delivery"]) {
        const f = fixture();
        const mutate = () => Object.assign(f.state.client, change);
        if (phase === "read") f.state.afterRead = mutate;
        else
          f.state.afterCallback = (value) => {
            mutate();
            return value;
          };
        await expect(
          f.service.listProjectWork(token, query),
        ).rejects.toMatchObject({ code });
        expect(f.reads).toHaveLength(1);
      }
    }
  });

  it("rejects expiry during read and audit/commit delay", async () => {
    for (const phase of ["read", "delivery"]) {
      const f = fixture();
      if (phase === "read")
        f.state.afterRead = () => {
          f.state.time = expiresAt;
        };
      else
        f.state.afterCallback = (value) => {
          f.state.time = expiresAt;
          return value;
        };
      await expect(
        f.service.listProjectWork(token, query),
      ).rejects.toMatchObject({
        code: "EXPIRED",
      });
    }
    const f = fixture();
    const auditFailure = new Error("synthetic read audit failure");
    f.state.afterCallback = () => {
      throw auditFailure;
    };
    await expect(f.service.listProjectWork(token, query)).rejects.toBe(
      auditFailure,
    );
  });

  it("requires a valid server time at each boundary", async () => {
    for (const invalidAt of [0, 1, 2, 3]) {
      const f = fixture();
      let calls = 0;
      f.state.clock = () =>
        calls++ === invalidAt ? new Date(NaN) : new Date(startedAt);
      await expect(
        f.service.listProjectWork(token, query),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    }
    const f = fixture();
    f.state.clock = () => "2026-10-15" as unknown as Date;
    await expect(f.service.listProjectWork(token, query)).rejects.toMatchObject(
      {
        code: "FORBIDDEN",
      },
    );
    expect(f.requests).toEqual([]);
  });

  it("rejects skipped, repeated and swallowed repeated callbacks", async () => {
    for (const callbackMode of [
      "none",
      "repeat",
      "swallowed-repeat",
    ] as const) {
      const f = fixture();
      f.state.callbackMode = callbackMode;
      await expect(
        f.service.listProjectWork(token, query),
      ).rejects.toMatchObject({
        code: "INVALID_REFERENCE",
      });
      expect(f.reads.length).toBe(callbackMode === "none" ? 0 : 1);
    }
  });

  it("rejects hostile adapter accessors without invoking them", async () => {
    for (const location of ["page", "record", "grant", "delivery"]) {
      const f = fixture();
      let invoked = 0;
      const getter = {
        enumerable: true,
        get: () => {
          invoked += 1;
          return "private";
        },
      };
      if (location === "page") {
        Object.defineProperty(f.state.rawPage, "items", getter);
      } else if (location === "record") {
        const record = work();
        Object.defineProperty(record, "description", getter);
        f.state.rawPage = { items: [record], nextCursor: null };
      } else if (location === "grant") {
        Object.defineProperty(f.state.client, "operations", getter);
      } else {
        f.state.afterCallback = (value) => {
          Object.defineProperty(value, "items", getter);
          return value;
        };
      }
      await expect(
        f.service.listProjectWork(token, query),
      ).rejects.toMatchObject({
        code: "INVALID_REFERENCE",
      });
      expect(invoked).toBe(0);
    }
  });

  it("rejects non-JSON adapter values, symbols, hidden fields and prototypes", async () => {
    const base = () => ({ items: [work()], nextCursor: null });
    const hidden = base();
    Object.defineProperty(hidden, "private", { value: "secret" });
    const symbol = { ...base(), [Symbol("private")]: true };
    const prototype = Object.assign(
      Object.create({ inherited: "secret" }),
      base(),
    );
    const record = { ...work(), description: new Date(startedAt) };
    const sparse = new Array(1);
    for (const result of [
      null,
      [],
      hidden,
      symbol,
      prototype,
      { items: sparse, nextCursor: null },
      { items: [record], nextCursor: null },
      { items: [work()], nextCursor: null, extra: () => "secret" },
    ])
      await rejectPage(result);
  });

  it("retains linked Work's primary project and validates every context binding", async () => {
    const f = fixture();
    const linked = {
      ...work(),
      projectId: foreignProjectId.toUpperCase(),
      contextLink: {
        id: id(700).toUpperCase(),
        projectId: projectId.toUpperCase(),
        createdAt,
      },
    };
    f.state.rawPage = { items: [linked], nextCursor: null };
    const result = await f.service.listProjectWork(token, query);
    expect(result.items[0]?.work).toEqual(linked);
    expect(result.items[0]?.work.projectId).toBe(
      foreignProjectId.toUpperCase(),
    );
    expect(result.items[0]?.contentDigest).toBe(foundationDigest(linked));
    for (const record of [
      { ...work(), projectId: foreignProjectId },
      {
        ...linked,
        contextLink: { ...linked.contextLink, projectId: foreignProjectId },
      },
      {
        ...work(),
        contextLink: { ...linked.contextLink, projectId: foreignProjectId },
      },
      { ...linked, contextLink: { ...linked.contextLink, active: true } },
    ])
      await rejectPage({ items: [record], nextCursor: null });
  });

  it("requires complete canonical fields and rejects raw source or authority extras", async () => {
    for (const field of Object.keys(work())) {
      const record: Record<string, unknown> = { ...work() };
      delete record[field];
      await rejectPage({ items: [record], nextCursor: null });
    }
    for (const field of [
      "original",
      "sourceContent",
      "actor",
      "verified",
      "contentDigest",
    ]) {
      await rejectPage({
        items: [{ ...work(), [field]: "private" }],
        nextCursor: null,
      });
      await rejectPage({
        items: [work()],
        nextCursor: null,
        [field]: "private",
      });
    }
    await rejectPage({ items: [work()] });
    await rejectPage({ nextCursor: null });
    await rejectPage({ items: [work()], nextCursor: undefined });
  });

  it("retains all canonical Work types, statuses, assignments, dates and empty text", async () => {
    const f = fixture();
    const records = ["task", "initiative", "subtask"].flatMap(
      (workType, index) =>
        ["open", "done"].map((status, offset) => ({
          ...work(index * 2 + offset + 100),
          title: "",
          description: "",
          workType,
          status,
          assigneeKind: ["unassigned", "local_user", "agent"][index],
          assigneeAgentId: index === 2 ? id(900) : null,
          assigneeLabel: index === 2 ? "  exact agent\r\n" : null,
          generatedFromWorkItemId: index === 1 ? id(901) : null,
          priority: [null, "low", "high"][index],
          dueOn: index === 2 ? "2026-10-16" : null,
        })),
    );
    f.state.rawPage = { items: records, nextCursor: null };
    const page = await f.service.listProjectWork(token, query);
    expect(page.items.map((item) => item.work)).toEqual(records);
    expect(page.items.map((item) => item.contentDigest)).toEqual(
      records.map(foundationDigest),
    );
  });

  it("rejects duplicate identities and an input cursor repeated among rows", async () => {
    await rejectPage({
      items: [work(), { ...work(), id: work().id.toLowerCase() }],
      nextCursor: null,
    });
    const cursor = { projectId: projectId.toUpperCase(), afterId: work().id };
    await rejectPage(
      { items: [work()], nextCursor: null },
      { ...query, cursor },
    );
    const f = fixture();
    f.state.rawPage = { items: [work(101)], nextCursor: null };
    await f.service.listProjectWork(token, { ...query, cursor });
    expect(f.reads).toEqual([
      { projectId, limit: 25, cursor: work().id.toLowerCase() },
    ]);
  });

  it("accepts SQL order within equal serialized milliseconds but rejects increasing milliseconds", async () => {
    const f = fixture();
    const first = { ...work(100), createdAt: "2026-10-15T11:00:00.100900Z" };
    const second = {
      ...work(101),
      createdAt: "2026-10-15T13:00:00.100100+02:00",
    };
    f.state.rawPage = { items: [first, second], nextCursor: null };
    const page = await f.service.listProjectWork(token, query);
    expect(page.items.map((item) => item.work.id)).toEqual([
      first.id,
      second.id,
    ]);
    f.state.rawPage = {
      items: [
        { ...first, createdAt: "2026-10-15T11:00:00.100Z" },
        {
          ...second,
          createdAt: "2026-10-15T11:00:00.100Z",
        },
      ],
      nextCursor: null,
    };
    await expect(
      f.service.listProjectWork(token, query),
    ).resolves.toMatchObject({ consistency: "live" });
    await rejectPage({
      items: [first, { ...second, createdAt: "2026-10-15T11:00:00.101Z" }],
      nextCursor: null,
    });
  });

  it("requires truthful full-page continuation without sorting or truncation", async () => {
    const f = fixture();
    f.state.rawPage = { items: [work(101)], nextCursor: work(101).id };
    const page = await f.service.listProjectWork(token, { ...query, limit: 1 });
    expect(page.nextCursor).toEqual({
      projectId,
      afterId: work(101).id.toLowerCase(),
    });
    for (const result of [
      { items: [work()], nextCursor: work().id },
      { items: [], nextCursor: work().id },
      { items: [work(), work(101)], nextCursor: work().id },
      { items: [work(), work(101)], nextCursor: id(999) },
      { items: [work(), work(101)], nextCursor: "invalid" },
      {
        items: [work(), work(101)],
        nextCursor: { projectId, afterId: work(101).id },
      },
    ])
      await rejectPage(result, { ...query, limit: 2 });
    await rejectPage(
      { items: [work(), work(101)], nextCursor: null },
      { ...query, limit: 1 },
    );
    const empty = fixture();
    empty.state.rawPage = { items: [], nextCursor: null };
    await expect(
      empty.service.listProjectWork(token, query),
    ).resolves.toMatchObject({
      items: [],
      nextCursor: null,
    });
  });

  it("delivers a complete 100-record page without a content-wide cap", async () => {
    const f = fixture();
    const records = Array.from({ length: 100 }, (_, index) => ({
      ...work(index + 100),
      description: "\u2603".repeat(10001),
    }));
    f.state.rawPage = { items: records, nextCursor: records.at(-1)!.id };
    const page = await f.service.listProjectWork(token, {
      ...query,
      limit: 100,
    });
    expect(page.items).toHaveLength(100);
    expect(page.items[99]?.work).toEqual(records[99]);
    expect(page.items[99]?.contentDigest).toBe(foundationDigest(records[99]));
    expect(page.nextCursor?.afterId).toBe(records[99]?.id.toLowerCase());
    await rejectPage(
      { items: [...records, work(999)], nextCursor: null },
      { ...query, limit: 100 },
    );
  });

  it("propagates invalidated cursor failure as an explicit restart condition", async () => {
    const f = fixture();
    const error = new FoundationError(
      "INVALID_REFERENCE",
      "Restart the live Work read",
    );
    f.state.readError = error;
    await expect(
      f.service.listProjectWork(token, {
        ...query,
        cursor: { projectId, afterId: id(999) },
      }),
    ).rejects.toBe(error);
  });

  it("rejects outer response substitution and mutation after callback completion", async () => {
    for (const change of [
      (page: FoundationProjectWorkPage) => ({ ...page, items: [] }),
      (page: FoundationProjectWorkPage) => ({ ...page, selectedAt: createdAt }),
      (page: FoundationProjectWorkPage) => ({
        ...page,
        requestedProjectId: foreignProjectId,
      }),
      (page: FoundationProjectWorkPage) => {
        page.items[0]!.work.description += "tampered";
        return page;
      },
      (page: FoundationProjectWorkPage) => {
        page.items[0]!.contentDigest = "0".repeat(64);
        return page;
      },
      (page: FoundationProjectWorkPage) => ({ ...page, original: "private" }),
    ]) {
      const f = fixture();
      f.state.afterCallback = (value) =>
        change(value as FoundationProjectWorkPage);
      await expect(
        f.service.listProjectWork(token, query),
      ).rejects.toMatchObject({
        code: "INVALID_REFERENCE",
      });
    }
    const f = fixture();
    f.state.afterCallback = (value) => structuredClone(value);
    await expect(
      f.service.listProjectWork(token, query),
    ).resolves.toMatchObject({
      consistency: "live",
    });
  });

  it("uses a generated UUID when no correlation factory is supplied and remains live", async () => {
    const f = fixture();
    f.state.rawPage = {
      items: [{ ...work(), createdAt: expiresAt }],
      nextCursor: null,
    };
    const service = createFoundationWorkService(f.port, {
      environment: "test",
      now: () => new Date(startedAt),
    });
    const page = await service.listProjectWork(token, query);
    expect(
      foundationActorSchema.shape.correlationId.safeParse(
        f.requests[0]?.correlationId,
      ).success,
    ).toBe(true);
    expect(page.selectedAt).toBe(startedAt);
    expect(page.items[0]?.work.createdAt).toBe(expiresAt);
    expect(page).not.toHaveProperty("asOf");
    expect(page).not.toHaveProperty("snapshotVersion");
  });
});
