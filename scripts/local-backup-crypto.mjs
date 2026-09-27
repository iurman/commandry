import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const magic = Buffer.from("CMDRYBK1", "ascii");
const saltBytes = 16;
const nonceBytes = 12;
const tagBytes = 16;
const headerBytes = magic.length + saltBytes + nonceBytes + tagBytes;
export const maximumLocalBackupBytes = 128 * 1024 * 1024;

function keyFor(secret, salt) {
  if (typeof secret !== "string" || secret.length < 32)
    throw new Error("Local backup key is unavailable");
  return Buffer.from(
    hkdfSync(
      "sha256",
      Buffer.from(secret, "utf8"),
      salt,
      "commandry-local-postgres-backup-v1",
      32,
    ),
  );
}

export function sealLocalBackup(plaintext, secret) {
  if (
    !Buffer.isBuffer(plaintext) ||
    plaintext.length === 0 ||
    plaintext.length > maximumLocalBackupBytes
  )
    throw new Error("Local backup exceeds the bounded archive size");
  const salt = randomBytes(saltBytes);
  const nonce = randomBytes(nonceBytes);
  const key = keyFor(secret, salt);
  try {
    const cipher = createCipheriv("aes-256-gcm", key, nonce);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext),
      cipher.final(),
    ]);
    return Buffer.concat([magic, salt, nonce, cipher.getAuthTag(), ciphertext]);
  } finally {
    key.fill(0);
  }
}

export function openLocalBackup(archive, secret) {
  if (
    !Buffer.isBuffer(archive) ||
    archive.length <= headerBytes ||
    archive.length > maximumLocalBackupBytes + headerBytes ||
    !timingSafeEqual(archive.subarray(0, magic.length), magic)
  )
    throw new Error("Local backup archive failed integrity verification");
  const salt = archive.subarray(magic.length, magic.length + saltBytes);
  const nonce = archive.subarray(
    magic.length + saltBytes,
    magic.length + saltBytes + nonceBytes,
  );
  const tag = archive.subarray(
    magic.length + saltBytes + nonceBytes,
    headerBytes,
  );
  const key = keyFor(secret, salt);
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, nonce);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(archive.subarray(headerBytes)),
      decipher.final(),
    ]);
  } catch {
    throw new Error("Local backup archive failed integrity verification");
  } finally {
    key.fill(0);
  }
}
