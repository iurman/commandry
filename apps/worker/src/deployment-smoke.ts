import { randomUUID } from "node:crypto";
import { readSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { loadRuntimeConfig } from "@commandry/config";
import {
  deploymentSmokeJobV1Schema,
  deploymentSmokeResultV1Schema,
} from "@commandry/contracts";
import { createAuth, createDatabase, schema } from "@commandry/db";
import {
  createPgBossProducer,
  DEPLOYMENT_SMOKE_QUEUE,
} from "@commandry/platform";

let phase = "configuration";

function readOwnerInput(): string {
  const buffer = Buffer.alloc(513);
  let count = 0;
  while (count < buffer.length) {
    const received = readSync(0, buffer, count, buffer.length - count, null);
    if (received === 0) return buffer.subarray(0, count).toString("utf8");
    count += received;
  }
  throw new Error("OWNER_INPUT_TOO_LARGE");
}

async function main() {
  const config = loadRuntimeConfig();
  if (config.humanAuthMode !== "password" || !config.initialAdminEmail) {
    throw new Error("OWNER_MODE");
  }
  if (config.appEnv !== "production" && config.appEnv !== "test") {
    throw new Error("ENVIRONMENT");
  }
  const expected = process.argv.slice(2);
  if (
    (config.appEnv === "production" &&
      (expected.length !== 2 ||
        expected[0] !== config.releaseImageDigest ||
        expected[1] !== config.releaseSha)) ||
    (config.appEnv === "test" && expected.length !== 0)
  ) {
    throw new Error("RELEASE_IDENTITY");
  }
  if (process.stdin.isTTY) throw new Error("OWNER_INPUT");
  const input = readOwnerInput();
  const lines = input.replace(/\r?\n$/, "").split(/\r?\n/);
  if (lines.length !== 2) throw new Error("OWNER_INPUT");
  const [confirmedEmail, password] = lines;
  const email = config.initialAdminEmail.toLowerCase();
  if (
    confirmedEmail?.trim().toLowerCase() !== email ||
    !password ||
    password.length < 12 ||
    password.length > 128
  ) {
    throw new Error("OWNER_INPUT");
  }

  const database = createDatabase({
    connectionString: config.databaseUrl,
    max: 1,
  });
  let transport: Awaited<ReturnType<typeof createPgBossProducer>> | undefined;
  try {
    phase = "owner_state";
    const users = await database.db
      .select({ email: schema.user.email })
      .from(schema.user)
      .limit(2);
    if (
      users.length > 1 ||
      (users[0] && users[0].email.toLowerCase() !== email)
    ) {
      throw new Error("OWNER_STATE");
    }
    let bootstrapCreated = false;
    if (users.length === 0) {
      phase = "owner_bootstrap";
      const auth = createAuth({
        db: database.db,
        secret: config.betterAuthSecret,
        baseURL: config.appOrigin,
        adminEmail: email,
        passwordLoginEnabled: true,
        allowBootstrap: true,
        trustedOrigins: [config.appOrigin],
      });
      const created = await auth.api.signUpEmail({
        body: { name: "Commandry owner", email, password },
        headers: new Headers({ origin: config.appOrigin }),
      });
      if (created.user?.email.toLowerCase() !== email) {
        throw new Error("OWNER_BOOTSTRAP");
      }
      await database.db.insert(schema.auditEvent).values({
        id: randomUUID(),
        actor:
          config.appEnv === "production"
            ? "vps-operator-cli"
            : "local-operator-cli",
        operation: "auth.owner_bootstrapped",
        details: { ownerEmail: email, releaseSha: config.releaseSha },
      });
      bootstrapCreated = true;
    }

    const web =
      config.appEnv === "production" ? "http://web:3000" : config.appOrigin;
    const headers = {
      "content-type": "application/json",
      origin: config.appOrigin,
      ...(config.appEnv === "production"
        ? {
            "x-forwarded-host": new URL(config.appOrigin).host,
            "x-forwarded-proto": "https",
          }
        : {}),
    };
    phase = "owner_login";
    const login = await fetch(`${web}/api/auth/sign-in/email`, {
      method: "POST",
      headers,
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!login.ok) throw new Error("OWNER_LOGIN");
    const setCookie = login.headers.get("set-cookie") ?? "";
    const cookie = setCookie.split(";", 1)[0] ?? "";
    if (
      !cookie.includes("session_token=") ||
      (config.appEnv === "production" && !/;\s*Secure(?:;|$)/i.test(setCookie))
    ) {
      throw new Error("SESSION_COOKIE");
    }

    phase = "authenticated_read";
    const read = await fetch(`${web}/api/v1/projects?limit=1`, {
      headers: { cookie },
      signal: AbortSignal.timeout(8_000),
    });
    if (!read.ok || !Array.isArray((await read.json()).items)) {
      throw new Error("AUTHENTICATED_READ");
    }
    const version = await fetch(`${web}/version`, {
      signal: AbortSignal.timeout(8_000),
    });
    const identity = await version.json();
    if (
      !version.ok ||
      identity.sha !== config.releaseSha ||
      identity.imageDigest !== (config.releaseImageDigest ?? null) ||
      identity.environment !== config.appEnv
    ) {
      throw new Error("VERSION_IDENTITY");
    }

    phase = "probe_sign_out";
    const signOut = await fetch(`${web}/api/auth/sign-out`, {
      method: "POST",
      headers: { ...headers, cookie },
      body: "{}",
      signal: AbortSignal.timeout(8_000),
    });
    if (!signOut.ok) throw new Error("PROBE_SIGN_OUT");
    const revoked = await fetch(`${web}/api/v1/projects?limit=1`, {
      headers: { cookie },
      signal: AbortSignal.timeout(8_000),
    });
    if (revoked.status !== 401) throw new Error("PROBE_SESSION_REMAINS");

    phase = "worker_probe";
    transport = await createPgBossProducer({
      connectionString: config.databaseUrl,
      max: 1,
    });
    const probeId = randomUUID();
    const payload = deploymentSmokeJobV1Schema.parse({
      version: 1,
      probeId,
      releaseSha: config.releaseSha,
    });
    const jobId = await transport.boss.send(DEPLOYMENT_SMOKE_QUEUE, payload);
    if (!jobId) throw new Error("WORKER_ENQUEUE");
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const job = await transport.boss.getJobById(
        DEPLOYMENT_SMOKE_QUEUE,
        jobId,
      );
      if (job?.state === "failed" || job?.state === "cancelled") {
        throw new Error("WORKER_RESULT");
      }
      if (job?.state === "completed") {
        const result = deploymentSmokeResultV1Schema.parse(job.output);
        if (
          result.probeId !== probeId ||
          result.releaseSha !== config.releaseSha
        ) {
          throw new Error("WORKER_RESULT");
        }
        console.log(
          JSON.stringify({
            kind: "commandry_deployment_smoke",
            outcome: "passed",
            environment: config.appEnv,
            releaseSha: config.releaseSha,
            imageDigest: config.releaseImageDigest ?? null,
            completedAt: new Date().toISOString(),
            ownerEmail: email,
            bootstrapCreated,
            authenticatedRead: true,
            probeSessionRevoked: true,
            workerJobId: jobId,
            workerId: result.workerId,
          }),
        );
        return;
      }
      await delay(250);
    }
    throw new Error("WORKER_TIMEOUT");
  } finally {
    await transport?.close();
    await database.close();
  }
}

main().catch(() => {
  console.error(`Deployment smoke failed at ${phase}.`);
  process.exitCode = 1;
});
