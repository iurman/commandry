import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { collectLinuxHost, sendLinuxHost } from "./linux-host-collector.mjs";
test("Python host collector validates counters, receipts and redirect behavior", () => {
  execFileSync("python3", ["-B", "scripts/linux-host-collector_test.py"], {
    timeout: 15_000,
    stdio: "pipe",
  });
});
test("collector reads host counters without a privileged service", async () => {
  const sample = await collectLinuxHost({
    hostname: () => "electra",
    readFile: async (path) =>
      path === "/proc/meminfo"
        ? "MemTotal: 1000 kB\nMemAvailable: 500 kB\n"
        : path === "/proc/uptime"
          ? "10.8 5"
          : "0.125 0 0",
    statfs: async () => ({ blocks: 100, bsize: 1024, bavail: 25 }),
  });
  assert.equal(sample.hostname, "electra");
  assert.equal(sample.memory.totalBytes, 1024000);
  assert.equal(sample.load1Milli, 125);
  assert.equal(sample.uptimeSeconds, 10);
});
test("collector refuses credentials in URLs, nonlocal cleartext and redirects", async () => {
  const environment = {
    COMMANDRY_HOST_RECEIVER_TOKEN: `cmdry_host_${"a".repeat(43)}`,
    COMMANDRY_HOST_RECEIVER_URL: `http://example.com/api/v1/real-integrations/${crypto.randomUUID()}/receive`,
  };
  await assert.rejects(
    sendLinuxHost({}, environment, async () => {
      throw new Error("must not request");
    }),
    /Invalid scoped/,
  );
  environment.COMMANDRY_HOST_RECEIVER_URL = `https://commandry.site/api/v1/real-integrations/${crypto.randomUUID()}/receive`;
  await sendLinuxHost({}, environment, async (_url, options) => {
    assert.equal(options.redirect, "error");
    return Response.json(
      { accepted: true, isSynthetic: false },
      { status: 202 },
    );
  });
  await assert.rejects(
    sendLinuxHost({}, environment, async () =>
      Response.json({ accepted: true, isSynthetic: true }, { status: 202 }),
    ),
    /Invalid host receiver/,
  );
});
