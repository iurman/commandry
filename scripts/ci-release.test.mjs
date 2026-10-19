import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  fileDigest,
  verifyArtifact,
  verifyBrowserReports,
  verifyMetadata,
} from "./ci-release.mjs";

const metadata = {
  schemaVersion: 1,
  sourceSha: "a".repeat(40),
  runId: "123",
  attempt: "1",
  imageId: `sha256:${"b".repeat(64)}`,
  archiveSha256: "c".repeat(64),
  censusSha256: "d".repeat(64),
};
const expected = { ...metadata, revision: metadata.sourceSha };

test("image metadata is bound to the exact producing source, attempt and outputs", () => {
  assert.equal(verifyMetadata(metadata, expected), metadata);
  for (const key of Object.keys(metadata)) {
    assert.throws(() =>
      verifyMetadata({ ...metadata, [key]: "different" }, expected),
    );
  }
  assert.throws(() =>
    verifyMetadata(metadata, { ...expected, imageId: undefined }),
  );
});

test("corrupted or substituted image/census files cannot pass artifact verification", async () => {
  const directory = mkdtempSync(join(tmpdir(), "commandry-ci-artifact-"));
  try {
    const archive = join(directory, "image.tar.gz");
    const census = join(directory, "expected-browser.json");
    writeFileSync(archive, "original-image-bytes");
    writeFileSync(census, "original-census");
    const original = {
      ...metadata,
      archiveSha256: await fileDigest(archive),
      censusSha256: await fileDigest(census),
    };
    const trusted = { ...original, revision: original.sourceSha };
    writeFileSync(join(directory, "image.json"), JSON.stringify(original));
    await verifyArtifact(directory, trusted);
    for (const [path, contents] of [
      [archive, "original-image-bytes"],
      [census, "original-census"],
    ]) {
      writeFileSync(path, "substituted");
      await assert.rejects(
        verifyArtifact(directory, trusted),
        /checksum differs/,
      );
      writeFileSync(path, contents);
    }
    writeFileSync(
      join(directory, "image.json"),
      JSON.stringify({ ...original, archiveSha256: "e".repeat(64) }),
    );
    await assert.rejects(verifyArtifact(directory, trusted), /producing job/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

function fixture() {
  const specs = Array.from({ length: 6 }, (_, i) => ({
    id: `identity-${i}`,
    file: "journey.spec.ts",
    title: `Journey ${i}`,
    tests: [
      {
        projectName: "desktop",
        expectedStatus: "passed",
        status: "expected",
        results: [{ status: "passed", retry: 0, errors: [] }],
      },
    ],
  }));
  return {
    expected: { suites: [{ specs }] },
    reports: specs.map((spec, i) => ({
      config: {
        shard: { current: i + 1, total: 6 },
        workers: 1,
        fullyParallel: true,
        projects: [{ retries: 0 }],
      },
      stats: { unexpected: 0, flaky: 0 },
      suites: [{ specs: [structuredClone(spec)] }],
    })),
  };
}
function verify(data, skips = []) {
  return verifyBrowserReports(data.expected, data.reports, skips, 6);
}

test("complete independent browser shards conserve every selected-source identity", () => {
  const data = fixture();
  assert.equal(verify(data).passed, 6);
  const extra = structuredClone(data.expected.suites[0].specs[0]);
  extra.id = "new-source-test";
  data.expected.suites[0].specs.push(extra);
  data.reports[0].suites[0].specs.push(structuredClone(extra));
  assert.equal(verify(data).identities, 7);
});

test("missing reports, missing cases, duplicate cases and duplicate shards fail closed", () => {
  const missingReport = fixture();
  missingReport.reports.pop();
  assert.throws(() => verify(missingReport), /Missing browser shard/);
  const missing = fixture();
  missing.reports[0].suites[0].specs = [];
  assert.throws(() => verify(missing), /Missing browser identities/);
  const duplicate = fixture();
  duplicate.reports[1].suites[0].specs = structuredClone(
    duplicate.reports[0].suites[0].specs,
  );
  assert.throws(() => verify(duplicate), /Duplicate browser identity/);
  const shard = fixture();
  shard.reports[1].config.shard.current = 1;
  assert.throws(() => verify(shard), /duplicate browser shard/);
});

test("failed, flaky, retried or differently configured browser lanes cannot qualify", () => {
  const mutations = [
    (r) => {
      r.stats.unexpected = 1;
    },
    (r) => {
      r.stats.flaky = 1;
    },
    (r) => {
      r.config.workers = 2;
    },
    (r) => {
      r.config.projects[0].retries = 1;
    },
    (r) => {
      r.errors = [{ message: "worker crashed" }];
    },
    (r) => {
      r.suites[0].specs[0].tests[0].results[0].retry = 1;
    },
    (r) => {
      r.suites[0].specs[0].tests[0].results[0].status = "failed";
    },
  ];
  for (const mutate of mutations) {
    const data = fixture();
    mutate(data.reports[0]);
    assert.throws(() => verify(data));
  }
});

test("only the explicitly reviewed skip identities are accepted", () => {
  const data = fixture();
  const test = data.reports[0].suites[0].specs[0].tests[0];
  test.status = "skipped";
  test.results[0].status = "skipped";
  const policy = [
    { project: "desktop", file: "journey.spec.ts", title: "Journey 0" },
  ];
  assert.equal(verify(data, policy).skipped, 1);
  assert.throws(() => verify(data), /skip policy/);
  assert.throws(() => verify(fixture(), policy), /skip policy/);
});
