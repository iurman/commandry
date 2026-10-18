import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { createDatabase } from "./client";

vi.mock("pg", async (importOriginal) => {
  const actual = await importOriginal<typeof import("pg")>();
  const { EventEmitter } = await import("node:events");
  class FixturePool extends EventEmitter {
    // pg-pool can finish end() before its clients emit their physical end events.
    end = vi.fn(async () => {});
    query = vi.fn();
  }
  return {
    ...actual,
    Pool: FixturePool,
    default: { ...actual.default, Pool: FixturePool },
  };
});

const nextTurn = () => new Promise<void>((done) => setImmediate(done));
const options = { connectionString: "postgresql://fixture@localhost/fixture" };

describe("database connection shutdown", () => {
  it("waits for every connected client's end after the pool reports completion", async () => {
    const database = createDatabase(options);
    const first = new EventEmitter();
    const second = new EventEmitter();
    database.pool.emit("connect", first);
    database.pool.emit("connect", second);
    let closed = false;
    const closing = database.close().then(() => {
      closed = true;
    });
    await nextTurn();
    expect(database.pool.end).toHaveBeenCalledOnce();
    expect(closed).toBe(false);
    first.emit("end");
    await nextTurn();
    expect(closed).toBe(false);
    second.emit("end");
    await closing;
    expect(closed).toBe(true);
  });

  it("does not wait again for a connection that ended before close", async () => {
    const database = createDatabase(options);
    const client = new EventEmitter();
    database.pool.emit("connect", client);
    client.emit("end");
    await database.close();
    expect(database.pool.end).toHaveBeenCalledOnce();
  });

  it("closes an unused pool without waiting for a connection", async () => {
    const database = createDatabase(options);
    await database.close();
    expect(database.pool.end).toHaveBeenCalledOnce();
  });

  it("preserves pool shutdown failures", async () => {
    const database = createDatabase(options);
    const failure = new Error("pool shutdown failed");
    vi.mocked(database.pool.end).mockRejectedValueOnce(failure);
    await expect(database.close()).rejects.toBe(failure);
  });

  it("does not swallow unexpected background pool errors", async () => {
    const database = createDatabase(options);
    const failure = new Error("unexpected backend failure");
    expect(() => database.pool.emit("error", failure)).toThrow(failure);
    await database.close();
  });
});
