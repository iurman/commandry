import { existsSync, lstatSync, readFileSync } from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";
import { parseR2Repository } from "./r2-repository.mjs";

function fail(code) {
  throw new Error(code);
}

export function privateFile(path, minimumSize = 1) {
  if (!isAbsolute(path)) fail("PRIVATE_FILE");
  const entry = lstatSync(path);
  if (
    !entry.isFile() ||
    entry.uid !== 0 ||
    (entry.mode & 0o777) !== 0o600 ||
    entry.size < minimumSize
  )
    fail("PRIVATE_FILE");
}

export function trustedSource(path, directory = false) {
  const entry = lstatSync(path);
  if (
    (directory ? !entry.isDirectory() : !entry.isFile()) ||
    entry.uid !== 0 ||
    (entry.mode & 0o022) !== 0
  )
    fail("SOURCE_TRUST");
}

export function parsePrivateConfig(path = "/etc/commandry/backup.env") {
  privateFile(path);
  const allowed = new Set([
    "DB_NAME",
    "RESTIC_REPOSITORY",
    "RESTIC_PASSWORD_FILE",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "RETENTION_DAILY",
    "RETENTION_LAST",
    "RETENTION_WEEKLY",
    "RETENTION_MONTHLY",
    "MAX_BACKUP_AGE_HOURS",
  ]);
  const values = {};
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trimEnd();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    const key = line.slice(0, separator);
    const value = line.slice(separator + 1);
    if (
      separator < 1 ||
      !allowed.has(key) ||
      Object.hasOwn(values, key) ||
      !value ||
      /[\r\n\0]/.test(value)
    )
      fail("BACKUP_CONFIG");
    values[key] = value;
  }
  if ([...allowed].some((key) => !values[key])) fail("BACKUP_CONFIG");
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(values.DB_NAME)) fail("BACKUP_CONFIG");
  if (!parseR2Repository(values.RESTIC_REPOSITORY)) fail("R2_REPOSITORY");
  if (
    !/^[^\s]{8,}$/.test(values.AWS_ACCESS_KEY_ID) ||
    !/^[^\s]{16,}$/.test(values.AWS_SECRET_ACCESS_KEY)
  )
    fail("R2_CREDENTIALS");
  privateFile(values.RESTIC_PASSWORD_FILE, 32);
  retentionPolicy(values);
  return values;
}

export function retentionPolicy(values) {
  const limits = {
    RETENTION_LAST: 100,
    RETENTION_DAILY: 366,
    RETENTION_WEEKLY: 104,
    RETENTION_MONTHLY: 120,
    MAX_BACKUP_AGE_HOURS: 168,
  };
  const result = {};
  for (const [name, maximum] of Object.entries(limits)) {
    const raw = values[name];
    if (typeof raw !== "string" || !/^[1-9][0-9]*$/.test(raw))
      fail("BACKUP_POLICY");
    const parsed = Number(raw);
    if (!Number.isSafeInteger(parsed) || parsed > maximum)
      fail("BACKUP_POLICY");
    result[name] = parsed;
  }
  return result;
}

export function productionBackupEnvironment(config) {
  return {
    HOME: "/root",
    PATH: "/usr/sbin:/usr/bin:/sbin:/bin",
    DOCKER_HOST: "unix:///var/run/docker.sock",
    APP_ENV: "production",
    AWS_DEFAULT_REGION: "auto",
    RESTIC_BINARY: "/opt/commandry/runtime/restic",
    ...config,
  };
}

export function localBackupConfig(root) {
  if (!process.env.DB_NAME && existsSync(resolve(root, ".env.local")))
    process.loadEnvFile(resolve(root, ".env.local"));
  const repository = process.env.RESTIC_REPOSITORY;
  const passwordFile = process.env.RESTIC_PASSWORD_FILE;
  const localRoot = resolve(root, ".agent") + sep;
  if (
    process.env.APP_ENV !== "local" ||
    !/^[a-z_][a-z0-9_]{0,62}$/.test(process.env.DB_NAME ?? "") ||
    !repository ||
    !isAbsolute(repository) ||
    !resolve(repository).startsWith(localRoot) ||
    !passwordFile ||
    !isAbsolute(passwordFile) ||
    !resolve(passwordFile).startsWith(localRoot)
  )
    fail("LOCAL_REHEARSAL_CONFIG");
  const passwordEntry = lstatSync(passwordFile);
  if (
    !passwordEntry.isFile() ||
    passwordEntry.size < 32 ||
    (passwordEntry.mode & 0o077) !== 0
  )
    fail("LOCAL_REHEARSAL_CONFIG");
  return {
    DB_NAME: process.env.DB_NAME,
    RESTIC_REPOSITORY: repository,
    RESTIC_PASSWORD_FILE: passwordFile,
  };
}
