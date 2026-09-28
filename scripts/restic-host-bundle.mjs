import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readdirSync, lstatSync, readFileSync } from "node:fs";
import { basename, dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { detectContainerRuntime } from "./container-runtime.mjs";
import {
  localBackupConfig,
  parsePrivateConfig,
  productionBackupEnvironment,
  trustedSource,
} from "./host-backup-config.mjs";
import { pipeAndHash } from "./stream-process.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const mode = process.argv[2];
const production = mode === "backup" || mode === "verify";
const backupMode = mode === "backup" || mode === "rehearse";
const releaseMarker = process.env.COMMANDRY_RELEASE_MARKER ?? "current-release";
const expectedMarkerSha = process.env.COMMANDRY_RELEASE_MARKER_SHA256 ?? null;
let phase = "CONFIG";

function fail(code) {
  throw new Error(code);
}

function validDigest(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function sourceTree(path, uid) {
  const entry = lstatSync(path);
  if (
    entry.uid !== uid ||
    (entry.mode & 0o777) !== (entry.isDirectory() ? 0o700 : 0o600)
  )
    fail("SOURCE_MODE");
  if (entry.isDirectory()) {
    for (const name of readdirSync(path)) sourceTree(resolve(path, name), uid);
  } else if (!entry.isFile()) {
    fail("SOURCE_TYPE");
  } else if (entry.nlink !== 1) {
    fail("SOURCE_LINKS");
  }
}

function resticRunner(environment) {
  const candidates = environment.RESTIC_BINARY
    ? [{ executable: environment.RESTIC_BINARY, prefix: [] }]
    : [
        { executable: "restic", prefix: [] },
        {
          executable: "flatpak-spawn",
          prefix: ["--host", "/home/linuxbrew/.linuxbrew/bin/restic"],
        },
      ];
  const runner = candidates.find(
    ({ executable, prefix }) =>
      spawnSync(executable, [...prefix, "version"], {
        env: environment,
        stdio: "ignore",
        timeout: 10_000,
      }).status === 0,
  );
  if (!runner) fail("RESTIC_UNAVAILABLE");
  return {
    executable: runner.executable,
    args: [
      ...runner.prefix,
      "--repo",
      environment.RESTIC_REPOSITORY,
      "--password-file",
      environment.RESTIC_PASSWORD_FILE,
    ],
  };
}

function snapshotId(line, current) {
  try {
    const data = JSON.parse(line);
    if (data.message_type === "summary") return data.snapshot_id;
    return current;
  } catch {
    fail("RESTIC_OUTPUT");
  }
}

async function upload(source, filename, tag, runner) {
  let id = null;
  const digest = await pipeAndHash(
    source,
    [
      runner.executable,
      [
        ...runner.args,
        "backup",
        "--stdin",
        "--stdin-filename",
        filename,
        "--tag",
        "commandry-postgres",
        "--tag",
        tag,
        "--json",
      ],
    ],
    root,
    (line) => {
      id = snapshotId(line, id);
    },
  );
  if (!validDigest(id) || !validDigest(digest)) fail("BACKUP_RESULT");
  return { snapshotId: id, sha256: digest };
}

async function readback(
  item,
  filename,
  runner,
  listTar = false,
  excludedPath = null,
) {
  const entries = new Set();
  const digest = await pipeAndHash(
    [
      runner.executable,
      [...runner.args, "dump", item.snapshotId, `/${filename}`],
    ],
    listTar
      ? ["/usr/bin/tar", ["--ignore-zeros", "-tf", "-"]]
      : ["/usr/bin/sha256sum", []],
    root,
    (line) => {
      if (listTar) entries.add(line);
    },
  );
  if (digest !== item.sha256) fail("READBACK_DIGEST");
  if (
    listTar &&
    !["commandry/commandry.env", "commandry/backup.env", releaseMarker].every(
      (name) => entries.has(name),
    )
  )
    fail("CONFIG_ARCHIVE");
  if (excludedPath && entries.has(excludedPath)) fail("CONFIG_SECRET_ARCHIVED");
}

try {
  if (Number(process.versions.node.split(".")[0]) !== 24) fail("NODE_VERSION");
  if (
    !["current-release", "pending-first-release"].includes(releaseMarker) ||
    (expectedMarkerSha !== null && !validDigest(expectedMarkerSha)) ||
    (releaseMarker === "pending-first-release" && !expectedMarkerSha)
  )
    fail("RELEASE_MARKER");
  let config;
  let environment;
  let configDir;
  let stateDir;
  let uid;
  if (production) {
    if (process.getuid?.() !== 0) fail("INVOCATION");
    for (const path of [root, resolve(root, "scripts")])
      trustedSource(path, true);
    for (const script of [
      "restic-host-bundle.mjs",
      "host-backup-config.mjs",
      "r2-repository.mjs",
      "container-runtime.mjs",
      "stream-process.mjs",
    ])
      trustedSource(resolve(root, "scripts", script));
    config = parsePrivateConfig();
    environment = {
      ...productionBackupEnvironment(config),
      COMMANDRY_RELEASE_MARKER: releaseMarker,
      ...(expectedMarkerSha
        ? { COMMANDRY_RELEASE_MARKER_SHA256: expectedMarkerSha }
        : {}),
    };
    configDir = "/etc/commandry";
    stateDir = "/var/lib/commandry";
    uid = 0;
  } else if (mode === "rehearse" || mode === "verify-rehearse") {
    const localRoot = resolve(root, ".agent") + sep;
    configDir = resolve(process.env.COMMANDRY_BACKUP_CONFIG_DIR ?? "");
    stateDir = resolve(process.env.COMMANDRY_BACKUP_STATE_DIR ?? "");
    if (
      !configDir.startsWith(localRoot) ||
      !stateDir.startsWith(localRoot) ||
      basename(configDir) !== "commandry"
    )
      fail("LOCAL_SOURCE_DIR");
    config = localBackupConfig(root);
    environment = { ...process.env, APP_ENV: "local", ...config };
    uid = process.getuid?.();
  } else {
    fail("INVOCATION");
  }
  if (backupMode && process.argv.length !== 3) fail("INVOCATION");
  if (
    !backupMode &&
    (process.argv.length !== 7 ||
      process.argv.slice(3).some((x) => !validDigest(x)))
  )
    fail("INVOCATION");
  Object.assign(process.env, environment);
  const runner = resticRunner(environment);
  const relativePassword = relative(
    dirname(configDir),
    resolve(environment.RESTIC_PASSWORD_FILE),
  );
  const excludedPassword = relativePassword.startsWith(
    `${basename(configDir)}${sep}`,
  )
    ? relativePassword.split(sep).join("/")
    : null;
  let globals;
  let configuration;
  if (backupMode) {
    phase = "SOURCE";
    sourceTree(configDir, uid);
    const state = lstatSync(stateDir);
    if (
      !state.isDirectory() ||
      state.uid !== uid ||
      (state.mode & 0o777) !== 0o700
    )
      fail("SOURCE_MODE");
    const markerPath = resolve(stateDir, releaseMarker);
    sourceTree(markerPath, uid);
    const markerSha = createHash("sha256")
      .update(readFileSync(markerPath))
      .digest("hex");
    if (expectedMarkerSha && markerSha !== expectedMarkerSha)
      fail("RELEASE_MARKER");
    const runtime = detectContainerRuntime();
    if (!runtime) fail("CONTAINER_RUNTIME");
    const compose = [
      ...runtime.prefix,
      "compose",
      "--env-file",
      production ? "/etc/commandry/commandry.env" : resolve(root, ".env.local"),
      "-f",
      production
        ? resolve(root, "compose.production.yaml")
        : resolve(root, "compose.yaml"),
      ...(production ? ["-p", "commandry"] : []),
      "exec",
      "-T",
      "postgres",
      "pg_dumpall",
      "-U",
      "postgres",
      "--globals-only",
    ];
    phase = "GLOBALS_UPLOAD";
    globals = await upload(
      [runtime.command, compose],
      "commandry-globals.sql",
      "commandry-globals",
      runner,
    );
    const exclusions = excludedPassword
      ? [`--exclude=${excludedPassword}`]
      : [];
    phase = "CONFIG_UPLOAD";
    configuration = await upload(
      [
        "/usr/bin/tar",
        [
          "--format=posix",
          ...exclusions,
          "-cf",
          "-",
          "-C",
          dirname(configDir),
          basename(configDir),
          "-C",
          stateDir,
          releaseMarker,
        ],
      ],
      "commandry-config.tar",
      "commandry-config",
      runner,
    );
  } else {
    globals = { snapshotId: process.argv[3], sha256: process.argv[4] };
    configuration = { snapshotId: process.argv[5], sha256: process.argv[6] };
  }
  phase = "GLOBALS_READBACK";
  await readback(globals, "commandry-globals.sql", runner);
  phase = "CONFIG_READBACK";
  await readback(
    configuration,
    "commandry-config.tar",
    runner,
    true,
    excludedPassword,
  );
  phase = "REPOSITORY_CHECK";
  const checked = spawnSync(runner.executable, [...runner.args, "check"], {
    cwd: root,
    env: environment,
    stdio: "ignore",
    timeout: 30 * 60_000,
  });
  if (checked.error || checked.status !== 0) fail("REPOSITORY_CHECK");
  console.log(
    JSON.stringify({
      kind: "commandry_host_recovery_bundle",
      outcome: "passed",
      environment: production ? "production" : "local",
      globals,
      configuration,
      encryptedReadbackVerified: true,
      globalsApplied: false,
      configurationInstalled: false,
      releaseMarker,
      releaseMarkerSha256: expectedMarkerSha,
      offsiteStored: production,
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      kind: "commandry_host_recovery_bundle",
      outcome: "failed",
      phase,
      reason: /^[A-Z_]+$/.test(error?.message ?? "") ? error.message : phase,
    }),
  );
  process.exitCode = 1;
}
