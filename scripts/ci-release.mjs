import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  createReadStream,
  createWriteStream,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { createGzip, createGunzip } from "node:zlib";
import { detectContainerRuntime, runContainer } from "./container-runtime.mjs";
import {
  getLocalSourceState,
  imageLabelsMatchSource,
  localComposeSourceVariables,
  runtimeWithLocalSource,
} from "./local-source-provenance.mjs";
import { assertLocalPostgresAvailable } from "./local-postgres-guard.mjs";

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

export async function fileDigest(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

export function verifyMetadata(metadata, expected) {
  requireValue(metadata.schemaVersion === 1, "Unsupported image artifact");
  requireValue(
    /^[0-9a-f]{40}$/.test(expected.revision) &&
      metadata.sourceSha === expected.revision &&
      metadata.runId === expected.runId &&
      metadata.attempt === expected.attempt,
    "Artifact source or workflow identity differs",
  );
  for (const [key, value] of [
    ["imageId", expected.imageId],
    ["archiveSha256", expected.archiveSha256],
    ["censusSha256", expected.censusSha256],
  ]) {
    requireValue(
      typeof value === "string" &&
        (key === "imageId" ? /^sha256:[0-9a-f]{64}$/ : /^[0-9a-f]{64}$/).test(
          value,
        ) &&
        metadata[key] === value,
      `Artifact ${key} differs from the producing job`,
    );
  }
  return metadata;
}

export function browserRows(report) {
  const rows = [];
  function visit(suite) {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests) rows.push({ spec, test });
    }
    for (const child of suite.suites ?? []) visit(child);
  }
  for (const suite of report.suites) visit(suite);
  return rows;
}

function identity({ spec, test }) {
  return JSON.stringify([test.projectName, spec.id, spec.file, spec.title]);
}
function skipIdentity({ spec, test }) {
  return JSON.stringify([test.projectName, spec.file, spec.title]);
}

export function verifyBrowserReports(
  expected,
  reports,
  skipPolicy,
  shardTotal,
) {
  const expectedRows = browserRows(expected);
  const wanted = new Set(expectedRows.map(identity));
  requireValue(
    wanted.size > 0 && wanted.size === expectedRows.length,
    "Empty or duplicate expected browser identities",
  );
  requireValue(reports.length === shardTotal, "Missing browser shard report");
  const observed = new Set();
  const shards = new Set();
  const skipped = new Set();
  let passed = 0;
  for (const report of reports) {
    const shard = report.config.shard;
    requireValue(
      shard?.total === shardTotal &&
        Number.isInteger(shard.current) &&
        shard.current >= 1 &&
        shard.current <= shardTotal &&
        !shards.has(shard.current),
      "Invalid or duplicate browser shard",
    );
    shards.add(shard.current);
    requireValue(
      report.config.workers === 1 &&
        report.config.fullyParallel === true &&
        report.config.projects.every((project) => project.retries === 0) &&
        !report.errors?.length &&
        report.stats.unexpected === 0 &&
        report.stats.flaky === 0,
      "Browser failure, retry policy or execution configuration differs",
    );
    for (const row of browserRows(report)) {
      const key = identity(row);
      requireValue(wanted.has(key), "Unexpected browser identity");
      requireValue(!observed.has(key), "Duplicate browser identity");
      observed.add(key);
      const { test } = row;
      requireValue(
        test.results.length === 1 &&
          test.results[0].retry === 0 &&
          !test.results[0].errors?.length,
        "Missing, retried or errored browser result",
      );
      const result = test.results[0];
      if (result.status === "skipped") {
        requireValue(test.status === "skipped", "Invalid skip result");
        skipped.add(skipIdentity(row));
      } else {
        requireValue(
          result.status === "passed" &&
            test.status === "expected" &&
            test.expectedStatus === "passed",
          "Browser result did not pass",
        );
        passed++;
      }
    }
  }
  requireValue(observed.size === wanted.size, "Missing browser identities");
  const allowedSkips = new Set(
    skipPolicy.map((item) =>
      JSON.stringify([item.project, item.file, item.title]),
    ),
  );
  requireValue(
    skipped.size === allowedSkips.size &&
      [...skipped].every((key) => allowedSkips.has(key)),
    "Browser skip policy changed",
  );
  return {
    identities: observed.size,
    passed,
    skipped: skipped.size,
    failures: 0,
    flaky: 0,
    retries: 0,
    shards: shardTotal,
    completeIdentitySet: true,
  };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}
function sourceIdentity() {
  const source = getLocalSourceState();
  requireValue(
    source.clean && source.revision === process.env.GITHUB_SHA,
    "Release helper requires the exact clean workflow source",
  );
  return source;
}
function runtimeFor(source) {
  const runtime = detectContainerRuntime();
  requireValue(runtime, "Docker-compatible runtime unavailable");
  return runtimeWithLocalSource(runtime, localComposeSourceVariables(source));
}
function docker(runtime, args, capture = false) {
  const result = runContainer(runtime, args, {
    ...(capture
      ? { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 }
      : { stdio: "inherit" }),
    env: { ...process.env, ...localComposeSourceVariables(sourceIdentity()) },
  });
  requireValue(
    !result.error && result.status === 0,
    "Container command failed",
  );
  return capture ? result.stdout : undefined;
}
function inspect(runtime, source, expectedId) {
  const [image] = JSON.parse(
    docker(
      runtime,
      ["image", "inspect", `commandry-local:${source.revision}`],
      true,
    ),
  );
  requireValue(
    imageLabelsMatchSource(image.Config.Labels, source) &&
      /^sha256:[0-9a-f]{64}$/.test(image.Id) &&
      (!expectedId || image.Id === expectedId),
    "Loaded image differs from the qualified source or image ID",
  );
  return image;
}
function workflowIdentity() {
  requireValue(
    /^\d+$/.test(process.env.GITHUB_RUN_ID ?? "") &&
      /^\d+$/.test(process.env.GITHUB_RUN_ATTEMPT ?? ""),
    "Workflow identity unavailable",
  );
  return {
    runId: process.env.GITHUB_RUN_ID,
    attempt: process.env.GITHUB_RUN_ATTEMPT,
  };
}

export async function verifyArtifact(directory, expected) {
  const metadata = verifyMetadata(
    readJson(join(directory, "image.json")),
    expected,
  );
  requireValue(
    (await fileDigest(join(directory, "image.tar.gz"))) ===
      metadata.archiveSha256 &&
      (await fileDigest(join(directory, "expected-browser.json"))) ===
        metadata.censusSha256,
    "Image archive or expected census checksum differs",
  );
  return metadata;
}

async function main() {
  const [command, path, reportPath] = process.argv.slice(2);
  requireValue(
    ["export", "load", "start", "verify", "census"].includes(command) && path,
    "Usage: node scripts/ci-release.mjs export|load|start|verify|census ARTIFACT_DIR [REPORT_DIR]",
  );
  const directory = resolve(path);
  const source = sourceIdentity();
  if (command === "export") {
    const runtime = runtimeFor(source);
    const image = inspect(runtime, source);
    mkdirSync(directory, { recursive: true });
    const archive = join(directory, "image.tar");
    docker(runtime, [
      "save",
      "--output",
      archive,
      `commandry-local:${source.revision}`,
    ]);
    await pipeline(
      createReadStream(archive),
      createGzip({ level: 1 }),
      createWriteStream(archive + ".gz"),
    );
    rmSync(archive);
    const census = spawnSync(
      "pnpm",
      ["exec", "playwright", "test", "--list", "--reporter=json"],
      {
        env: { ...process.env, PLAYWRIGHT_BASE_URL: "http://127.0.0.1:3000" },
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
      },
    );
    requireValue(
      census.status === 0,
      "Cannot enumerate selected-source browsers",
    );
    requireValue(
      !JSON.parse(census.stdout).errors?.length,
      "Browser enumeration failed",
    );
    writeFileSync(join(directory, "expected-browser.json"), census.stdout);
    const metadata = {
      schemaVersion: 1,
      sourceSha: source.revision,
      ...workflowIdentity(),
      imageId: image.Id,
      archiveSha256: await fileDigest(archive + ".gz"),
      censusSha256: await fileDigest(join(directory, "expected-browser.json")),
    };
    writeFileSync(
      join(directory, "image.json"),
      JSON.stringify(metadata, null, 2) + "\n",
    );
    requireValue(process.env.GITHUB_OUTPUT, "Job output path unavailable");
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `image_id=${metadata.imageId}\narchive_sha256=${metadata.archiveSha256}\ncensus_sha256=${metadata.censusSha256}\n`,
    );
    console.log(JSON.stringify(metadata));
    return;
  }
  const metadata = await verifyArtifact(directory, {
    revision: source.revision,
    ...workflowIdentity(),
    imageId: process.env.CI_EXPECTED_IMAGE_ID,
    archiveSha256: process.env.CI_EXPECTED_ARCHIVE_SHA256,
    censusSha256: process.env.CI_EXPECTED_CENSUS_SHA256,
  });
  if (command === "census") {
    requireValue(reportPath, "Browser report directory required");
    const reports = [];
    function visit(path) {
      for (const entry of readdirSync(path, { withFileTypes: true })) {
        const child = join(path, entry.name);
        if (entry.isDirectory()) visit(child);
        else if (entry.name === "browser-results.json")
          reports.push(readJson(child));
      }
    }
    visit(resolve(reportPath));
    const summary = {
      sourceSha: source.revision,
      ...workflowIdentity(),
      imageId: metadata.imageId,
      ...verifyBrowserReports(
        readJson(join(directory, "expected-browser.json")),
        reports,
        readJson("scripts/ci-browser-skips.json"),
        6,
      ),
    };
    writeFileSync(
      join(resolve(reportPath), "browser-summary.json"),
      JSON.stringify(summary, null, 2) + "\n",
    );
    console.log(JSON.stringify(summary));
    return;
  }
  const runtime = runtimeFor(source);
  if (command === "verify") {
    inspect(runtime, source, metadata.imageId);
    const compose = [
      "compose",
      "--env-file",
      ".env.local",
      "-f",
      "compose.yaml",
    ];
    for (const service of ["web", "worker"]) {
      const id = docker(
        runtime,
        [...compose, "ps", "--quiet", service],
        true,
      ).trim();
      requireValue(/^[0-9a-f]{12,64}$/.test(id), "Tested service is missing");
      const [container] = JSON.parse(docker(runtime, ["inspect", id], true));
      requireValue(
        container.Image === metadata.imageId &&
          container.State.Health?.Status === "healthy" &&
          imageLabelsMatchSource(container.Config.Labels, source),
        "Tested service no longer matches the healthy candidate",
      );
    }
    return;
  }
  const archive = join(directory, "loaded-image.tar");
  try {
    await pipeline(
      createReadStream(join(directory, "image.tar.gz")),
      createGunzip(),
      createWriteStream(archive),
    );
    docker(runtime, ["load", "--input", archive]);
  } finally {
    rmSync(archive, { force: true });
  }
  inspect(runtime, source, metadata.imageId);
  if (command === "start") {
    const compose = [
      "compose",
      "--env-file",
      ".env.local",
      "-f",
      "compose.yaml",
    ];
    assertLocalPostgresAvailable(runtime, compose);
    docker(runtime, [...compose, "up", "--no-build", "-d", "--wait"]);
    inspect(runtime, source, metadata.imageId);
  }
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  await main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Release verification failed",
    );
    process.exitCode = 1;
  });
}
