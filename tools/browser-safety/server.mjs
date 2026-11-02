import console from "node:console";
import process from "node:process";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { connect } from "node:net";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { chromium } from "playwright";
import { chromiumLaunchOptions } from "./browser-safety.cjs";

const token = process.env.BROWSER_WS_PATH;
if (!token || !/^[a-f0-9]{64}$/.test(token))
  throw new Error("A random browser WebSocket path is required.");
const options = { ...chromiumLaunchOptions(chromium), channel: "chrome" };
const require = createRequire(import.meta.url);
const cli = join(dirname(require.resolve("playwright/package.json")), "cli.js");
const upstreamToken = randomBytes(32).toString("hex");
const help = spawnSync(process.execPath, [cli, "run-server", "--help"], {
  encoding: "utf8",
}).stdout;
const child = spawn(
  process.execPath,
  [
    cli,
    "run-server",
    "--host",
    "127.0.0.1",
    "--port",
    "3334",
    "--path",
    `/${upstreamToken}`,
    ...(help.includes("--unsafe") ? ["--unsafe"] : []),
  ],
  { stdio: ["pipe", "pipe", "pipe"] },
);
child.stderr.pipe(process.stderr);
await new Promise((accept, reject) => {
  child.once("error", reject);
  child.once("exit", (code) =>
    reject(new Error(`Playwright service exited before readiness: ${code}`)),
  );
  child.stdout.on("data", (data) => {
    if (data.toString().includes("Listening on")) accept();
  });
});

// The documented run-server transport supports host port forwarding. Its private
// upstream endpoint is never published. This gate fixes launch options for every
// connection, so clients cannot request a different executable or disable safety.
const gate = createServer((request, response) => {
  response.writeHead(404);
  response.end();
});
const sockets = new Set();
gate.on("upgrade", (request, socket, head) => {
  if (request.url !== `/${token}`) {
    socket.destroy();
    return;
  }
  const upstream = connect(3334, "127.0.0.1");
  sockets.add(socket);
  sockets.add(upstream);
  const close = () => {
    socket.destroy();
    upstream.destroy();
    sockets.delete(socket);
    sockets.delete(upstream);
  };
  socket.on("error", close);
  upstream.on("error", close);
  socket.on("close", close);
  upstream.on("close", close);
  upstream.on("connect", () => {
    const headers = {
      ...request.headers,
      "x-playwright-browser": "chromium",
      "x-playwright-launch-options": JSON.stringify(options),
    };
    upstream.write(
      `GET /${upstreamToken} HTTP/1.1\r\n${Object.entries(headers)
        .map(([key, value]) => `${key}: ${value}`)
        .join("\r\n")}\r\n\r\n`,
    );
    if (head.length) upstream.write(head);
    socket.pipe(upstream);
    upstream.pipe(socket);
  });
});
await new Promise((accept) => gate.listen(3333, "0.0.0.0", accept));

try {
  const browser = await chromium.connect(`ws://127.0.0.1:3333/${token}`);
  try {
    const page = await browser.newPage();
    await page.goto("chrome://sandbox");
    const state = await page.locator("body").innerText();
    if (
      !/PID namespaces\s+Yes/i.test(state) ||
      !/Network namespaces\s+Yes/i.test(state) ||
      !/Seccomp-BPF sandbox\s+Yes/i.test(state)
    )
      throw new Error(`Chromium sandbox verification failed: ${state}`);
  } finally {
    await browser.close();
  }
} catch (error) {
  child.kill("SIGTERM");
  gate.close();
  for (const socket of sockets) socket.destroy();
  throw error;
}
console.log("Browser sandbox verified; ready.");
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    gate.close();
    for (const socket of sockets) socket.destroy();
    child.kill("SIGTERM");
  });
}
child.on("exit", (code) => {
  if (!stopping) process.exit(code || 1);
});
