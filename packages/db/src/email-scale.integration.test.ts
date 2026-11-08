/** 100k real indexed metadata rows while an independent built web process serves ordinary reads. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { sql } from "drizzle-orm";
import { createDatabase } from "./client";
import { project } from "./schema";
import { MAIL_DOMAINS } from "@commandry/contracts";

const url = process.env.COMMANDRY_TEST_DATABASE_URL,
  password = process.env.COMMANDRY_TEST_RUNTIME_PASSWORD;
if (!url || !password || new URL(url).hostname !== "127.0.0.1")
  throw new Error("Use the disposable PostgreSQL harness");
async function freePort() {
  const s = createServer();
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  const a = s.address();
  assert.ok(a && typeof a !== "string");
  await new Promise<void>((r) => s.close(() => r()));
  return a.port;
}
const percentile = (xs: number[], p: number) =>
  [...xs].sort((a, b) => a - b)[
    Math.min(xs.length - 1, Math.floor(xs.length * p))
  ] ?? 0;
test(
  "100000-message reference index preserves web capacity with bounded separate-worker memory",
  { timeout: 600000 },
  async () => {
    const db = createDatabase({ connectionString: url, max: 2 }),
      root = process.cwd(),
      accountId = randomUUID(),
      projectId = randomUUID();
    const runtimeUrl = new URL(url);
    runtimeUrl.username = "commandry_app_integration";
    runtimeUrl.password = password;
    const temp = await mkdtemp(join(tmpdir(), "commandry-mail-scale-")),
      keyFile = join(temp, "provider-key");
    await writeFile(keyFile, "re_" + "s".repeat(30), { mode: 0o600 });
    await db.db
      .insert(project)
      .values({ id: projectId, name: "Email scale qualification" });
    await db.db.execute(
      sql`insert into mail_account(id,project_id,name,domains) values(${accountId}::uuid,${projectId}::uuid,'Scale fixture',${JSON.stringify(MAIL_DOMAINS)}::jsonb)`,
    );
    const port = await freePort(),
      origin = `http://127.0.0.1:${port}`;
    const standalone = resolve(root, "apps/web/.next/standalone/apps/web");
    assert.ok(
      existsSync(join(standalone, "server.js")),
      "Run pnpm build before scale qualification",
    );
    await mkdir(join(standalone, ".next"), { recursive: true });
    if (!existsSync(join(standalone, ".next/static")))
      await symlink(
        resolve(root, "apps/web/.next/static"),
        join(standalone, ".next/static"),
        "dir",
      );
    if (!existsSync(join(standalone, "public")))
      await symlink(
        resolve(root, "apps/web/public"),
        join(standalone, "public"),
        "dir",
      );
    const web = spawn(
      process.execPath,
      [
        "--import",
        resolve(root, "scripts/email-web-metrics.mjs"),
        join(standalone, "server.js"),
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          APP_ENV: "local",
          APP_ORIGIN: origin,
          DATABASE_URL: runtimeUrl.toString(),
          BETTER_AUTH_SECRET: "scale-test-secret-".repeat(4),
          APP_ENCRYPTION_KEY: "scale-encryption-".repeat(4),
          RELEASE_SHA: "email-scale-candidate",
          LOCAL_AUTH_MODE: "off",
          PORT: String(port),
          HOSTNAME: "127.0.0.1",
          DB_POOL_MAX: "2",
          MAIL_POLLING: "false",
        },
        stdio: ["ignore", "pipe", "pipe", "ipc"],
      },
    );
    let tail = "";
    web.stderr!.on("data", (v) => (tail = (tail + v).slice(-2000)));
    web.stdout!.on("data", () => {});
    const webSamples: {
      rss: number;
      loopP95Ms: number;
      cpu: { user: number; system: number };
    }[] = [];
    web.on("message", (raw) => {
      const m = raw as {
        kind: string;
        rss: number;
        loopP95Ms: number;
        cpu: { user: number; system: number };
      };
      if (m.kind === "email-test-web-metrics") webSamples.push(m);
    });
    let worker: ReturnType<typeof spawn> | undefined;
    const timings: number[] = [],
      baseline: number[] = [];
    async function ordinaryRead() {
      const start = performance.now();
      const r = await fetch(origin + "/api/v1/projects?limit=20");
      assert.equal(r.status, 200);
      const page = (await r.json()) as { items: { id: string }[] };
      assert.ok(page.items.some((p) => p.id === projectId));
      return performance.now() - start;
    }
    try {
      let ready = false;
      for (let i = 0; i < 100; i++) {
        if (web.exitCode !== null) throw new Error(tail);
        try {
          if ((await fetch(origin + "/health/ready")).ok) {
            ready = true;
            break;
          }
        } catch {}
        await delay(100);
      }
      assert.ok(ready, tail);
      for (let i = 0; i < 20; i++) baseline.push(await ordinaryRead());
      worker = spawn(
        process.execPath,
        ["--import", "tsx", "scripts/email-scale-worker.ts"],
        { cwd: root, stdio: ["pipe", "pipe", "pipe"] },
      );
      worker.stdin!.end(
        JSON.stringify({
          url: runtimeUrl.toString(),
          accountId,
          keyFile,
          count: 100000,
        }),
      );
      let output = "",
        workerError = "",
        done = false;
      worker.stdout!.on("data", (v) => (output += v));
      worker.stderr!.on(
        "data",
        (v) => (workerError = (workerError + v).slice(-3000)),
      );
      const exited = new Promise<number | null>((r) =>
        worker!.once("exit", (code) => {
          done = true;
          r(code);
        }),
      );
      while (!done) {
        timings.push(await ordinaryRead());
        await delay(25);
      }
      assert.equal(await exited, 0, workerError);
      const resultLine = output
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line))
        .find((v) => v.result)?.result;
      assert.ok(resultLine);
      const rows = await db.db.execute(
        sql`select count(*)::int n from mail_message where account_id=${accountId}::uuid`,
      );
      assert.equal(rows.rows[0]!.n, 100000);
      const sizes = await db.db.execute(
        sql`select sum(pg_total_relation_size(c.oid))::bigint bytes from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname in ('mail_message','mail_membership')`,
      );
      assert.equal(resultLine.bodyReads, 0);
      assert.equal(resultLine.attachmentBytes, 0);
      assert.ok(
        resultLine.peakRss < 512 * 1024 * 1024,
        JSON.stringify(resultLine),
      );
      assert.ok(
        percentile(timings, 0.95) < 1000,
        "Ordinary web p95 must stay below one second",
      );
      assert.ok(webSamples.length > 0);
      assert.ok(Math.max(...webSamples.map((m) => m.rss)) < 512 * 1024 * 1024);
      const evidence = {
        qualification:
          "synthetic 100000 metadata references; 20% 2MiB attachment descriptors, zero body or attachment bytes",
        worker: resultLine,
        databaseBytes: Number(sizes.rows[0]!.bytes),
        web: {
          baselineReads: baseline.length,
          loadedReads: timings.length,
          baselineP50Ms: percentile(baseline, 0.5),
          baselineP95Ms: percentile(baseline, 0.95),
          loadedP50Ms: percentile(timings, 0.5),
          loadedP95Ms: percentile(timings, 0.95),
          peakRss: Math.max(...webSamples.map((m) => m.rss)),
          loopP95MaxMs: Math.max(...webSamples.map((m) => m.loopP95Ms)),
          cpuMs:
            (webSamples.at(-1)!.cpu.user + webSamples.at(-1)!.cpu.system) /
            1000,
        },
        limits:
          "One separate worker, two concurrently invoked page jobs serialized per account by advisory lock. Fixture rate limiter disabled for a sustained CPU/index stress bound; not measured Resend throughput or VPS capacity.",
      };
      const evidenceDirectory = resolve(
        root,
        process.env.COMMANDRY_EMAIL_ARTIFACTS ?? ".agent",
      );
      await mkdir(evidenceDirectory, { recursive: true });
      await writeFile(
        resolve(evidenceDirectory, "email-scale-result.json"),
        JSON.stringify(evidence, null, 2),
      );
      console.log(JSON.stringify(evidence));
    } finally {
      worker?.kill("SIGTERM");
      if (web.exitCode === null) {
        web.kill("SIGTERM");
        await Promise.race([
          new Promise<void>((r) => web.once("exit", () => r())),
          delay(5000).then(() => {
            web.kill("SIGKILL");
          }),
        ]);
      }
      await db.close();
      await rm(temp, { recursive: true, force: true });
    }
  },
);
