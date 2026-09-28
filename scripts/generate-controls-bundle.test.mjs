import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";

const generator = resolve("scripts/generate-controls-bundle.py");
const reviewedList = readFileSync(resolve("deploy/controls-files.txt"));
const reviewedPaths = reviewedList.toString().trim().split("\n");
const reviewedDigest =
  "d8b2d74c7dc3ecfbd0bb753fff95e486e84f1b2a5f45b8e625c01c55e0efe483";
const runtimeHelper = "scripts/commandry-backup-gate.mjs";

function command(program, args, cwd, environment = {}) {
  const result = spawnSync(program, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...environment },
    timeout: 30_000,
  });
  if (result.error) throw result.error;
  return result;
}

function git(repository, ...args) {
  const result = command("git", args, repository);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function fixture(t, { missing, symlink } = {}) {
  const root = mkdtempSync(join(homedir(), ".commandry-bundle-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repository = join(root, "repository");
  mkdirSync(repository);
  git(repository, "init", "-q", "-b", "main");
  git(repository, "config", "user.name", "Bundle Fixture");
  git(repository, "config", "user.email", "bundle@example.invalid");
  for (const path of reviewedPaths) {
    const target = join(repository, path);
    mkdirSync(dirname(target), { recursive: true });
    if (path === missing) continue;
    if (path === symlink) {
      symlinkSync("Caddyfile", target);
    } else {
      writeFileSync(target, `committed ${path}\n`);
      if (path.endsWith(".sh")) chmodSync(target, 0o755);
    }
  }
  writeFileSync(join(repository, "deploy/controls-files.txt"), reviewedList);
  git(repository, "add", ".");
  git(repository, "commit", "-qm", "fixture");
  const revision = git(repository, "rev-parse", "HEAD");
  git(repository, "update-ref", "refs/remotes/origin/main", revision);
  return { root, repository, revision };
}

function generate(repository, revision, outputDir, environment = {}) {
  return command(
    "python3",
    [
      generator,
      "--repository",
      repository,
      "--revision",
      revision,
      "--output-dir",
      outputDir,
    ],
    repository,
    environment,
  );
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

test("reviewed list contains the full pinned host selection", () => {
  assert.equal(reviewedPaths.length, 40);
  assert.equal(digest(reviewedList), reviewedDigest);
  assert.ok(reviewedPaths.includes(runtimeHelper));
  assert.ok(reviewedPaths.includes("deploy/commandry-backup-gate.sh"));
  assert.ok(reviewedPaths.includes("scripts/restic-host-recovery.mjs"));
});

test("archive contains every committed file with reproducible private output", (t) => {
  const { root, repository, revision } = fixture(t);
  const firstDir = join(root, "first");
  const secondDir = join(root, "second");
  const first = generate(repository, revision, firstDir);
  assert.equal(first.status, 0, first.stderr);
  const second = generate(repository, revision, secondDir);
  assert.equal(second.status, 0, second.stderr);
  const filename = `commandry-controls-${revision.slice(0, 7)}.tar.gz`;
  const archive = join(firstDir, filename);
  const manifest = readFileSync(join(firstDir, "source.sha256"));
  assert.deepEqual(manifest, readFileSync(join(secondDir, "source.sha256")));
  assert.deepEqual(
    readFileSync(archive),
    readFileSync(join(secondDir, filename)),
  );
  assert.equal(statSync(firstDir).mode & 0o777, 0o700);
  assert.equal(statSync(archive).mode & 0o777, 0o600);
  assert.equal(statSync(join(firstDir, "source.sha256")).mode & 0o777, 0o600);
  assert.deepEqual(
    command("tar", ["-tzf", archive], repository).stdout.trim().split("\n"),
    reviewedPaths,
  );
  const entries = Object.fromEntries(
    manifest
      .toString()
      .trim()
      .split("\n")
      .map((line) => line.split("  ").reverse()),
  );
  for (const path of reviewedPaths) {
    const data = command(
      "git",
      ["show", `${revision}:${path}`],
      repository,
    ).stdout;
    const extracted = command(
      "tar",
      ["-xOf", archive, path],
      repository,
    ).stdout;
    assert.equal(extracted, data);
    assert.equal(entries[path], digest(data));
  }
  const metadata = command(
    "python3",
    [
      "-c",
      "import json,sys,tarfile; f=tarfile.open(sys.argv[1], 'r:gz'); print(json.dumps([(x.name,x.mode,x.mtime,x.uid,x.gid,x.type.decode()) for x in f.getmembers()]))",
      archive,
    ],
    repository,
  );
  assert.equal(metadata.status, 0, metadata.stderr);
  assert.deepEqual(
    JSON.parse(metadata.stdout),
    reviewedPaths.map((path) => [
      path,
      path.endsWith(".sh") ? 0o755 : 0o644,
      0,
      0,
      0,
      "0",
    ]),
  );
  assert.deepEqual([...readFileSync(archive).subarray(4, 8)], [0, 0, 0, 0]);
});

test("replacement refs and inherited Git overrides cannot alter committed bytes", (t) => {
  const { root, repository, revision } = fixture(t);
  const path = "deploy/Caddyfile";
  const original = git(repository, "show", `${revision}:${path}`);
  writeFileSync(join(repository, path), "replaced control\n");
  git(repository, "add", path);
  git(repository, "commit", "-qm", "alternate-tree");
  const alternate = git(repository, "rev-parse", "HEAD");
  git(repository, "reset", "--hard", revision);
  git(repository, "replace", revision, alternate);
  assert.equal(
    git(repository, "show", `${revision}:${path}`),
    "replaced control",
  );
  const output = join(root, "replacement-safe");
  const result = generate(repository, revision, output, {
    GIT_DIR: "/nonexistent/override-git-dir",
    GIT_WORK_TREE: "/nonexistent/override-work-tree",
    GIT_INDEX_FILE: "/nonexistent/override-index",
    GIT_NO_REPLACE_OBJECTS: "",
  });
  assert.equal(result.status, 0, result.stderr);
  const archive = join(
    output,
    `commandry-controls-${revision.slice(0, 7)}.tar.gz`,
  );
  assert.equal(
    command("tar", ["-xOf", archive, path], repository).stdout.trim(),
    original,
  );
});

test("omitting a runtime helper from a clean committed list is rejected", (t) => {
  const { root, repository } = fixture(t);
  const shortened = reviewedPaths.filter((path) => path !== runtimeHelper);
  assert.equal(shortened.length, reviewedPaths.length - 1);
  writeFileSync(
    join(repository, "deploy/controls-files.txt"),
    `${shortened.join("\n")}\n`,
  );
  git(repository, "add", "deploy/controls-files.txt");
  git(repository, "commit", "-qm", "omit-runtime-helper");
  const revision = git(repository, "rev-parse", "HEAD");
  git(repository, "update-ref", "refs/remotes/origin/main", revision);
  const result = generate(repository, revision, join(root, "omitted"));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /differs from the reviewed 40-path selection/);
});

test("existing and publicly writable output directories are refused", (t) => {
  const { root, repository, revision } = fixture(t);
  const existing = join(root, "existing");
  mkdirSync(existing, { mode: 0o777 });
  chmodSync(existing, 0o777);
  const reused = generate(repository, revision, existing);
  assert.notEqual(reused.status, 0);
  assert.match(reused.stderr, /already exists/);
  const publicParent = join(root, "public-parent");
  mkdirSync(publicParent, { mode: 0o777 });
  chmodSync(publicParent, 0o777);
  const publicResult = generate(
    repository,
    revision,
    join(publicParent, "new"),
  );
  assert.notEqual(publicResult.status, 0);
  assert.match(publicResult.stderr, /writable by other users/);
});

test("a previously generated archive cannot be overwritten", (t) => {
  const { root, repository, revision } = fixture(t);
  const output = join(root, "output");
  assert.equal(generate(repository, revision, output).status, 0);
  const archive = readFileSync(
    join(output, `commandry-controls-${revision.slice(0, 7)}.tar.gz`),
  );
  const rerun = generate(repository, revision, output);
  assert.notEqual(rerun.status, 0);
  assert.match(rerun.stderr, /already exists/);
  assert.deepEqual(
    readFileSync(
      join(output, `commandry-controls-${revision.slice(0, 7)}.tar.gz`),
    ),
    archive,
  );
});

test("dirty list and source files cannot be bundled", (t) => {
  const listed = fixture(t);
  writeFileSync(
    join(listed.repository, "deploy/controls-files.txt"),
    "changed\n",
  );
  const listResult = generate(
    listed.repository,
    listed.revision,
    join(listed.root, "dirty-list"),
  );
  assert.notEqual(listResult.status, 0);
  assert.match(listResult.stderr, /working tree must be clean/);
  const source = fixture(t);
  writeFileSync(
    join(source.repository, "deploy/Caddyfile"),
    "changed control\n",
  );
  const sourceResult = generate(
    source.repository,
    source.revision,
    join(source.root, "dirty-source"),
  );
  assert.notEqual(sourceResult.status, 0);
  assert.match(sourceResult.stderr, /working tree must be clean/);
});

test("HEAD, main, and origin/main must match the requested commit", (t) => {
  const { root, repository, revision } = fixture(t);
  git(repository, "commit", "--allow-empty", "-qm", "new-main");
  const newer = git(repository, "rev-parse", "HEAD");
  const staleRemote = generate(repository, newer, join(root, "stale-remote"));
  assert.notEqual(staleRemote.status, 0);
  assert.match(staleRemote.stderr, /must match exactly/);
  git(repository, "update-ref", "refs/remotes/origin/main", newer);
  git(repository, "switch", "-q", "-c", "topic");
  git(repository, "commit", "--allow-empty", "-qm", "topic");
  const wrongHead = generate(repository, revision, join(root, "wrong-head"));
  assert.notEqual(wrongHead.status, 0);
  assert.match(wrongHead.stderr, /must match exactly/);
});

test("missing and symlinked selected paths fail before output", (t) => {
  const missing = fixture(t, { missing: runtimeHelper });
  const absent = generate(
    missing.repository,
    missing.revision,
    join(missing.root, "missing"),
  );
  assert.notEqual(absent.status, 0);
  assert.match(absent.stderr, /missing or nonregular/);
  const linked = fixture(t, { symlink: "deploy/commandry-deploy.sh" });
  const link = generate(
    linked.repository,
    linked.revision,
    join(linked.root, "linked"),
  );
  assert.notEqual(link.status, 0);
  assert.match(link.stderr, /missing or nonregular/);
});
