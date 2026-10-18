import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import {
  collectLinuxHost,
  collectLinuxOs,
  parseOsRelease,
  sendLinuxHost,
} from "./linux-host-collector.mjs";
const missing = async () => {
  throw Object.assign(new Error("missing"), { code: "ENOENT" });
};
test("Python host collector validates counters, receipts and redirect behavior", () => {
  execFileSync("python3", ["-B", "scripts/linux-host-collector_test.py"], {
    timeout: 15_000,
    stdio: "pipe",
  });
});
test("collector reads host counters without a privileged service", async () => {
  const files = {
    "/proc/meminfo": "MemTotal: 1000 kB\nMemAvailable: 500 kB\n",
    "/proc/uptime": "10.8 5",
    "/proc/loadavg": "0.125 0 0",
    "/etc/os-release":
      'PRETTY_NAME="Ubuntu 24.04.1 LTS"\nID=ubuntu\nID_LIKE=debian\n',
  };
  const sample = await collectLinuxHost({
    hostname: () => "electra",
    readFile: async (path) => files[path] ?? missing(),
    stat: missing,
    statfs: async () => ({ blocks: 100, bsize: 1024, bavail: 25 }),
  });
  assert.equal(sample.hostname, "electra");
  assert.equal(sample.memory.totalBytes, 1024000);
  assert.equal(sample.load1Milli, 125);
  assert.equal(sample.uptimeSeconds, 10);
  assert.deepEqual(sample.os, {
    id: "ubuntu",
    idLike: ["debian"],
    prettyName: "Ubuntu 24.04.1 LTS",
    platform: null,
  });
});
test("os-release parsing follows shell quoting and clamps to the receiver contract", async () => {
  assert.deepEqual(
    parseOsRelease(
      [
        "# comment",
        'NAME="Debian \\"GNU\\"/Linux"',
        "ID='debian'",
        "lower=ignored",
        "VERSION_ID=12",
        "",
      ].join("\n"),
    ),
    { NAME: 'Debian "GNU"/Linux', ID: "debian", VERSION_ID: "12" },
  );
  const read = (text) => async (path) =>
    path === "/usr/lib/os-release" ? text : missing();
  // The vendor location is the fallback; invalid identity becomes generic Linux.
  assert.deepEqual(
    await collectLinuxOs({
      readFile: read(
        `ID="Not Valid!"\nID_LIKE="rhel centos fedora rhel BAD!"\nPRETTY_NAME="  ${"\u0007"}Rocky ${"x".repeat(300)}"\n`,
      ),
      stat: missing,
    }).then((os) => ({ ...os, prettyName: os.prettyName.length })),
    {
      id: "linux",
      idLike: ["rhel", "centos", "fedora"],
      prettyName: 200,
      platform: null,
    },
  );
  assert.equal(
    (
      await collectLinuxOs({
        readFile: read(`ID=x\nPRETTY_NAME="${"\u{1F600}".repeat(150)}"`),
        stat: missing,
      })
    ).prettyName.length,
    200,
  );
  assert.equal(
    (await collectLinuxOs({ readFile: read("ID=arch\n"), stat: missing }))
      .prettyName,
    "Linux",
  );
  assert.equal(
    await collectLinuxOs({ readFile: missing, stat: missing }),
    null,
  );
});
test("Proxmox VE is identified by its tooling, not by its Debian base", async () => {
  const readFile = async (path) =>
    path === "/etc/os-release"
      ? 'ID=debian\nPRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\n'
      : missing();
  for (const [present, kind] of [
    ["/usr/bin/pveversion", "file"],
    ["/etc/pve", "directory"],
  ]) {
    const os = await collectLinuxOs({
      readFile,
      stat: async (path) =>
        path === present
          ? {
              isFile: () => kind === "file",
              isDirectory: () => kind === "directory",
            }
          : missing(),
    });
    assert.equal(os.id, "debian");
    assert.equal(os.platform, "proxmox-ve");
  }
  const plain = await collectLinuxOs({
    readFile,
    // A directory named like the tool, or a file named like the cluster mount, is not Proxmox.
    stat: async () => ({ isFile: () => false, isDirectory: () => false }),
  });
  assert.equal(plain.platform, null);
});
test("an unreadable os-release omits the identity without failing the sample", async () => {
  const sample = await collectLinuxHost({
    hostname: () => "electra",
    readFile: async (path) =>
      ({
        "/proc/meminfo": "MemTotal: 1000 kB\nMemAvailable: 500 kB\n",
        "/proc/uptime": "10.8 5",
        "/proc/loadavg": "0.125 0 0",
      })[path] ?? missing(),
    stat: missing,
    statfs: async () => ({ blocks: 100, bsize: 1024, bavail: 25 }),
  });
  assert.equal("os" in sample, false);
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
