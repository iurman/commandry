import { randomBytes } from "node:crypto";
import {
  closeSync,
  constants,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";

function validName(name) {
  if (!/^backup-[a-z-]+\.json$/.test(name)) throw new Error("STATUS_NAME");
}

export function validateStatusDirectory(path, uid) {
  const entry = lstatSync(path);
  if (
    !entry.isDirectory() ||
    entry.uid !== uid ||
    (entry.mode & 0o777) !== 0o700
  )
    throw new Error("STATUS_DIRECTORY");
  return path;
}

export function atomicStatus(directory, name, record) {
  validName(name);
  const target = resolve(directory, name);
  const temporary = `${target}.${randomBytes(6).toString("hex")}.tmp`;
  let handle;
  try {
    handle = openSync(
      temporary,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
      0o600,
    );
    writeFileSync(handle, `${JSON.stringify(record)}\n`);
    fsyncSync(handle);
    closeSync(handle);
    handle = undefined;
    renameSync(temporary, target);
    const parent = openSync(
      directory,
      constants.O_RDONLY | constants.O_DIRECTORY,
    );
    try {
      fsyncSync(parent);
    } finally {
      closeSync(parent);
    }
  } finally {
    if (handle !== undefined) closeSync(handle);
    rmSync(temporary, { force: true });
  }
}

export function readStatus(directory, name, uid) {
  validName(name);
  const path = resolve(directory, name);
  const entry = lstatSync(path);
  if (
    !entry.isFile() ||
    entry.uid !== uid ||
    (entry.mode & 0o777) !== 0o600 ||
    entry.size < 2 ||
    entry.size > 8192
  )
    throw new Error("STATUS_FILE");
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error("STATUS_FILE");
  }
}
