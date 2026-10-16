import { constants } from "node:fs";
import { open, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { TextDecoder } from "node:util";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import {
  buildFoundationSkillRegistrationPlan,
  buildFoundationSkillRegistryIndex,
  readFoundationSkillConfigurationReceipt,
} from "../packages/application/src/foundation-skill-registry.ts";

// Run with node --import tsx scripts/foundation-skill-registry.mjs
// --bundle /explicit/bundle.json --output /explicit/report.json [--record
// --endpoint https://host/mcp/foundation/PROJECT_UUID]. Supply credentials only
// through COMMANDRY_FOUNDATION_TOKEN. Preview has no network effects.
function failure(code = "REGISTRATION_FAILED") {
  const error = new Error("Foundation skill registry failed");
  error.code = code;
  return error;
}
export function parseFoundationSkillRegistryArguments(argv) {
  const parsed = { record: false };
  for (let index = 0; index < argv.length; index++) {
    const name = argv[index];
    if (name === "--record" && !parsed.record) parsed.record = true;
    else if (["--bundle", "--output", "--endpoint"].includes(name)) {
      const field = name.slice(2);
      if (
        Object.hasOwn(parsed, field) ||
        !argv[index + 1] ||
        argv[index + 1].startsWith("--")
      )
        throw failure("INVALID_ARGUMENTS");
      parsed[field] = argv[++index];
    } else throw failure("INVALID_ARGUMENTS");
  }
  if (!parsed.bundle || !parsed.output || (!parsed.record && parsed.endpoint))
    throw failure("INVALID_ARGUMENTS");
  if (parsed.record && !parsed.endpoint) throw failure("INVALID_ARGUMENTS");
  if (resolve(parsed.bundle) === resolve(parsed.output))
    throw failure("INVALID_ARGUMENTS");
  return parsed;
}
function endpointFor(endpoint, projectId) {
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    throw failure("INVALID_ENDPOINT");
  }
  const pathname = "/mcp/foundation/" + projectId;
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== pathname ||
    endpoint !== url.origin + pathname
  )
    throw failure("INVALID_ENDPOINT");
  return url;
}
async function checkpoint(filename, report) {
  const file = await open(
    filename,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_TRUNC |
      constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await file.chmod(0o600);
    await file.writeFile(JSON.stringify(report, null, 2) + "\n", "utf8");
    await file.sync();
  } finally {
    await file.close();
  }
}
export async function runFoundationSkillRegistry(options, token) {
  const file = await stat(options.bundle);
  if (!file.isFile() || file.size > 24 * 1024 * 1024)
    throw failure("INVALID_BUNDLE");
  // Refuse hard-linked input/output aliases as well as identical path strings.
  try {
    const output = await stat(options.output);
    if (file.dev === output.dev && file.ino === output.ino)
      throw failure("INVALID_ARGUMENTS");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  let raw;
  try {
    raw = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      await readFile(options.bundle),
    );
  } catch {
    throw failure("INVALID_BUNDLE");
  }
  const plan = buildFoundationSkillRegistrationPlan(raw);
  const url = options.record
    ? endpointFor(options.endpoint, plan.preview.projectId)
    : null;
  if (
    options.record &&
    (typeof token !== "string" || !/^af_[A-Za-z0-9_-]{43}$/.test(token))
  )
    throw failure("INVALID_CREDENTIAL");
  const report = {
    schemaVersion: 1,
    mode: options.record ? "record" : "preview",
    status: options.record ? "pending" : "preview",
    preview: plan.preview,
    receipts: [],
    index: null,
    transactionality:
      "Each configuration is independently transactional and idempotent.",
    installed: "unknown",
    invoked: "unknown",
    enforced: "unknown",
  };
  await checkpoint(options.output, report);
  if (!options.record) return report;
  const client = new Client({
    name: "commandry-foundation-skill-registry",
    version: "1.0.0",
  });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(url, {
        requestInit: {
          headers: { authorization: "Bearer " + token },
          redirect: "error",
        },
      }),
    );
    let cursor;
    let found = false;
    const seen = new Set();
    do {
      const page = await client.listTools(cursor ? { cursor } : undefined);
      found ||= page.tools.some((tool) => tool.name === "record_configuration");
      cursor = page.nextCursor;
      if (cursor && seen.has(cursor)) throw failure("DISCOVERY_FAILED");
      if (cursor) seen.add(cursor);
    } while (!found && cursor);
    if (!found) throw failure("CAPABILITY_UNAVAILABLE");
    async function record(descriptor) {
      const input = { ...descriptor.input };
      delete input.projectId;
      const result = await client.callTool({
        name: "record_configuration",
        arguments: { ...input, idempotencyKey: descriptor.idempotencyKey },
      });
      if (result.isError || !result.structuredContent) throw failure();
      return readFoundationSkillConfigurationReceipt(
        result.structuredContent,
        descriptor,
      );
    }
    report.receipts.push(await record(plan.manifest));
    report.status = "recording";
    await checkpoint(options.output, report);
    for (const component of plan.components) {
      const descriptor = {
        ...component,
        input: { ...component.input, parentIds: [report.receipts[0].id] },
      };
      report.receipts.push(await record(descriptor));
      await checkpoint(options.output, report);
    }
    const index = buildFoundationSkillRegistryIndex(raw, report.receipts);
    report.index = await record(index);
    report.status = plan.preview.missingComponents.length
      ? "partial"
      : "recorded";
    await checkpoint(options.output, report);
    return report;
  } catch (error) {
    report.status = "failed";
    report.failure = ["CAPABILITY_UNAVAILABLE", "DISCOVERY_FAILED"].includes(
      error.code,
    )
      ? error.code
      : "REGISTRATION_FAILED";
    await checkpoint(options.output, report);
    throw failure(report.failure);
  } finally {
    await client.close();
  }
}
async function main() {
  try {
    const options = parseFoundationSkillRegistryArguments(
      process.argv.slice(2),
    );
    const result = await runFoundationSkillRegistry(
      options,
      process.env.COMMANDRY_FOUNDATION_TOKEN,
    );
    process.stdout.write(
      JSON.stringify({
        status: result.status,
        bundleDigest: result.preview.bundleDigest,
        selectedEntries: result.preview.entries.length,
        availableComponents:
          result.preview.components.length -
          result.preview.missingComponents.length,
        missingComponents: result.preview.missingComponents.length,
        completedConfigurations:
          result.receipts.length + (result.index ? 1 : 0),
        installed: "unknown",
        invoked: "unknown",
        enforced: "unknown",
      }) + "\n",
    );
  } catch {
    process.stderr.write("Foundation skill registry failed.\n");
    process.exitCode = 1;
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  await main();
