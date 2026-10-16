import { describe, expect, it } from "vitest";
import {
  foundationActorSchema,
  foundationClientSchema,
  type FoundationClient,
  type FoundationProjectResourcePage,
  type FoundationProjectResourceRecord,
} from "@commandry/contracts";
import {
  FoundationError,
  foundationDigest,
  foundationTokenDigest,
} from "@commandry/domain";
import type {
  FoundationMachineRequest,
  FoundationServiceOptions,
} from "./agent-foundation";
import {
  createFoundationResourceService,
  FoundationResourceUnavailableError,
  type FoundationResourceReadPort,
  type FoundationResourceReadRecords,
} from "./foundation-resources";

// Synthetic transaction port only. This proves no PostgreSQL active membership,
// cursor anchor, grant lock, read audit, credential authentication or MCP wiring.
const id = (value: number) =>
  "00000000-0000-4000-8000-" + value.toString(16).padStart(12, "0");
const projectId = id(10);
const foreignProjectId = id(11);
const token = "af_" + "A".repeat(43);
const createdAt = "2026-10-01T00:00:00.000Z";
const selectedAt = "2026-10-16T10:00:00.100Z";
const expiresAt = "2026-10-17T00:00:00.000Z";
const correlationId = id(12);
const query = { projectId };
type PortInput = Parameters<
  FoundationResourceReadRecords["listProjectResources"]
>[0];
type PortPage = Awaited<
  ReturnType<FoundationResourceReadRecords["listProjectResources"]>
>;

function connection(index = 100): FoundationProjectResourceRecord {
  return {
    id: id(index).toUpperCase(),
    type: "supports",
    inverseType: "supported_by",
    resource: {
      id: id(500).toUpperCase(),
      kind: "  canonical kind\r\n",
      name: " \ufeff resource \u03bb\u00e9\u0301 \ud83c\udf0c\r\n\t ",
      subtype: null,
      parentResourceId: id(501).toUpperCase(),
      state: " recorded state, no health inference ",
      externalUrl: "https://example.test/resource?q=exact#fragment",
      lastObservedAt: "2026-10-15T13:00:00.123456+02:00",
    },
  };
}

function fixture() {
  const client = foundationClientSchema.parse({
    schemaVersion: 1,
    id: id(20),
    projectId,
    name: "Synthetic resource reader",
    operations: ["resources.read"],
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
    onRead: ((input: PortInput) => void | Promise<void>) | undefined;
    afterCallback: ((value: unknown) => unknown | Promise<unknown>) | undefined;
    readError: Error | undefined;
    outerError: Error | undefined;
    clock: (() => Date) | undefined;
    uuid: (() => string) | undefined;
  } = {
    client,
    rawPage: { items: [connection()], nextCursor: null },
    time: selectedAt,
    callbackMode: "single",
    onRead: undefined,
    afterCallback: undefined,
    readError: undefined,
    outerError: undefined,
    clock: undefined,
    uuid: undefined,
  };
  const requests: FoundationMachineRequest[] = [];
  const reads: PortInput[] = [];
  const events: string[] = [];
  const records: FoundationResourceReadRecords = {
    async listProjectResources(input) {
      reads.push(structuredClone(input));
      events.push("read");
      await state.onRead?.(input);
      if (state.readError) throw state.readError;
      return state.rawPage as PortPage;
    },
  };
  const port: FoundationResourceReadPort = {
    async withClient<T>(
      request: FoundationMachineRequest,
      callback: (
        client: FoundationClient,
        records: FoundationResourceReadRecords,
      ) => Promise<T>,
    ): Promise<T> {
      requests.push(structuredClone(request));
      events.push("lock");
      if (state.outerError) throw state.outerError;
      if (state.callbackMode === "none") return state.rawPage as T;
      const result = await callback(state.client, records);
      if (state.callbackMode === "repeat")
        await callback(state.client, records);
      if (state.callbackMode === "swallowed-repeat") {
        try {
          await callback(state.client, records);
        } catch {
          // A corrupt wrapper attempts to hide its repeated callback.
        }
      }
      const delivered = state.afterCallback
        ? await state.afterCallback(result)
        : result;
      events.push("audit", "commit");
      return delivered as T;
    },
  };
  const service = createFoundationResourceService(port, {
    environment: "test",
    now: () => (state.clock ? state.clock() : new Date(state.time)),
    createId: () => (state.uuid ? state.uuid() : correlationId.toUpperCase()),
  });
  return { state, service, port, records, requests, reads, events };
}

async function unavailable(promise: Promise<unknown>) {
  const error: unknown = await promise.then(
    () => undefined,
    (error: unknown) => error,
  );
  expect(error).toBeInstanceOf(FoundationResourceUnavailableError);
  expect(error).not.toBeInstanceOf(FoundationError);
  expect(error).toMatchObject({
    name: "FoundationResourceUnavailableError",
    message: "Resource output unavailable",
  });
  expect(error).not.toHaveProperty("code");
  expect(error).not.toHaveProperty("cause");
  expect(String(error)).not.toContain(token);
  expect(String(error)).not.toContain("canonical kind");
}

describe("canonical project resource read", () => {
  it("returns exact connections, canonical digests and server authority", async () => {
    const f = fixture();
    const page = await f.service.listProjectResources(token, {
      projectId: projectId.toUpperCase(),
    });
    expect(page).toEqual({
      schemaVersion: 1,
      requestedProjectId: projectId,
      consistency: "live",
      selectedAt,
      items: [
        {
          connection: connection(),
          contentDigest: foundationDigest(connection()),
        },
      ],
      nextCursor: null,
    });
    expect(f.requests).toEqual([
      {
        operation: "resources.read",
        projectId,
        environment: "test",
        correlationId,
        targetId: null,
        tokenDigest: foundationTokenDigest(token),
      },
    ]);
    expect(f.reads).toEqual([{ projectId, limit: 25 }]);
    expect(f.events).toEqual(["lock", "read", "audit", "commit"]);
    expect(JSON.stringify(f.requests)).not.toContain(token);
    expect(page).not.toHaveProperty("asOf");
    expect(page).not.toHaveProperty("health");
    expect(page).not.toHaveProperty("snapshotVersion");
  });

  it("retains several relationship connections to the same resource and nullable fields", async () => {
    const f = fixture();
    const first = connection(100);
    const second = {
      ...connection(101),
      type: "relates_to" as const,
      inverseType: "relates_to" as const,
      resource: {
        ...first.resource,
        parentResourceId: null,
        state: null,
        externalUrl: null,
        lastObservedAt: null,
        subtype: " exact subtype ",
      },
    };
    f.state.rawPage = { items: [first, second], nextCursor: null };
    const page = await f.service.listProjectResources(token, query);
    expect(page.items.map((item) => item.connection)).toEqual([first, second]);
    expect(page.items.map((item) => item.contentDigest)).toEqual(
      [first, second].map(foundationDigest),
    );
    expect(page.items[0]?.connection.resource.id).toBe(
      page.items[1]?.connection.resource.id,
    );
  });

  it("handles empty, full, terminal and next pages with scoped normalized cursors", async () => {
    const f = fixture();
    f.state.rawPage = { items: [], nextCursor: null };
    expect(await f.service.listProjectResources(token, query)).toMatchObject({
      items: [],
      nextCursor: null,
    });
    const first = connection(100);
    const last = connection(101);
    f.state.rawPage = { items: [first, last], nextCursor: last.id };
    const page = await f.service.listProjectResources(token, {
      ...query,
      limit: 2,
    });
    expect(page.nextCursor).toEqual({
      projectId,
      afterLinkId: last.id.toLowerCase(),
    });
    f.state.rawPage = { items: [], nextCursor: null };
    await f.service.listProjectResources(token, {
      ...query,
      limit: 2,
      cursor: { projectId: projectId.toUpperCase(), afterLinkId: last.id },
    });
    expect(f.reads.at(-1)).toEqual({
      projectId,
      limit: 2,
      cursor: last.id.toLowerCase(),
    });
    f.state.rawPage = { items: [connection(102)], nextCursor: null };
    const terminal = await f.service.listProjectResources(token, {
      ...query,
      cursor: page.nextCursor,
    });
    expect(terminal.items).toHaveLength(1);
    expect(terminal.nextCursor).toBeNull();
  });

  it("keeps all 207 synthetic eligible links reachable without a total cap", async () => {
    const f = fixture();
    const rows = Array.from({ length: 207 }, (_, index) =>
      connection(index + 100),
    );
    f.state.onRead = (input) => {
      const remaining = rows.filter(
        (row) =>
          input.cursor === undefined || row.id.toLowerCase() > input.cursor,
      );
      const items = remaining.slice(0, input.limit);
      f.state.rawPage = {
        items,
        nextCursor: remaining.length > input.limit ? items.at(-1)!.id : null,
      };
    };
    const seen: string[] = [];
    let cursor: FoundationProjectResourcePage["nextCursor"] = null;
    do {
      const page = await f.service.listProjectResources(token, {
        ...query,
        limit: 100,
        cursor,
      });
      seen.push(...page.items.map((item) => item.connection.id));
      cursor = page.nextCursor;
    } while (cursor !== null);
    expect(seen).toEqual(rows.map((row) => row.id));
    expect(new Set(seen).size).toBe(207);
    expect(f.reads).toHaveLength(3);
  });

  it("returns a complete 100-link page without a content-wide truncation cap", async () => {
    const f = fixture();
    const rows = Array.from({ length: 100 }, (_, index) => ({
      ...connection(100 + index),
      resource: { ...connection().resource, name: "\u2603".repeat(10001) },
    }));
    f.state.rawPage = { items: rows, nextCursor: rows.at(-1)!.id };
    const page = await f.service.listProjectResources(token, {
      ...query,
      limit: 100,
    });
    expect(page.items).toHaveLength(100);
    expect(page.items[99]).toEqual({
      connection: rows[99],
      contentDigest: foundationDigest(rows[99]),
    });
  });

  it("defaults absent trusted environment to local and generates server UUIDs", async () => {
    const f = fixture();
    f.state.client.environment = "local";
    const service = createFoundationResourceService(f.port, {
      now: () => new Date(selectedAt),
    });
    const page = await service.listProjectResources(token, query);
    expect(page.selectedAt).toBe(selectedAt);
    expect(f.requests[0]?.environment).toBe("local");
    expect(
      foundationActorSchema.shape.correlationId.safeParse(
        f.requests[0]?.correlationId,
      ).success,
    ).toBe(true);
    f.state.client.expiresAt = "9999-12-31T23:59:59.000Z";
    const defaultService = createFoundationResourceService(f.port);
    expect(
      (await defaultService.listProjectResources(token, query)).consistency,
    ).toBe("live");
  });
});

describe("strict caller boundary and independent resources.read grant", () => {
  it.each([
    { limit: 0 },
    { limit: 101 },
    { limit: 1.5 },
    { limit: "25" },
    { cursor: { projectId: foreignProjectId, afterLinkId: id(99) } },
    { cursor: { projectId, afterLinkId: "invalid" } },
    { cursor: { projectId, afterLinkId: id(99), approved: true } },
    { actor: { principalId: "owner" } },
    { targetId: id(99) },
    { capabilities: ["resources.read"] },
    { tokenDigest: "a".repeat(64) },
    { operation: "foundation.read" },
    { correlationId },
    { environment: "production" },
    { owner: true },
    { resourceId: id(500) },
    { type: "supports" },
    { healthy: true },
    { afterLinkId: id(99) },
    { asOf: selectedAt },
  ])(
    "rejects malformed or unsupported query %j before access",
    async (extra) => {
      const f = fixture();
      await expect(
        f.service.listProjectResources(token, { ...query, ...extra }),
      ).rejects.toThrow();
      expect(f.requests).toEqual([]);
    },
  );

  it("rejects caller getters without invoking them", async () => {
    const f = fixture();
    let calls = 0;
    const raw = { ...query };
    Object.defineProperty(raw, "projectId", {
      enumerable: true,
      get() {
        calls++;
        return projectId;
      },
    });
    await expect(
      f.service.listProjectResources(token, raw),
    ).rejects.toMatchObject({ code: "INVALID_REFERENCE" });
    expect(calls).toBe(0);
    expect(f.requests).toEqual([]);
  });

  it.each(["", "invalid", "ck_" + "A".repeat(43), token + "\n"])(
    "rejects malformed credential before port access",
    async (credential) => {
      const f = fixture();
      await expect(
        f.service.listProjectResources(credential, query),
      ).rejects.toMatchObject({ code: "INVALID_CREDENTIAL" });
      expect(f.requests).toEqual([]);
    },
  );

  const oldOperations = [
    "foundation.read",
    "work.read",
    "work.propose",
    "evidence.record",
    "memory.propose",
    "memory.revise",
    "configuration.record",
    "evaluation.record",
  ] as const;
  it.each(oldOperations)(
    "does not expand the existing %s grant",
    async (operation) => {
      const f = fixture();
      f.state.client.operations = [operation];
      await expect(
        f.service.listProjectResources(token, query),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(f.reads).toEqual([]);
    },
  );

  it("does not expand a grant containing every old machine operation", async () => {
    const f = fixture();
    f.state.client.operations = [...oldOperations];
    await expect(
      f.service.listProjectResources(token, query),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(f.reads).toEqual([]);
  });

  const changes: [string, Partial<FoundationClient>, string][] = [
    ["project", { projectId: foreignProjectId }, "FORBIDDEN"],
    ["environment", { environment: "production" }, "FORBIDDEN"],
    ["capability", { operations: ["foundation.read"] }, "FORBIDDEN"],
    ["revocation", { revokedAt: selectedAt }, "REVOKED"],
    ["expiry", { expiresAt: selectedAt }, "EXPIRED"],
  ];
  it.each(changes)(
    "rejects current %s before records",
    async (_, change, code) => {
      const f = fixture();
      Object.assign(f.state.client, change);
      await expect(
        f.service.listProjectResources(token, query),
      ).rejects.toMatchObject({ code });
      expect(f.reads).toEqual([]);
    },
  );

  describe.each(["read", "wrapper", "delivery"] as const)(
    "at the %s boundary",
    (boundary) => {
      it.each(changes)("rechecks %s", async (_, change, code) => {
        const f = fixture();
        const mutate = () => Object.assign(f.state.client, change);
        if (boundary === "read")
          f.state.onRead = () => {
            mutate();
          };
        else if (boundary === "wrapper")
          f.state.afterCallback = (value) => {
            mutate();
            return value;
          };
        else {
          let calls = 0;
          f.state.clock = () => {
            if (calls++ === 4) mutate();
            return new Date(selectedAt);
          };
        }
        await expect(
          f.service.listProjectResources(token, query),
        ).rejects.toMatchObject({ code });
      });
    },
  );

  it.each(["read", "wrapper", "delivery"] as const)(
    "rejects expiry at the %s boundary",
    async (boundary) => {
      const f = fixture();
      const expire = () => {
        f.state.time = expiresAt;
      };
      if (boundary === "read") f.state.onRead = expire;
      else if (boundary === "wrapper")
        f.state.afterCallback = (value) => {
          expire();
          return value;
        };
      else {
        let calls = 0;
        f.state.clock = () => new Date(calls++ === 4 ? expiresAt : selectedAt);
      }
      await expect(
        f.service.listProjectResources(token, query),
      ).rejects.toMatchObject({ code: "EXPIRED" });
    },
  );

  it.each(["id", "createdBy", "name"] as const)(
    "rejects otherwise valid client %s substitution",
    async (field) => {
      for (const phase of ["read", "wrapper"] as const) {
        const f = fixture();
        const mutate = () => {
          if (field === "id") f.state.client.id = id(21);
          else f.state.client[field] += " changed";
        };
        if (phase === "read") f.state.onRead = mutate;
        else
          f.state.afterCallback = (value) => {
            mutate();
            return value;
          };
        await unavailable(f.service.listProjectResources(token, query));
      }
    },
  );
});

describe("internal producer integrity and safe unavailable classification", () => {
  const corruptions: [string, (page: PortPage) => unknown][] = [
    ["nonobject", () => null],
    ["array envelope", () => []],
    ["missing items", (page) => ({ nextCursor: page.nextCursor })],
    ["missing cursor", (page) => ({ items: page.items })],
    ["extra authority", (page) => ({ ...page, actor: "owner" })],
    ["nonarray items", (page) => ({ ...page, items: "private " + token })],
    ["undefined cursor", (page) => ({ ...page, nextCursor: undefined })],
    ["malformed cursor", (page) => ({ ...page, nextCursor: token })],
    ["wrong continuation", (page) => ({ ...page, nextCursor: id(999) })],
    ["empty continuation", () => ({ items: [], nextCursor: id(999) })],
    [
      "oversized page",
      (page) => ({ ...page, items: [...page.items, connection(102)] }),
    ],
    [
      "descending UUIDs",
      (page) => ({ ...page, items: [...page.items].reverse() }),
    ],
    [
      "duplicate link identity",
      (page) => ({
        ...page,
        items: [
          page.items[0],
          { ...page.items[0]!, id: page.items[0]!.id.toLowerCase() },
        ],
      }),
    ],
    [
      "wrong inverse",
      (page) => ({
        ...page,
        items: [
          { ...page.items[0]!, inverseType: "relates_to" },
          page.items[1],
        ],
      }),
    ],
    [
      "unknown relationship",
      (page) => ({
        ...page,
        items: [{ ...page.items[0]!, type: "contains" }, page.items[1]],
      }),
    ],
    [
      "invalid link UUID",
      (page) => ({
        ...page,
        items: [{ ...page.items[0]!, id: token }, page.items[1]],
      }),
    ],
    [
      "nested extra field",
      (page) => ({
        ...page,
        items: [
          {
            ...page.items[0]!,
            resource: { ...page.items[0]!.resource, healthy: true },
          },
          page.items[1],
        ],
      }),
    ],
    [
      "extra record field",
      (page) => ({
        ...page,
        items: [
          { ...page.items[0]!, contentDigest: "a".repeat(64) },
          page.items[1],
        ],
      }),
    ],
    [
      "sparse array",
      (page) => {
        Reflect.deleteProperty(page.items, "0");
        return page;
      },
    ],
    [
      "hidden field",
      (page) => {
        Object.defineProperty(page, "secret", { value: token });
        return page;
      },
    ],
    ["symbol field", (page) => ({ ...page, [Symbol("secret")]: token })],
    [
      "foreign prototype",
      (page) => Object.assign(Object.create({ secret: token }), page),
    ],
    [
      "non-JSON nested value",
      (page) => ({
        ...page,
        items: [
          {
            ...page.items[0]!,
            resource: {
              ...page.items[0]!.resource,
              lastObservedAt: new Date(selectedAt),
            },
          },
        ],
      }),
    ],
    ["cyclic data", (page) => Object.assign(page, { cycle: page })],
  ];
  it.each(corruptions)("rejects %s as unavailable", async (_, mutate) => {
    const f = fixture();
    f.state.rawPage = mutate({
      items: [connection(100), connection(101)],
      nextCursor: null,
    });
    await unavailable(
      f.service.listProjectResources(token, { ...query, limit: 2 }),
    );
    expect(f.events).toEqual(["lock", "read"]);
  });

  it("requires every canonical link and resource field", async () => {
    for (const field of Object.keys(connection())) {
      const f = fixture();
      const row: Record<string, unknown> = { ...connection() };
      delete row[field];
      f.state.rawPage = { items: [row], nextCursor: null };
      await unavailable(f.service.listProjectResources(token, query));
    }
    for (const field of Object.keys(connection().resource)) {
      const f = fixture();
      const resource: Record<string, unknown> = { ...connection().resource };
      delete resource[field];
      f.state.rawPage = {
        items: [{ ...connection(), resource }],
        nextCursor: null,
      };
      await unavailable(f.service.listProjectResources(token, query));
    }
  });

  it("rejects a row at or before the cursor without repairing ordering", async () => {
    for (const row of [connection(99), connection(100)]) {
      const f = fixture();
      f.state.rawPage = { items: [row], nextCursor: null };
      await unavailable(
        f.service.listProjectResources(token, {
          ...query,
          cursor: { projectId, afterLinkId: connection(100).id },
        }),
      );
    }
    const f = fixture();
    f.state.rawPage = { items: [connection(101)], nextCursor: null };
    await expect(
      f.service.listProjectResources(token, {
        ...query,
        cursor: { projectId, afterLinkId: connection(100).id },
      }),
    ).resolves.toMatchObject({ consistency: "live" });
  });

  it.each(["page", "record", "resource", "grant", "delivery"] as const)(
    "rejects %s getters without invoking them",
    async (location) => {
      const f = fixture();
      let calls = 0;
      const getter = {
        enumerable: true,
        get() {
          calls++;
          throw new Error(token);
        },
      };
      if (location === "page")
        Object.defineProperty(f.state.rawPage, "items", getter);
      if (location === "record")
        Object.defineProperty(
          (f.state.rawPage as PortPage).items[0]!,
          "type",
          getter,
        );
      if (location === "resource")
        Object.defineProperty(
          (f.state.rawPage as PortPage).items[0]!.resource,
          "name",
          getter,
        );
      if (location === "grant")
        Object.defineProperty(f.state.client, "operations", getter);
      if (location === "delivery")
        f.state.afterCallback = (value) => {
          Object.defineProperty(value, "items", getter);
          return value;
        };
      await unavailable(f.service.listProjectResources(token, query));
      expect(calls).toBe(0);
    },
  );
});

describe("outer callback and delivery integrity", () => {
  it.each(["none", "repeat", "swallowed-repeat"] as const)(
    "rejects %s callbacks",
    async (mode) => {
      const f = fixture();
      f.state.callbackMode = mode;
      await unavailable(f.service.listProjectResources(token, query));
      expect(f.reads).toHaveLength(mode === "none" ? 0 : 1);
    },
  );

  const changes: [string, (page: FoundationProjectResourcePage) => unknown][] =
    [
      ["substitution", (page) => ({ ...page, items: [] })],
      ["time", (page) => ({ ...page, selectedAt: createdAt })],
      ["scope", (page) => ({ ...page, requestedProjectId: foreignProjectId })],
      [
        "content",
        (page) => {
          page.items[0]!.connection.resource.name += " changed";
          return page;
        },
      ],
      [
        "digest",
        (page) => {
          page.items[0]!.contentDigest = "0".repeat(64);
          return page;
        },
      ],
      ["extra authority", (page) => ({ ...page, owner: true })],
      [
        "callback object hidden by unchanged copy",
        (page) => {
          const copy = structuredClone(page);
          page.items[0]!.connection.resource.name += " hidden change";
          return copy;
        },
      ],
    ];
  it.each(changes)("rejects changed %s after callback", async (_, mutate) => {
    const f = fixture();
    f.state.afterCallback = (value) =>
      mutate(value as FoundationProjectResourcePage);
    await unavailable(f.service.listProjectResources(token, query));
  });

  it("rejects postcallback producer mutation even when delivered output was cloned", async () => {
    const f = fixture();
    f.state.afterCallback = (value) => {
      (f.state.rawPage as PortPage).items[0]!.resource.name += " changed";
      return structuredClone(value);
    };
    await unavailable(f.service.listProjectResources(token, query));
  });

  it("accepts an exact cloned callback result", async () => {
    const f = fixture();
    f.state.afterCallback = (value) => structuredClone(value);
    await expect(
      f.service.listProjectResources(token, query),
    ).resolves.toMatchObject({
      consistency: "live",
    });
  });

  it("preserves scoped cursor, grant, audit and underlying port error classes", async () => {
    for (const error of [
      new FoundationError(
        "INVALID_REFERENCE",
        "Restart the live resource read",
      ),
      new FoundationError("FORBIDDEN"),
      new FoundationError("EXPIRED"),
      new FoundationError("REVOKED"),
      new Error("Synthetic unavailable dependency"),
    ]) {
      for (const location of ["entry", "read", "audit"]) {
        const f = fixture();
        if (location === "entry") f.state.outerError = error;
        if (location === "read") f.state.readError = error;
        if (location === "audit")
          f.state.afterCallback = () => {
            throw error;
          };
        await expect(
          f.service.listProjectResources(token, {
            ...query,
            cursor: { projectId, afterLinkId: id(99) },
          }),
        ).rejects.toBe(error);
      }
    }
  });
});

describe("trusted runtime dependencies", () => {
  describe.each(["now", "createId"] as const)(
    "acquiring the trusted %s factory",
    (field) => {
      it.each(["Error", "FoundationError"] as const)(
        "sanitizes a throwing %s getter before access",
        async (kind) => {
          const f = fixture();
          const options: FoundationServiceOptions = {
            environment: "test",
            now: () => new Date(selectedAt),
            createId: () => correlationId,
          };
          const error =
            kind === "Error"
              ? new Error(token)
              : new FoundationError("INVALID_REFERENCE", token);
          let calls = 0;
          Object.defineProperty(options, field, {
            enumerable: true,
            get() {
              calls++;
              throw error;
            },
          });
          await unavailable(
            Promise.resolve().then(() =>
              createFoundationResourceService(f.port, options),
            ),
          );
          expect(calls).toBe(1);
          expect(f.requests).toEqual([]);
          expect(f.reads).toEqual([]);
        },
      );
    },
  );

  it.each(["now", "createId"] as const)(
    "rejects an explicitly null %s factory instead of repairing it",
    async (field) => {
      const f = fixture();
      const options = {
        environment: "test",
        now: () => new Date(selectedAt),
        createId: () => correlationId,
        [field]: null,
      } as unknown as FoundationServiceOptions;
      const service = createFoundationResourceService(f.port, options);
      await unavailable(service.listProjectResources(token, query));
      expect(f.requests).toEqual([]);
    },
  );

  it.each([0, 1, 2, 3, 4])(
    "rejects invalid clock result at call %i as unavailable",
    async (failAt) => {
      const f = fixture();
      let calls = 0;
      f.state.clock = () =>
        calls++ === failAt ? new Date(NaN) : new Date(selectedAt);
      await unavailable(f.service.listProjectResources(token, query));
    },
  );

  it.each([
    () => "2026-10-16" as unknown as Date,
    () => new Date("+010000-01-01T00:00:00.000Z"),
    () => {
      throw new Error(token);
    },
  ])(
    "rejects malformed or throwing clocks before port access",
    async (clock) => {
      const f = fixture();
      f.state.clock = clock;
      await unavailable(f.service.listProjectResources(token, query));
      expect(f.requests).toEqual([]);
    },
  );

  it.each([
    () => "not-a-uuid",
    () => {
      throw new Error(token);
    },
  ])(
    "rejects invalid UUID dependencies as unavailable before port access",
    async (uuid) => {
      const f = fixture();
      f.state.uuid = uuid;
      await unavailable(f.service.listProjectResources(token, query));
      expect(f.requests).toEqual([]);
    },
  );

  it.each([null, "", "invalid", "TEST", 1])(
    "rejects invalid explicit environment %j as unavailable",
    (environment) => {
      const f = fixture();
      expect(() =>
        createFoundationResourceService(f.port, {
          environment: environment as FoundationServiceOptions["environment"],
        }),
      ).toThrow(FoundationResourceUnavailableError);
      expect(f.requests).toEqual([]);
    },
  );
});
