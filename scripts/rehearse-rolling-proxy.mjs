import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { detectContainerRuntime } from "./container-runtime.mjs";

const [caddyImage, output] = process.argv.slice(2);
assert.match(caddyImage ?? "", /^\S+@sha256:[a-f0-9]{64}$/);
assert.ok(output, "Supply a private evidence JSON path");
const runtime = detectContainerRuntime();
assert.ok(runtime, "A disposable container runtime is required");
const execute = promisify(execFile);
async function docker(...args) {
  const result = await execute(runtime.command, [...runtime.prefix, ...args], {
    timeout: 120_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  return result.stdout.trim();
}
function configuration(active, previous) {
  const result = spawnSync(
    "python3",
    [
      "-B",
      "-c",
      "import importlib.util,sys; s=importlib.util.spec_from_file_location('r','deploy/commandry-rolling.py'); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); print(m.proxy_config(sys.argv[1],sys.argv[2]),end='')",
      active,
      previous,
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}
const nodeImage = readFileSync("Dockerfile", "utf8").match(
  /^FROM (node:\S+@sha256:[a-f0-9]{64})/m,
)[1];
const temporary = mkdtempSync(join(dirname(resolve(output)), "proxy-fixture-"));
const caddyfile = join(temporary, "Caddyfile");
const prefix = `commandry-rollout-rehearsal-${process.pid}`;
const names = ["web", "web_next", "proxy"].map((name) => `${prefix}-${name}`);
let network = false;
const created = [];
const evidence = {
  caddyImage,
  nodeImage,
  errors: [],
  samples: [],
  cleanup: false,
};
let sampling = false;
let sampler;
const fixture = `
const http=require('node:http');
const version=process.argv[1]; let ready=true;
http.createServer((q,s)=>{
  if(q.url==='/fail'){ready=false;s.end('set');return;}
  if(q.url==='/health/ready'){s.writeHead(ready?200:503);s.end(version);return;}
  if(q.url==='/slow'){setTimeout(()=>s.end(version),1800);return;}
  if(q.url==='/events'){
    s.writeHead(200,{'content-type':'text/event-stream'});s.write('data: '+version+'\\n\\n');
    const timer=setInterval(()=>s.write('data: tick\\n\\n'),100);
    setTimeout(()=>{clearInterval(timer);s.end();},2200);return;
  }
  if(q.url.startsWith('/_next/static/')){
    if(q.url==='/_next/static/'+version+'.js'){s.end(version);return;}
    s.writeHead(404);s.end('absent');return;
  }
  s.end(version);
}).listen(3000,'0.0.0.0');`;
try {
  await docker("network", "create", prefix);
  network = true;
  for (const [index, alias] of ["web", "web_next"].entries()) {
    await docker(
      "run",
      "-d",
      "--name",
      names[index],
      "--network",
      prefix,
      "--network-alias",
      alias,
      nodeImage,
      "node",
      "-e",
      fixture,
      index === 0 ? "old" : "new",
    );
    created.push(names[index]);
  }
  writeFileSync(caddyfile, configuration("web", "web"));
  await docker(
    "run",
    "-d",
    "--name",
    names[2],
    "--network",
    prefix,
    "-p",
    "127.0.0.1::80",
    "-v",
    `${caddyfile}:/etc/caddy/Caddyfile:ro,z`,
    caddyImage,
  );
  created.push(names[2]);
  const address = await docker("port", names[2], "80");
  assert.match(address, /^127\.0\.0\.1:\d+$/);
  const origin = `http://${address}`;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      assert.equal(await (await fetch(origin)).text(), "old");
      break;
    } catch {
      if (attempt === 29)
        throw new Error("Disposable proxy never became ready");
      await delay(200);
    }
  }
  sampling = true;
  sampler = (async () => {
    while (sampling) {
      try {
        const response = await fetch(origin, {
          signal: AbortSignal.timeout(2000),
        });
        const body = await response.text();
        evidence.samples.push({
          at: new Date().toISOString(),
          status: response.status,
          body,
        });
        if (response.status !== 200 || !["old", "new"].includes(body))
          evidence.errors.push(body);
      } catch (error) {
        evidence.errors.push(error.message);
      }
      await delay(25);
    }
  })();
  const slow = fetch(origin + "/slow").then((response) => response.text());
  const stream = await fetch(origin + "/events");
  const streamed = stream.text();
  await delay(150);
  // Same single-file bind mount, validation and graceful reload as production.
  async function route(active, previous) {
    writeFileSync(
      join(temporary, "candidate"),
      configuration(active, previous),
    );
    await docker(
      "cp",
      join(temporary, "candidate"),
      `${names[2]}:/tmp/candidate.Caddyfile`,
    );
    await docker(
      "exec",
      names[2],
      "caddy",
      "validate",
      "--config",
      "/tmp/candidate.Caddyfile",
      "--adapter",
      "caddyfile",
    );
    writeFileSync(caddyfile, configuration(active, previous));
    await docker(
      "exec",
      names[2],
      "caddy",
      "reload",
      "--config",
      "/etc/caddy/Caddyfile",
      "--adapter",
      "caddyfile",
    );
  }
  await route("web_next", "web");
  assert.equal(await (await fetch(origin)).text(), "new");
  assert.equal(await slow, "old");
  const events = await streamed;
  assert.ok(
    events.startsWith("data: old\n\n") && events.includes("data: tick"),
  );
  assert.equal(
    await (await fetch(origin + "/_next/static/old.js")).text(),
    "old",
  );
  assert.equal(
    await (await fetch(origin + "/_next/static/new.js")).text(),
    "new",
  );
  await route("web", "web");
  assert.equal(await (await fetch(origin)).text(), "old");
  await delay(200);
  sampling = false;
  await sampler;
  assert.deepEqual(evidence.errors, []);
  assert.ok(evidence.samples.some((sample) => sample.body === "old"));
  assert.ok(evidence.samples.some((sample) => sample.body === "new"));
  Object.assign(evidence, {
    outcome: "passed",
    inflight: "completed on old",
    stream: "completed on old",
    previousStatic: "served",
    newStatic: "served",
    rollback: "old restored",
    sampleCount: evidence.samples.length,
  });
} finally {
  sampling = false;
  await sampler;
  for (const name of created.reverse()) await docker("rm", "-f", name);
  if (network) await docker("network", "rm", prefix);
  evidence.cleanup = true;
  rmSync(temporary, { recursive: true, force: true });
  writeFileSync(resolve(output), JSON.stringify(evidence, null, 2) + "\n");
  console.log(
    JSON.stringify({
      evidence: resolve(output),
      outcome: evidence.outcome,
      errors: evidence.errors.length,
      samples: evidence.samples.length,
      cleanup: evidence.cleanup,
      directory: dirname(resolve(output)),
    }),
  );
}
