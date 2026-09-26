import { describe, expect, it } from "vitest";
import {
  canonicalPacketJson,
  validatePacketSelection,
} from "./execution-packet";

describe("execution packet rules", () => {
  it("accepts a bounded explicit selection and rejects duplicate disclosure", () => {
    expect(() =>
      validatePacketSelection(["note-a"], ["resource-a"]),
    ).not.toThrow();
    expect(() => validatePacketSelection(["note-a", "note-a"], [])).toThrow(
      /distinct/,
    );
    expect(() =>
      validatePacketSelection(
        [],
        Array.from({ length: 11 }, (_, index) => String(index)),
      ),
    ).toThrow(/up to 10/);
  });

  it("serializes logically identical snapshots to the same canonical JSON", () => {
    expect(canonicalPacketJson({ b: [2, 1], a: { y: true, x: null } })).toBe(
      canonicalPacketJson({ a: { x: null, y: true }, b: [2, 1] }),
    );
  });
});
