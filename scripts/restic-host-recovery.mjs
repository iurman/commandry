import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { basename, dirname, relative, resolve, sep } from "node:path";
import { Transform } from "node:stream";
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
const production = mode === "verify";
const sourceLabel = production
  ? "production-r2"
  : process.env.RECOVERY_SOURCE_LABEL || "synthetic-local-rehearsal";
let phase = "CONFIG";
let runtime = null;
let directory = null;
let volumeCreated = false;
let postgresStarted = false;
let diagnostic = null;
const suffix = randomBytes(6).toString("hex");
const volume = `cmdry_roles_${suffix}_data`;
const postgres = `cmdry_roles_${suffix}_pg`;

function fail(code) {
  throw new Error(code);
}

function validDigest(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function run(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    timeout: 60_000,
    ...options,
  });
  if (result.error || result.status !== 0) fail(phase);
  return result.stdout.trim();
}

function docker(args, options = {}) {
  return run(runtime.command, [...runtime.prefix, ...args], options);
}

function dockerProbe(args) {
  return (
    spawnSync(runtime.command, [...runtime.prefix, ...args], {
      cwd: root,
      stdio: "ignore",
      timeout: 15_000,
    }).status === 0
  );
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
  return [
    runner.executable,
    [
      ...runner.prefix,
      "--repo",
      environment.RESTIC_REPOSITORY,
      "--password-file",
      environment.RESTIC_PASSWORD_FILE,
    ],
  ];
}

function privateEntry(path, uid, directoryExpected) {
  const entry = lstatSync(path);
  if (
    (directoryExpected ? !entry.isDirectory() : !entry.isFile()) ||
    entry.uid !== uid ||
    (entry.mode & 0o777) !== (directoryExpected ? 0o700 : 0o600) ||
    (!directoryExpected && entry.size < 1)
  )
    fail("EXTRACTED_CONFIG");
}

function postgresRoleFilter() {
  let pending = Buffer.alloc(0);
  let skipped = 0;
  function forward(stream, line) {
    if (line.toString("utf8").replace(/\r?\n$/, "") === "CREATE ROLE postgres;")
      skipped += 1;
    else stream.push(line);
  }
  return {
    stream: new Transform({
      transform(chunk, _encoding, done) {
        pending = Buffer.concat([pending, chunk]);
        if (pending.length > 16 * 1024 * 1024)
          return done(new Error("ROLE_LINE_TOO_LONG"));
        let newline = pending.indexOf(10);
        while (newline >= 0) {
          forward(this, pending.subarray(0, newline + 1));
          pending = pending.subarray(newline + 1);
          newline = pending.indexOf(10);
        }
        done();
      },
      flush(done) {
        if (pending.length) forward(this, pending);
        done();
      },
    }),
    skipped: () => skipped,
  };
}

async function waitForPostgres(admin) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (
      dockerProbe([
        "exec",
        postgres,
        "pg_isready",
        "-U",
        admin,
        "-d",
        "postgres",
      ])
    )
      return;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  fail("ISOLATED_POSTGRES");
}

async function drill(environment, uid, configDir) {
  const [globalsSnapshot, globalsSha, configSnapshot, configSha] =
    process.argv.slice(3);
  phase = "BUNDLE_READBACK";
  const bundle = JSON.parse(
    run(
      process.execPath,
      [
        resolve(root, "scripts/restic-host-bundle.mjs"),
        production ? "verify" : "verify-rehearse",
        globalsSnapshot,
        globalsSha,
        configSnapshot,
        configSha,
      ],
      { env: environment, timeout: 30 * 60_000 },
    ),
  );
  if (
    bundle.outcome !== "passed" ||
    bundle.encryptedReadbackVerified !== true ||
    bundle.globals.snapshotId !== globalsSnapshot ||
    bundle.globals.sha256 !== globalsSha ||
    bundle.configuration.snapshotId !== configSnapshot ||
    bundle.configuration.sha256 !== configSha
  )
    fail("BUNDLE_READBACK");
  const restic = resticRunner(environment);
  runtime = detectContainerRuntime();
  if (!runtime) fail("CONTAINER_RUNTIME");
  const targetParent = production
    ? "/var/lib/commandry"
    : resolve(root, ".agent");
  if (production) privateEntry(targetParent, 0, true);
  directory = await mkdtemp(resolve(targetParent, "host-recovery-"));
  privateEntry(directory, uid, true);

  phase = "CONFIG_EXTRACT";
  const configDigest = await pipeAndHash(
    [
      restic[0],
      [...restic[1], "dump", configSnapshot, "/commandry-config.tar"],
    ],
    [
      "/usr/bin/tar",
      ["--ignore-zeros", "--no-same-owner", "-xpf", "-", "-C", directory],
    ],
    root,
  );
  if (configDigest !== configSha) fail("CONFIG_DIGEST");
  privateEntry(resolve(directory, "commandry"), uid, true);
  for (const name of ["commandry.env", "backup.env"])
    privateEntry(resolve(directory, "commandry", name), uid, false);
  privateEntry(resolve(directory, "current-release"), uid, false);
  const relativePassword = relative(
    dirname(configDir),
    resolve(environment.RESTIC_PASSWORD_FILE),
  );
  if (
    relativePassword.startsWith(`${basename(configDir)}${sep}`) &&
    existsSync(resolve(directory, relativePassword))
  )
    fail("CONFIG_SECRET_ARCHIVED");

  phase = "SOURCE_POSTGRES";
  const compose = [
    "compose",
    "--env-file",
    production ? "/etc/commandry/commandry.env" : resolve(root, ".env.local"),
    "-f",
    production
      ? resolve(root, "compose.production.yaml")
      : resolve(root, "compose.yaml"),
    ...(production ? ["-p", "commandry"] : []),
    "ps",
    "-q",
    "postgres",
  ];
  const sourceContainer = docker(compose);
  if (!sourceContainer) fail("SOURCE_POSTGRES");
  const imageHex = docker([
    "inspect",
    sourceContainer,
    "--format",
    "{{.Image}}",
  ])
    .trim()
    .replace(/^sha256:/, "");
  if (!/^[0-9a-f]{64}$/.test(imageHex)) fail("SOURCE_POSTGRES");
  const imageId = `sha256:${imageHex}`;
  const admin = "postgres";
  const postgresEnv = resolve(directory, "postgres.env");
  await writeFile(
    postgresEnv,
    [
      `POSTGRES_USER=${admin}`,
      "POSTGRES_DB=postgres",
      `POSTGRES_PASSWORD=${randomBytes(24).toString("hex")}`,
      "POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256",
      "",
    ].join("\n"),
    { mode: 0o600 },
  );
  phase = "ISOLATED_VOLUME";
  volumeCreated = true;
  docker(["volume", "create", volume]);
  phase = "ISOLATED_POSTGRES";
  postgresStarted = true;
  docker([
    "run",
    "-d",
    "--name",
    postgres,
    "--network",
    "none",
    "--env-file",
    postgresEnv,
    "-v",
    `${volume}:/var/lib/postgresql`,
    imageId,
  ]);
  await waitForPostgres(admin);
  const ports = docker([
    "inspect",
    postgres,
    "--format",
    "{{json .HostConfig.PortBindings}}",
  ]).trim();
  const network = docker([
    "inspect",
    postgres,
    "--format",
    "{{.HostConfig.NetworkMode}}",
  ]).trim();
  if (!["{}", "null"].includes(ports) || network !== "none") fail("ISOLATION");
  const existingPostgresRole = Number(
    docker([
      "exec",
      postgres,
      "psql",
      "-X",
      "-A",
      "-t",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      admin,
      "-d",
      "postgres",
      "-c",
      "select count(*) from pg_roles where rolname = 'postgres'",
    ]),
  );
  if (existingPostgresRole !== 1) fail("POSTGRES_ROLE_MISSING");

  phase = "GLOBALS_APPLY";
  let targetStderr = "";
  const roleFilter = postgresRoleFilter();
  const globalsDigest = await pipeAndHash(
    [
      restic[0],
      [...restic[1], "dump", globalsSnapshot, "/commandry-globals.sql"],
    ],
    [
      runtime.command,
      [
        ...runtime.prefix,
        "exec",
        "-i",
        postgres,
        "psql",
        "-X",
        "-v",
        "ON_ERROR_STOP=1",
        "-U",
        admin,
        "-d",
        "postgres",
        "-f",
        "-",
      ],
    ],
    root,
    undefined,
    (chunk) => {
      if (targetStderr.length < 8192) targetStderr += chunk.toString("utf8");
      const match = targetStderr.match(
        /psql:(?:<stdin>|\/dev\/fd\/\d+):([0-9]+):\s*(ERROR|FATAL):\s*([A-Za-z ]+)/,
      );
      if (match)
        diagnostic = {
          line: Number(match[1]),
          severity: match[2],
          category: match[3].trim(),
        };
    },
    roleFilter.stream,
  );
  if (globalsDigest !== globalsSha) fail("GLOBALS_DIGEST");
  if (roleFilter.skipped() !== 1) fail("POSTGRES_ROLE_ENTRY");
  phase = "GLOBALS_QUERY";
  const roleCount = Number(
    docker([
      "exec",
      postgres,
      "psql",
      "-X",
      "-A",
      "-t",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      admin,
      "-d",
      "postgres",
      "-c",
      "select count(*) from pg_roles where rolname in ('postgres', 'commandry_backup') and rolcanlogin and (rolname <> 'postgres' or rolsuper)",
    ]),
  );
  if (roleCount !== 2) fail("GLOBALS_QUERY");
  const readMembership = docker([
    "exec",
    postgres,
    "psql",
    "-X",
    "-A",
    "-t",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    admin,
    "-d",
    "postgres",
    "-c",
    "select pg_has_role('commandry_backup', 'pg_read_all_data', 'member')",
  ]);
  if (readMembership !== "t") fail("GLOBALS_MEMBERSHIP");
  return {
    roleCount,
    postgresImageId: imageId,
    isolatedNetwork: true,
    readMembership: true,
  };
}

let outcome = "failed";
let reason = null;
let result = null;
let resourcesRemoved = false;
try {
  if (Number(process.versions.node.split(".")[0]) !== 24) fail("NODE_VERSION");
  if (
    !["verify", "rehearse"].includes(mode) ||
    process.argv.length !== 7 ||
    process.argv.slice(3).some((value) => !validDigest(value)) ||
    !/^[a-z0-9][a-z0-9_.-]{0,63}$/.test(sourceLabel)
  )
    fail("INVOCATION");
  let environment;
  let configDir;
  let uid;
  if (production) {
    if (process.getuid?.() !== 0) fail("INVOCATION");
    for (const path of [root, resolve(root, "scripts")])
      trustedSource(path, true);
    for (const script of [
      "restic-host-recovery.mjs",
      "restic-host-bundle.mjs",
      "host-backup-config.mjs",
      "r2-repository.mjs",
      "container-runtime.mjs",
      "stream-process.mjs",
    ])
      trustedSource(resolve(root, "scripts", script));
    environment = productionBackupEnvironment(parsePrivateConfig());
    configDir = "/etc/commandry";
    uid = 0;
  } else {
    const candidate = resolve(process.env.COMMANDRY_BACKUP_CONFIG_DIR ?? "");
    if (
      !candidate.startsWith(resolve(root, ".agent") + sep) ||
      basename(candidate) !== "commandry"
    )
      fail("LOCAL_SOURCE_DIR");
    environment = {
      ...process.env,
      APP_ENV: "local",
      ...localBackupConfig(root),
    };
    configDir = candidate;
    uid = process.getuid?.();
  }
  Object.assign(process.env, environment);
  result = await drill(environment, uid, configDir);
  outcome = "passed";
} catch (error) {
  reason = /^[A-Z_]+$/.test(error?.message ?? "") ? error.message : phase;
} finally {
  if (runtime) {
    if (postgresStarted) dockerProbe(["rm", "-f", postgres]);
    if (volumeCreated) dockerProbe(["volume", "rm", volume]);
    resourcesRemoved =
      (!postgresStarted || !dockerProbe(["inspect", postgres])) &&
      (!volumeCreated || !dockerProbe(["volume", "inspect", volume]));
  }
  if (directory) {
    try {
      await rm(directory, { recursive: true, force: true });
    } catch {
      resourcesRemoved = false;
    }
    if (existsSync(directory)) resourcesRemoved = false;
  }
  if (!resourcesRemoved && (postgresStarted || volumeCreated || directory)) {
    outcome = "failed";
    reason = "CLEANUP";
  }
  const output = {
    kind: "commandry_host_recovery_drill",
    outcome,
    environment: production ? "production" : "local",
    sourceLabel,
    globalsSnapshotId: process.argv[3] ?? null,
    configurationSnapshotId: process.argv[5] ?? null,
    globalsApplied: outcome === "passed",
    configurationExtracted: outcome === "passed",
    configurationInstalled: false,
    postgresRoleCount: result?.roleCount ?? null,
    backupReadMembershipVerified: result?.readMembership ?? false,
    postgresImageId: result?.postgresImageId ?? null,
    isolatedNetwork: result?.isolatedNetwork ?? false,
    resourcesRemoved,
    offsiteVerified: production && outcome === "passed",
    vpsRecoveryVerified: false,
    phase: outcome === "passed" ? null : phase,
    reason,
    diagnostic,
  };
  if (outcome === "passed") console.log(JSON.stringify(output));
  else {
    console.error(JSON.stringify(output));
    process.exitCode = 1;
  }
}
