import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fixtureDigest, scoreReport } from "./fixture.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const serverPath = resolve(root, "scripts/runtime-comparison/fixture.mjs");
const contractPath = fileURLToPath(new URL("./contract.txt", import.meta.url));
const maxBytes = 2_000_000;

export function trialEnvironment(source = process.env) {
  const forbidden = [
    "OPENAI_API_KEY",
    "CODEX_API_KEY",
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_AUTH_TOKEN",
    "ANTHROPIC_BASE_URL",
    "OPENAI_BASE_URL",
    "CLAUDE_CODE_USE_BEDROCK",
    "CLAUDE_CODE_USE_VERTEX",
    "CLAUDE_CODE_USE_FOUNDRY",
  ];
  if (forbidden.some((name) => source[name]))
    throw new Error("CREDENTIAL_OR_PROVIDER_OVERRIDE_PRESENT");
  const allowed = [
    "HOME",
    "PATH",
    "CODEX_HOME",
    "CLAUDE_CONFIG_DIR",
    "XDG_CONFIG_HOME",
    "XDG_DATA_HOME",
    "XDG_CACHE_HOME",
    "XDG_RUNTIME_DIR",
    "DBUS_SESSION_BUS_ADDRESS",
    "LANG",
    "LC_ALL",
    "TERM",
    "TMPDIR",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
    "NODE_EXTRA_CA_CERTS",
    "HTTPS_PROXY",
    "HTTP_PROXY",
    "ALL_PROXY",
    "NO_PROXY",
  ];
  return Object.fromEntries(
    allowed
      .filter((name) => source[name] !== undefined)
      .map((name) => [name, source[name]]),
  );
}

export function claudeSubscription(value) {
  return (
    value.loggedIn === true &&
    value.authMethod === "claude.ai" &&
    value.apiProvider === "firstParty" &&
    ["pro", "max", "team", "enterprise"].includes(value.subscriptionType)
  );
}

export function codexSubscription(value) {
  return (
    value.account?.type === "chatgpt" &&
    typeof value.account?.planType === "string"
  );
}

export function validReply(text, reportPath) {
  const lines = text.trim().split("\n");
  return (
    lines.length <= 40 &&
    /^(Done|Found|Result):/.test(lines[0] ?? "") &&
    text.includes(reportPath) &&
    !text.includes("```")
  );
}

function stop(child, signal = "SIGTERM") {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
}

export function launch(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd ?? root,
    env: options.env ?? trialEnvironment(),
    detached: true,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let bytes = 0;
  let stderrBytes = 0;
  let buffer = "";
  let failure;
  let forcedStop;
  const terminate = () => {
    stop(child);
    if (!forcedStop) {
      forcedStop = setTimeout(() => stop(child, "SIGKILL"), 3000);
      forcedStop.unref();
    }
  };
  const listeners = new Set();
  const exit = new Promise((resolveExit) => {
    child.on("error", () => {
      failure = "PROCESS_START_FAILED";
      resolveExit({ code: null, signal: null });
    });
    child.on("exit", (code, signal) => resolveExit({ code, signal }));
  });
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    bytes += Buffer.byteLength(chunk);
    if (bytes > maxBytes) {
      failure = "OUTPUT_LIMIT";
      terminate();
      return;
    }
    buffer += chunk;
    while (buffer.includes("\n")) {
      const end = buffer.indexOf("\n");
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      for (const listener of listeners) listener(line);
    }
  });
  child.stderr.on("data", (chunk) => {
    stderrBytes += chunk.length;
  });
  child.stdin.on("error", () => {});
  const timeout = setTimeout(() => {
    failure = "TIMEOUT";
    terminate();
  }, options.timeoutMs ?? 90_000);
  timeout.unref();
  exit.then(() => {
    clearTimeout(timeout);
    clearTimeout(forcedStop);
  });
  return {
    child,
    exit,
    listeners,
    stats: () => ({ bytes, stderrBytes, failure: failure ?? null }),
    async close() {
      stop(child);
      const kill = setTimeout(() => stop(child, "SIGKILL"), 3000);
      kill.unref();
      try {
        await exit;
      } finally {
        clearTimeout(kill);
      }
    },
  };
}

class Rpc {
  constructor(args, directory) {
    this.process = launch(
      process.env.COMMANDRY_CODEX_BINARY ?? "codex",
      ["app-server", "--listen", "stdio://", ...args],
      { cwd: directory },
    );
    this.sequence = 0;
    this.pending = new Map();
    this.listeners = new Set();
    this.process.listeners.add((line) => {
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        return;
      }
      if (Object.hasOwn(message, "id") && !message.method) {
        const pending = this.pending.get(message.id);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pending.delete(message.id);
          if (message.error) {
            const error = new Error(`RPC_${message.error.code}`);
            error.rpcMethod = pending.method;
            const descriptor =
              /^([a-zA-Z0-9_./]+) requires experimentalApi/.exec(
                message.error.message ?? "",
              );
            error.protocolRequirement = descriptor?.[1] ?? null;
            if (message.error.code === -32600)
              error.validationError = String(message.error.message).includes(
                "readOnly.access",
              )
                ? "LEGACY_READ_ACCESS_REJECTED"
                : "PROTOCOL_REQUEST_INVALID";
            pending.reject(error);
          } else pending.resolve(message.result);
        }
      } else if (message.id !== undefined && message.method) {
        this.send({
          id: message.id,
          error: {
            code: -32601,
            message: "Trial does not authorize interactive requests",
          },
        });
      } else for (const listener of this.listeners) listener(message);
    });
    this.process.exit.then(() => {
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timeout);
        pending.reject(new Error("PROCESS_EXITED"));
      }
      this.pending.clear();
    });
  }
  send(value) {
    this.process.child.stdin.write(`${JSON.stringify(value)}\n`);
  }
  request(method, params) {
    return new Promise((resolveRequest, reject) => {
      const id = ++this.sequence;
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("RPC_TIMEOUT"));
      }, 30_000);
      this.pending.set(id, {
        method,
        resolve: resolveRequest,
        reject,
        timeout,
      });
      this.send({ id, method, params });
    });
  }
  async initialize(experimentalApi = false) {
    await this.request("initialize", {
      clientInfo: {
        name: "commandry_runtime_comparison",
        title: "Commandry local runtime comparison",
        version: "0.1.0",
      },
      capabilities: { experimentalApi },
    });
    this.send({ method: "initialized" });
  }
  waitForTurn() {
    return new Promise((resolveTurn, reject) => {
      const timeout = setTimeout(() => {
        this.listeners.delete(listener);
        reject(new Error("TURN_TIMEOUT"));
      }, 85_000);
      const listener = (message) => {
        if (message.method === "turn/completed") {
          clearTimeout(timeout);
          this.listeners.delete(listener);
          resolveTurn(message.params.turn);
        }
      };
      this.listeners.add(listener);
      this.process.exit.then(() => {
        clearTimeout(timeout);
        this.listeners.delete(listener);
        reject(new Error("PROCESS_EXITED"));
      });
    });
  }
  close() {
    return this.process.close();
  }
}

async function jsonCommand(command, args) {
  const process = launch(command, args, { timeoutMs: 20_000 });
  let output = "";
  process.listeners.add((line) => {
    output += `${line}\n`;
  });
  process.child.stdin.end();
  const exit = await process.exit;
  await process.close();
  if (exit.code !== 0 || process.stats().failure)
    throw new Error("AUTH_METADATA_UNAVAILABLE");
  return JSON.parse(output);
}

async function nativeVersion(runtime) {
  const command =
    runtime === "codex"
      ? (process.env.COMMANDRY_CODEX_BINARY ?? "codex")
      : "claude";
  const running = launch(command, ["--version"], { timeoutMs: 10_000 });
  let text = "";
  running.listeners.add((line) => {
    text += `${line}\n`;
  });
  running.child.stdin.end();
  const status = await running.exit;
  await running.close();
  if (status.code !== 0 || !/\d+\.\d+\.\d+/.test(text))
    throw new Error("RUNTIME_VERSION_UNAVAILABLE");
  return { executable: command, version: text.trim() };
}

export async function inspectRuntime(runtime) {
  if (!["codex", "claude"].includes(runtime))
    throw new Error("UNSUPPORTED_RUNTIME");
  const version = await nativeVersion(runtime);
  if (runtime === "claude") {
    const auth = await jsonCommand("claude", ["auth", "status", "--json"]);
    return {
      runtime,
      ...version,
      subscriptionAuthenticated: claudeSubscription(auth),
      authMethod: auth.authMethod ?? null,
      planType: auth.subscriptionType ?? null,
    };
  }
  if (runtime !== "codex") throw new Error("UNSUPPORTED_RUNTIME");
  const rpc = new Rpc([], root);
  try {
    await rpc.initialize();
    const auth = await rpc.request("account/read", { refreshToken: false });
    const limits = await rpc.request("account/rateLimits/read", {});
    return {
      runtime,
      ...version,
      subscriptionAuthenticated: codexSubscription(auth),
      authMethod: auth.account?.type ?? null,
      planType: auth.account?.planType ?? null,
      ordinaryUsageAllowed: limits.ordinaryUsageAllowed ?? null,
    };
  } finally {
    await rpc.close();
  }
}

async function codexConfig(directory) {
  // Read names only; never serialize server credentials or command environments.
  // Python's TOML parser is used because Node does not ship a TOML parser.
  const configHome = process.env.CODEX_HOME ?? resolve(homedir(), ".codex");
  const helper = launch(
    "python3",
    [
      "-c",
      "import json,tomllib,sys;from pathlib import Path;p=Path(sys.argv[1]);d=tomllib.loads(p.read_text()) if p.exists() else {};print(json.dumps(list(d.get('mcp_servers',{}))))",
      resolve(configHome, "config.toml"),
    ],
    { timeoutMs: 10_000 },
  );
  let text = "";
  helper.listeners.add((line) => {
    text += line;
  });
  helper.child.stdin.end();
  const status = await helper.exit;
  if (status.code !== 0) throw new Error("CONFIG_NAMES_UNAVAILABLE");
  const names = JSON.parse(text);
  if (names.some((name) => !/^[A-Za-z0-9_-]+$/.test(name)))
    throw new Error("UNSUPPORTED_MCP_NAME");
  const args = names.flatMap((name) => [
    "-c",
    `mcp_servers.${name}.enabled=false`,
  ]);
  // The native browser bridge is also advertised outside user TOML. A complete
  // disabled entry avoids constructing an invalid transport-only override.
  args.push(
    "-c",
    `mcp_servers.cua_repl.command=${JSON.stringify(process.execPath)}`,
  );
  args.push("-c", "mcp_servers.cua_repl.enabled=false");
  for (const feature of [
    "shell_tool",
    "apps",
    "browser_use",
    "browser_use_external",
    "browser_use_full_cdp_access",
    "computer_use",
    "image_generation",
    "multi_agent",
    "in_app_browser",
  ])
    args.push("-c", `features.${feature}=false`);
  args.push("-c", 'web_search="disabled"');
  args.push(
    "-c",
    `mcp_servers.runtime_trial.command=${JSON.stringify(process.execPath)}`,
  );
  args.push(
    "-c",
    `mcp_servers.runtime_trial.args=${JSON.stringify([serverPath, directory])}`,
  );
  args.push("-c", "mcp_servers.runtime_trial.required=true");
  args.push(
    "-c",
    `permissions.commandry-trial.filesystem={\":root\"=\"deny\",\":minimal\"=\"read\",${JSON.stringify(directory)}=\"read\"}`,
  );
  args.push("-c", "permissions.commandry-trial.network.enabled=false");
  return args;
}

async function codexTrial(directory, prompt) {
  const rpc = new Rpc(await codexConfig(directory), directory);
  const events = [];
  let finalText = "";
  let forbiddenTool = false;
  rpc.listeners.add((message) => {
    const item = message.params?.item;
    if (message.method === "item/completed" && item?.type === "agentMessage")
      finalText = `${item.text}\n`;
    if (message.method === "item/started" && item) {
      events.push({
        type: item.type,
        tool: item.tool ?? null,
        server: item.server ?? null,
      });
      if (
        [
          "commandExecution",
          "fileChange",
          "webSearch",
          "dynamicToolCall",
        ].includes(item.type) ||
        (item.type === "mcpToolCall" &&
          (item.server !== "runtime_trial" ||
            !["read_context", "submit_report"].includes(item.tool)))
      )
        forbiddenTool = true;
    }
  });
  try {
    await rpc.initialize(true);
    const auth = await rpc.request("account/read", { refreshToken: false });
    if (!codexSubscription(auth)) throw new Error("SUBSCRIPTION_AUTH_REQUIRED");
    const thread = await rpc.request("thread/start", {
      cwd: directory,
      model: "gpt-6.1-sol",
      modelProvider: "openai",
      approvalPolicy: "never",
      permissions: "commandry-trial",
      ephemeral: true,
    });
    if (
      thread.approvalPolicy !== "never" ||
      thread.activePermissionProfile?.id !== "commandry-trial" ||
      thread.cwd !== directory ||
      thread.modelProvider !== "openai"
    )
      throw new Error("RUNTIME_POLICY_MISMATCH");
    let cursor;
    const mcpInventory = [];
    do {
      const page = await rpc.request("mcpServerStatus/list", {
        threadId: thread.thread.id,
        detail: "toolsAndAuthOnly",
        ...(cursor ? { cursor } : {}),
      });
      mcpInventory.push(
        ...page.data.map((server) => ({
          name: server.name,
          tools: Object.keys(server.tools ?? {}),
        })),
      );
      cursor = page.nextCursor;
    } while (cursor);
    await writeFile(
      resolve(directory, "mcp-inventory.json"),
      JSON.stringify(mcpInventory, null, 2),
      { mode: 0o600 },
    );
    const trialTools =
      mcpInventory.find((server) => server.name === "runtime_trial")?.tools ??
      [];
    if (
      trialTools.length !== 2 ||
      !trialTools.includes("read_context") ||
      !trialTools.includes("submit_report") ||
      mcpInventory.some(
        (server) => server.name !== "runtime_trial" && server.tools.length,
      )
    )
      throw new Error("MCP_TOOL_INVENTORY_MISMATCH");
    const completion = rpc.waitForTurn();
    // Attach immediately: if start fails, process close must not create an
    // unhandled rejection from the completion waiter.
    completion.catch(() => {});
    await rpc.request("turn/start", {
      threadId: thread.thread.id,
      input: [{ type: "text", text: prompt }],
      effort: "ultra",
      permissions: "commandry-trial",
    });
    const turn = await completion;
    const outcome = {
      status: turn.status,
      model: thread.model,
      modelProvider: thread.modelProvider,
      approvalPolicy: thread.approvalPolicy,
      sandbox: thread.sandbox.type,
      permissionProfile: thread.activePermissionProfile.id,
      requestedEffort: "ultra",
      providerModelRevision: null,
      usage: null,
      forbiddenTool,
      events,
      finalText,
    };
    if (turn.status === "completed" && !forbiddenTool) {
      const canceled = rpc.waitForTurn();
      canceled.catch(() => {});
      const started = await rpc.request("turn/start", {
        threadId: thread.thread.id,
        input: [
          {
            type: "text",
            text: "Read context page zero again. This is a cancellation test; do not edit the saved report.",
          },
        ],
      });
      await rpc.request("turn/interrupt", {
        threadId: thread.thread.id,
        turnId: started.turn.id,
      });
      outcome.cancellation = {
        status: (await canceled).status,
        evidence: "native_turn_terminal_event",
      };
    }
    return outcome;
  } finally {
    await rpc.close();
  }
}

async function claudeTrial(directory, prompt) {
  const configuration = resolve(directory, "mcp.json");
  await writeFile(
    configuration,
    JSON.stringify({
      mcpServers: {
        runtime_trial: {
          command: process.execPath,
          args: [serverPath, directory],
        },
      },
    }),
    { mode: 0o600 },
  );
  const running = launch(
    "claude",
    [
      "-p",
      "--output-format",
      "stream-json",
      "--verbose",
      "--tools",
      "",
      "--strict-mcp-config",
      "--mcp-config",
      configuration,
      "--permission-mode",
      "dontAsk",
      "--permission-prompts",
      "none",
      "--allowedTools",
      "mcp__runtime_trial__read_context",
      "mcp__runtime_trial__submit_report",
      "--no-chrome",
    ],
    { cwd: directory },
  );
  let init;
  let result;
  let finalText = "";
  let forbiddenTool = false;
  const events = [];
  running.listeners.add((line) => {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (message.type === "system" && message.subtype === "init") {
      init = {
        model: message.model,
        permissionMode: message.permissionMode,
        tools: message.tools,
        mcpServers: message.mcp_servers,
      };
      if (
        message.permissionMode !== "dontAsk" ||
        message.tools?.some(
          (tool) =>
            ![
              "mcp__runtime_trial__read_context",
              "mcp__runtime_trial__submit_report",
              "EndConversation",
            ].includes(tool),
        )
      ) {
        forbiddenTool = true;
        stop(running.child);
      }
    }
    if (message.type === "assistant") {
      for (const block of message.message?.content ?? []) {
        if (block.type === "text") finalText += `${block.text}\n`;
        if (block.type === "tool_use") {
          events.push({ type: "tool_use", tool: block.name });
          if (
            ![
              "mcp__runtime_trial__read_context",
              "mcp__runtime_trial__submit_report",
              "EndConversation",
            ].includes(block.name)
          ) {
            forbiddenTool = true;
            stop(running.child);
          }
        }
      }
    }
    if (message.type === "result") result = message;
  });
  running.child.stdin.end(prompt);
  const exit = await running.exit;
  await running.close();
  return {
    status:
      exit.code === 0 &&
      result?.subtype === "success" &&
      result?.is_error === false &&
      init &&
      !forbiddenTool
        ? "completed"
        : "failed",
    model: init?.model ?? null,
    approvalPolicy: init?.permissionMode ?? null,
    forbiddenTool,
    events,
    finalText: result?.result ?? finalText,
    usage: result?.usage ?? null,
    estimatedApiCostUsd: result?.total_cost_usd ?? null,
    actualSubscriptionCharge: "unknown",
    process: { ...exit, ...running.stats() },
    cancellation: {
      status: "not_run",
      reason:
        "Requires separate native control-protocol trial; killing a process alone is not proof of provider cancellation.",
    },
  };
}

async function main() {
  const args = process.argv.slice(2);
  const runtime = args.find((arg) => arg.startsWith("--runtime="))?.slice(10);
  const live = args.includes("--live");
  if (
    !["codex", "claude"].includes(runtime) ||
    args.some(
      (arg) =>
        ![
          "--live",
          "--subscription-overage-disabled",
          `--runtime=${runtime}`,
        ].includes(arg),
    )
  )
    throw new Error(
      "Use --runtime=codex|claude [--live --subscription-overage-disabled]",
    );
  trialEnvironment();
  const readiness = await inspectRuntime(runtime);
  if (!live) {
    console.log(JSON.stringify(readiness, null, 2));
    return;
  }
  if (!args.includes("--subscription-overage-disabled"))
    throw new Error("OWNER_NO_PAID_OVERAGE_ATTESTATION_REQUIRED");
  if (
    !readiness.subscriptionAuthenticated ||
    readiness.ordinaryUsageAllowed === false
  )
    throw new Error("SUBSCRIPTION_NOT_READY");
  const base = resolve(root, ".agent/scratch/runtime-comparison");
  await mkdir(base, { recursive: true, mode: 0o700 });
  const directory = await mkdtemp(resolve(base, `${runtime}-`));
  const reportPath = resolve(directory, "report.json");
  const contract = await readFile(contractPath, "utf8");
  const prompt = `Goal: Determine the current runtime, whether automatic dispatch exists and whether the output is verified, using every synthetic context page from runtime_trial.read_context.\nFiles: Read only the context returned by runtime_trial.read_context. Write only ${reportPath} using runtime_trial.submit_report; that tool writes the full report for you. Do not use shell, browser, arbitrary file tools, subagents or other services.\nOutput schema: submit_report accepts runtime (string), automaticDispatch (boolean), verification (string), and sources (all sourceId values). Final reply: Done: one-line finding, then the exact saved report path, then any open question, at most 40 lines.\nAcceptance: All pages read, exact original evidence preserved, synthetic and manual results never described as automatic or verified; report saved through submit_report. This is a synthetic runtime integration trial and grants no product permission.\n\n${contract}`;
  await writeFile(resolve(directory, "dispatch-spec.txt"), prompt, {
    mode: 0o600,
  });
  const startedAt = new Date().toISOString();
  const started = performance.now();
  let outcome;
  try {
    outcome = await (runtime === "codex"
      ? codexTrial(directory, prompt)
      : claudeTrial(directory, prompt));
  } catch (error) {
    outcome = {
      status: "failed",
      rpcMethod: error.rpcMethod ?? null,
      protocolRequirement: error.protocolRequirement ?? null,
      validationError: error.validationError ?? null,
      failure: /^[A-Z0-9_-]+$/.test(error.message)
        ? error.message
        : "ADAPTER_FAILURE",
    };
  }
  const finalText = outcome.finalText ?? "";
  delete outcome.finalText;
  await writeFile(resolve(directory, "reply.txt"), finalText, { mode: 0o600 });
  const replyContractPassed = validReply(finalText, reportPath);
  let evaluation = {
    passed: false,
    checks: { replyContract: replyContractPassed, reportPresent: false },
  };
  try {
    if (replyContractPassed) {
      evaluation = scoreReport(JSON.parse(await readFile(reportPath, "utf8")));
    }
  } catch {
    /* Missing or invalid reports fail honestly. */
  }
  const summary = {
    schemaVersion: 1,
    runtime,
    trial: "synthetic-mcp-context-and-report-v2",
    startedAt,
    durationMs: Math.round(performance.now() - started),
    fixtureDigest: fixtureDigest(),
    dispatchDigest: createHash("sha256").update(prompt).digest("hex"),
    billing: "subscription_auth_with_owner_attested_no_paid_overage",
    readiness,
    replyContractPassed,
    outcome,
    evaluation,
    reportPath,
    limits: [
      "One trial is not a model benchmark or production adoption decision.",
      "No coding, restart/resume, hostile input, workload isolation or production dispatch was tested.",
      "Native session configuration and fixture MCP scope do not establish process isolation.",
    ],
  };
  await writeFile(
    resolve(directory, "summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify(
      {
        runtime,
        status: outcome.status,
        evaluationPassed: evaluation.passed,
        model: outcome.model ?? null,
        durationMs: summary.durationMs,
        summaryPath: resolve(directory, "summary.json"),
        replyPath: resolve(directory, "reply.txt"),
      },
      null,
      2,
    ),
  );
  if (outcome.status !== "completed" || !evaluation.passed)
    process.exitCode = 1;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main().catch((error) => {
    console.error(
      /^[A-Z0-9_ -]+$/.test(error.message)
        ? error.message
        : "Runtime comparison failed; inspect the private task evidence.",
    );
    process.exitCode = 1;
  });
}
