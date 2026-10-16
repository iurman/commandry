import { describe, expect, it } from "vitest";
import { canonicalFoundationJson } from "@commandry/domain";
import {
  foundationWorkflowPageCursor,
  foundationWorkflowPageSelection,
  type FoundationWorkflowPageBinding,
} from "./foundation-workflow-pagination";

const projectId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const afterId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const now = new Date("2026-10-16T12:00:00.000Z");
const binding: FoundationWorkflowPageBinding = {
  projectId,
  environment: "test",
  principalId: "user:owner",
  operation: "improvement.read",
};
const selection = { asOf: "2026-10-16T11:00:00.000Z", afterId: null };
const data = () => ({
  schemaVersion: 1,
  ...binding,
  asOf: selection.asOf,
  afterId,
});
const encode = (value: unknown) =>
  Buffer.from(canonicalFoundationJson(value), "utf8").toString("base64url");
const invalid = (cursor: string) =>
  expect(() => foundationWorkflowPageSelection(binding, cursor, now)).toThrow(
    expect.objectContaining({
      code: "INVALID_REFERENCE",
      message: "Invalid workflow continuation",
    }),
  );

describe("foundation workflow pagination", () => {
  it("captures the first server instant and preserves it over subsequent pages", () => {
    expect(foundationWorkflowPageSelection(binding, undefined, now)).toEqual({
      asOf: now.toISOString(),
      afterId: null,
    });
    const cursor = foundationWorkflowPageCursor(binding, selection, afterId);
    expect(foundationWorkflowPageSelection(binding, cursor, now)).toEqual({
      asOf: selection.asOf,
      afterId,
    });
    expect(
      foundationWorkflowPageCursor(binding, { ...selection, afterId }, afterId),
    ).toBe(cursor);
  });
  it.each([
    { projectId: afterId },
    { environment: "local" },
    { principalId: "user:other" },
    { operation: "finding.read" },
  ])("rejects a continuation for a different binding %j", (change) =>
    invalid(encode({ ...data(), ...change })),
  );
  it("normalizes a caller binding but rejects noncanonical stored UUIDs", () => {
    const cursor = foundationWorkflowPageCursor(
      { ...binding, projectId: projectId.toUpperCase() },
      selection,
      afterId,
    );
    expect(foundationWorkflowPageSelection(binding, cursor, now).afterId).toBe(
      afterId,
    );
    invalid(encode({ ...data(), projectId: projectId.toUpperCase() }));
    invalid(encode({ ...data(), afterId: afterId.toUpperCase() }));
    expect(() =>
      foundationWorkflowPageCursor(binding, selection, afterId.toUpperCase()),
    ).toThrow(expect.objectContaining({ code: "INVALID_REFERENCE" }));
  });
  it.each([
    "2026-10-16T12:00:00.001Z",
    "2026-10-16T12:00:00.0000001Z",
    "2026-02-30T10:00:00Z",
    "not-a-time",
    "2026-10-16",
    "999999-01-01T00:00:00Z",
  ])("rejects invalid or future cutoff %s", (asOf) =>
    invalid(encode({ ...data(), asOf })),
  );
  it("supports a valid offset and rejects invalid server clocks", () => {
    expect(
      foundationWorkflowPageSelection(
        binding,
        encode({ ...data(), asOf: "2026-10-16T12:00:00+01:00" }),
        now,
      ).asOf,
    ).toBe("2026-10-16T12:00:00+01:00");
    expect(() =>
      foundationWorkflowPageSelection(binding, undefined, new Date(Number.NaN)),
    ).toThrow(expect.objectContaining({ code: "INVALID_REFERENCE" }));
  });
  it("rejects duplicate and extra JSON keys and whitespace", () => {
    invalid(encode({ ...data(), extra: true }));
    const json = canonicalFoundationJson(data());
    invalid(
      Buffer.from(
        json.replace(
          '"schemaVersion":1',
          '"schemaVersion":1,"schemaVersion":1',
        ),
      ).toString("base64url"),
    );
    invalid(Buffer.from(" " + json).toString("base64url"));
    invalid(encode({ ...data(), schemaVersion: 2 }));
  });
  it("rejects empty, oversized, malformed base64, invalid UTF8 and corrupt bytes", () => {
    const cursor = encode(data());
    for (const value of [
      "",
      "a".repeat(8193),
      cursor + "=",
      cursor + "/",
      "A",
      Buffer.from([0xff, 0xfe]).toString("base64url"),
      Buffer.from("{").toString("base64url"),
      encode({ ...data(), afterId: "wrong" }),
    ])
      invalid(value);
  });
  it("inspects descriptors without evaluating getters", () => {
    let accessed = false;
    const raw = Object.defineProperty({ ...binding }, "projectId", {
      enumerable: true,
      get() {
        accessed = true;
        return projectId;
      },
    });
    expect(() => foundationWorkflowPageSelection(raw, undefined, now)).toThrow(
      expect.objectContaining({ code: "INVALID_REFERENCE" }),
    );
    expect(accessed).toBe(false);
  });
});
