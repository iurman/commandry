import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const context = Buffer.from("commandry:operational-original:v1", "utf8");
const envelopeKeys = "algorithm,ciphertext,nonce,tag,version";

function jsonData(value: unknown, seen = new Set<object>(), depth = 0): void {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" &&
      Number.isFinite(value) &&
      !Object.is(value, -0))
  )
    return;
  if (typeof value !== "object" || depth > 64 || seen.has(value))
    throw new Error();
  const array = Array.isArray(value);
  if (
    !array &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  )
    throw new Error();
  if (Object.getOwnPropertySymbols(value).length) throw new Error();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (array && Object.keys(descriptors).length !== value.length + 1)
    throw new Error();
  seen.add(value);
  for (const [name, descriptor] of Object.entries(descriptors)) {
    if (array && name === "length") continue;
    if (
      !descriptor.enumerable ||
      !Object.hasOwn(descriptor, "value") ||
      ["__proto__", "constructor", "prototype"].includes(name) ||
      (array &&
        (!/^(0|[1-9][0-9]*)$/.test(name) || Number(name) >= value.length))
    )
      throw new Error();
    jsonData(descriptor.value, seen, depth + 1);
  }
  seen.delete(value);
}

function base64(value: unknown, bytes?: number): Buffer {
  if (
    typeof value !== "string" ||
    !value.length ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    )
  )
    throw new Error();
  const decoded = Buffer.from(value, "base64");
  if (
    decoded.toString("base64") !== value ||
    (bytes !== undefined && decoded.length !== bytes)
  )
    throw new Error();
  return decoded;
}

/** Server-only authenticated storage for literal operational source originals. */
export function createOperationalPayloadCipher(key: string) {
  if (typeof key !== "string" || key.length < 32)
    throw new Error("Invalid operational encryption key");
  const derived = createHash("sha256")
    .update(context)
    .update("\0")
    .update(key, "utf8")
    .digest();
  return {
    seal(value: unknown): Record<string, unknown> {
      try {
        jsonData(value);
        const plaintext = JSON.stringify(value);
        const nonce = randomBytes(12);
        const cipher = createCipheriv("aes-256-gcm", derived, nonce);
        cipher.setAAD(context);
        const ciphertext = Buffer.concat([
          cipher.update(plaintext, "utf8"),
          cipher.final(),
        ]);
        return {
          version: 1,
          algorithm: "aes-256-gcm",
          nonce: nonce.toString("base64"),
          tag: cipher.getAuthTag().toString("base64"),
          ciphertext: ciphertext.toString("base64"),
        };
      } catch {
        throw new Error("Operational payload encryption failed");
      }
    },
    open(envelope: unknown): unknown {
      try {
        jsonData(envelope);
        if (
          !envelope ||
          typeof envelope !== "object" ||
          Array.isArray(envelope) ||
          Object.keys(envelope).sort().join(",") !== envelopeKeys
        )
          throw new Error();
        const record = envelope as Record<string, unknown>;
        if (record.version !== 1 || record.algorithm !== "aes-256-gcm")
          throw new Error();
        const nonce = base64(record.nonce, 12),
          tag = base64(record.tag, 16),
          ciphertext = base64(record.ciphertext);
        const decipher = createDecipheriv("aes-256-gcm", derived, nonce);
        decipher.setAAD(context);
        decipher.setAuthTag(tag);
        const plaintext = Buffer.concat([
          decipher.update(ciphertext),
          decipher.final(),
        ]);
        const result: unknown = JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(plaintext),
        );
        jsonData(result);
        return result;
      } catch {
        throw new Error("Invalid operational payload envelope");
      }
    },
  };
}
