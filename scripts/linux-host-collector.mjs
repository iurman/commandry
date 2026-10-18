import { readFile, stat, statfs } from "node:fs/promises";
import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

const osReleasePaths = ["/etc/os-release", "/usr/lib/os-release"];
const osIdentifier = /^[a-z0-9._-]{1,64}$/;

/** Shell-style KEY=value assignments, as os-release(5) defines them. */
export function parseOsRelease(text) {
  const values = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const split = line.indexOf("=");
    if (!line || line.startsWith("#") || split < 0) continue;
    const key = line.slice(0, split);
    let value = line.slice(split + 1);
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) continue;
    const quote = value[0];
    if (
      value.length >= 2 &&
      (quote === '"' || quote === "'") &&
      value.at(-1) === quote
    ) {
      value = value.slice(1, -1);
      if (quote === '"') value = value.replace(/\\([\\$"`])/g, "$1");
    }
    values[key] = value;
  }
  return values;
}

/** Operating system identity, or null when os-release cannot be read. Values
 * are clamped to the receiver contract so they never cost a sample. */
export async function collectLinuxOs(options = {}) {
  const read = options.readFile ?? readFile;
  const inspect = options.stat ?? stat;
  let text = null;
  for (const path of osReleasePaths) {
    try {
      text = await read(path, "utf8");
      break;
    } catch {
      // Try the vendor location next.
    }
  }
  if (text === null) return null;
  const values = parseOsRelease(text);
  const id = (values.ID ?? "").trim().toLowerCase();
  const like = (values.ID_LIKE ?? "")
    .toLowerCase()
    .split(/\s+/)
    .filter((item) => osIdentifier.test(item));
  // Drop control characters and stop at the receiver's 200 UTF-16 units.
  let prettyName = "";
  for (const char of (values.PRETTY_NAME ?? "").trim()) {
    const code = char.codePointAt(0);
    if (code < 32 || code === 127) continue;
    if (prettyName.length + char.length > 200) break;
    prettyName += char;
  }
  const is = async (path, kind) => {
    try {
      const entry = await inspect(path);
      return kind === "file" ? entry.isFile() : entry.isDirectory();
    } catch {
      return false;
    }
  };
  // Proxmox VE reports ID=debian; its management tooling identifies it.
  const proxmox =
    (await is("/usr/bin/pveversion", "file")) ||
    (await is("/etc/pve", "directory"));
  return {
    id: osIdentifier.test(id) ? id : "linux",
    idLike: [...new Set(like)].slice(0, 8),
    prettyName: prettyName.trim() || "Linux",
    platform: proxmox ? "proxmox-ve" : null,
  };
}

export async function collectLinuxHost(options = {}) {
  const read = options.readFile ?? readFile;
  const stats = options.statfs ?? statfs;
  const [memory, uptime, load, disk] = await Promise.all([
    read("/proc/meminfo", "utf8"),
    read("/proc/uptime", "utf8"),
    read("/proc/loadavg", "utf8"),
    stats("/"),
  ]);
  const totalBytes = Number(/^MemTotal:\s+(\d+) kB$/m.exec(memory)?.[1]) * 1024;
  const availableBytes =
    Number(/^MemAvailable:\s+(\d+) kB$/m.exec(memory)?.[1]) * 1024;
  const sample = {
    hostname: (options.hostname ?? hostname)(),
    sampleId: randomUUID(),
    observedAt: new Date().toISOString(),
    memory: { totalBytes, availableBytes },
    disk: {
      totalBytes: disk.blocks * disk.bsize,
      availableBytes: disk.bavail * disk.bsize,
    },
    uptimeSeconds: Math.floor(Number(uptime.split(" ")[0])),
    load1Milli: Math.round(Number(load.split(" ")[0]) * 1000),
  };
  if (
    [
      totalBytes,
      availableBytes,
      sample.disk.totalBytes,
      sample.disk.availableBytes,
      sample.uptimeSeconds,
      sample.load1Milli,
    ].some((value) => !Number.isSafeInteger(value) || value < 0) ||
    totalBytes === 0 ||
    sample.disk.totalBytes === 0 ||
    availableBytes > totalBytes ||
    sample.disk.availableBytes > sample.disk.totalBytes
  )
    throw new Error("Invalid Linux host counters");
  const system = await collectLinuxOs(options);
  if (system) sample.os = system;
  return sample;
}
export async function sendLinuxHost(
  sample,
  environment = process.env,
  fetcher = fetch,
) {
  const endpoint = new URL(environment.COMMANDRY_HOST_RECEIVER_URL);
  if (
    !(
      endpoint.protocol === "https:" ||
      (endpoint.protocol === "http:" &&
        ["127.0.0.1", "localhost", "[::1]"].includes(endpoint.hostname))
    ) ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    !/^\/api\/v1\/real-integrations\/[0-9a-f-]{36}\/receive$/.test(
      endpoint.pathname,
    ) ||
    !/^cmdry_host_[A-Za-z0-9_-]{43}$/.test(
      environment.COMMANDRY_HOST_RECEIVER_TOKEN ?? "",
    )
  )
    throw new Error("Invalid scoped receiver configuration");
  const response = await fetcher(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${environment.COMMANDRY_HOST_RECEIVER_TOKEN}`,
    },
    body: JSON.stringify(sample),
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status !== 202)
    throw new Error(`Host receiver rejected sample (${response.status})`);
  const receipt = await response.json();
  if (receipt.accepted !== true || receipt.isSynthetic !== false)
    throw new Error("Invalid host receiver receipt");
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const sample = await collectLinuxHost();
    if (process.argv[2] === "--send") {
      await sendLinuxHost(sample);
      process.stdout.write(
        JSON.stringify({ accepted: true, observedAt: sample.observedAt }) +
          "\n",
      );
    } else if (!process.argv[2])
      process.stdout.write(JSON.stringify(sample) + "\n");
    else throw new Error("Use no arguments to sample or --send to submit");
  } catch {
    process.stderr.write("Linux host collection or scoped delivery failed\n");
    process.exitCode = 1;
  }
}
