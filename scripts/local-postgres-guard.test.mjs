import assert from "node:assert/strict";
import { test } from "node:test";
import { assertLocalPostgresAvailable } from "./local-postgres-guard.mjs";

const config = {
  name: "commandry-mvp",
  services: {
    postgres: {
      volumes: [
        { type: "volume", source: "data", target: "/var/lib/postgresql" },
      ],
    },
  },
  volumes: { data: { name: "commandry-local-postgres" } },
};
const owner = {
  name: "/commandry-mvp-postgres-1",
  labels: {
    "com.docker.compose.project": "commandry-mvp",
    "com.docker.compose.service": "postgres",
  },
  mounts: [{ Type: "volume", Name: "commandry-local-postgres", RW: true }],
};

function check(containers, configured = config) {
  const calls = [];
  const responses = [
    JSON.stringify(configured),
    containers.map((_, index) => `container${index}`).join("\n"),
    containers.map((container) => JSON.stringify(container)).join("\n"),
  ];
  assertLocalPostgresAvailable(
    {},
    ["compose", "-p", configured.name],
    (_, args) => {
      calls.push(args);
      return { status: 0, stdout: responses.shift() };
    },
  );
  return calls;
}

test("an unused volume and the project's existing database may start", () => {
  assert.equal(check([]).length, 2);
  const calls = check([owner]);
  assert.equal(calls.length, 3);
  assert.ok(calls[1].includes("volume=commandry-local-postgres"));
  assert.ok(calls.every((args) => !args.includes("up")));
});

test("another project cannot start against the active database volume", () => {
  assert.throws(
    () => check([owner], { ...config, name: "commandry-local" }),
    /commandry-mvp-postgres-1.*separate DB_VOLUME_NAME.*startup was stopped/,
  );
});

test("unmanaged writers and duplicate databases are refused", () => {
  assert.throws(() => check([{ ...owner, labels: {} }]), /already in use/);
  assert.throws(() => check([owner, owner]), /already in use/);
});

test("read-only users and unrelated volumes do not block startup", () => {
  check([
    { ...owner, labels: {}, mounts: [{ ...owner.mounts[0], RW: false }] },
  ]);
  check([
    { ...owner, labels: {}, mounts: [{ ...owner.mounts[0], Name: "other" }] },
  ]);
});

test("missing ownership evidence and failed inspection stop startup", () => {
  assert.throws(() => check([], { ...config, volumes: {} }), /Cannot identify/);
  let calls = 0;
  assert.throws(
    () =>
      assertLocalPostgresAvailable({}, ["compose"], () => {
        calls += 1;
        return { status: 1, stdout: "", stderr: "secret fixture" };
      }),
    /Cannot verify.*startup was stopped/,
  );
  assert.equal(calls, 1);
});

test("malformed evidence cannot leak configuration through parser errors", () => {
  assert.throws(
    () =>
      assertLocalPostgresAvailable({}, ["compose"], () => ({
        status: 0,
        stdout: "invalid secret fixture",
      })),
    { message: "Cannot parse local PostgreSQL volume ownership evidence." },
  );
});
