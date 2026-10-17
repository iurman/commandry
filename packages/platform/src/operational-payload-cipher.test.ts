import { describe, expect, it } from "vitest";
import { createOperationalPayloadCipher } from "./operational-payload-cipher";

const key = "synthetic_APP_ENCRYPTION_KEY_32_characters_minimum";
const original = {
  success: true,
  monitor: {
    id: "monitor-one",
    config: {
      password: "PRIVATE_MONITOR_PASSWORD",
      token: "PRIVATE_MONITOR_TOKEN",
    },
    target: "https://private.invalid/?key=SECRET",
    lastCheckedAt: null,
  },
  checks: [null, true, 12.5, "literal source extras"],
};

describe("authenticated operational original encryption", () => {
  it("recovers complete nested originals across instances without exposing plaintext or the key", () => {
    const first = createOperationalPayloadCipher(key);
    const envelope = first.seal(original);
    expect(createOperationalPayloadCipher(key).open(envelope)).toEqual(
      original,
    );
    const stored = JSON.stringify(envelope);
    for (const secret of [
      key,
      "PRIVATE_MONITOR_PASSWORD",
      "PRIVATE_MONITOR_TOKEN",
      "private.invalid",
      "literal source extras",
    ])
      expect(stored).not.toContain(secret);
    expect(first.seal(original)).not.toEqual(envelope);
    for (const value of [
      null,
      true,
      false,
      0,
      1.25,
      "",
      [1, { nested: "value" }],
    ])
      expect(first.open(first.seal(value))).toEqual(value);
  });
  it("rejects authenticated field tampering, wrong keys and truncation with safe errors", () => {
    const cipher = createOperationalPayloadCipher(key),
      envelope = cipher.seal(original);
    for (const field of ["nonce", "tag", "ciphertext"]) {
      const bytes = Buffer.from(envelope[field] as string, "base64");
      bytes[0] = bytes[0]! ^ 1;
      expect(() =>
        cipher.open({ ...envelope, [field]: bytes.toString("base64") }),
      ).toThrow("Invalid operational payload envelope");
      expect(() =>
        cipher.open({
          ...envelope,
          [field]: (envelope[field] as string).slice(0, -4),
        }),
      ).toThrow("Invalid operational payload envelope");
    }
    expect(() =>
      createOperationalPayloadCipher(
        "different_key_of_at_least_32_characters",
      ).open(envelope),
    ).toThrow("Invalid operational payload envelope");
    for (const bad of [
      null,
      [],
      {},
      { ...envelope, version: 2 },
      { ...envelope, algorithm: "aes-256-cbc" },
      { ...envelope, extra: true },
      { ...envelope, nonce: "%%%%" },
      Object.assign(Object.create({ extra: "PRIVATE" }), envelope),
    ])
      expect(() => cipher.open(bad)).toThrow(
        "Invalid operational payload envelope",
      );
  });
  it("rejects unsupported values, cycles, sparse arrays and prototype-bearing objects without executing accessors", () => {
    const cipher = createOperationalPayloadCipher(key);
    const circular: unknown[] = [];
    circular.push(circular);
    let invoked = false;
    const accessor = Object.defineProperty({}, "secret", {
      enumerable: true,
      get() {
        invoked = true;
        throw new Error(key);
      },
    });
    const symbol = { [Symbol("secret")]: "PRIVATE" };
    for (const bad of [
      undefined,
      NaN,
      Infinity,
      -0,
      1n,
      () => {},
      new Date(),
      new Map(),
      Buffer.from("PRIVATE"),
      circular,
      new Array(2),
      accessor,
      symbol,
      { nested: undefined },
      JSON.parse('{"__proto__":{"polluted":true}}'),
      Object.create({ secret: true }),
      Object.defineProperty({}, "hidden", { value: 1 }),
    ])
      expect(() => cipher.seal(bad)).toThrow(
        "Operational payload encryption failed",
      );
    expect(invoked).toBe(false);
    expect(() =>
      cipher.open(
        Object.defineProperty(cipher.seal(original), "extra", {
          enumerable: true,
          get() {
            invoked = true;
            return key;
          },
        }),
      ),
    ).toThrow("Invalid operational payload envelope");
    expect(invoked).toBe(false);
    expect(() => createOperationalPayloadCipher("short")).toThrow(
      "Invalid operational encryption key",
    );
  });
});
