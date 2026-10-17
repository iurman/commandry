import { mkdir, rename, writeFile } from "node:fs/promises";
import { Session } from "node:inspector";
import { dirname } from "node:path";
import type { CDPSession, Page, test } from "@playwright/test";

export type DiagnosticProfileContext = {
  outputPath(name: string): string;
  testId: string;
  title: string;
  project: string;
  worker: number;
  current(): { timeout: number; status?: string; expectedStatus?: string };
};

export type DiagnosticProfile = { stop(): Promise<void> };

const checkpointIntervalMs = 20000;
const samplingIntervalUs = 5000;
const transportBoundMs = 2000;
const persistenceBoundMs = 2000;
const setupBoundMs = 10000;
const checkpointDrainBoundMs = 2000;
const finalCaptureBoundMs = 3000;
const prefix = "observatory-diagnostic-profile";

function clock() {
  const monotonicBeforeMs = performance.now();
  const unixMs = Date.now();
  const utc = new Date(unixMs).toISOString();
  const monotonicAfterMs = performance.now();
  return { utc, unixMs, monotonicBeforeMs, monotonicAfterMs };
}
type Clock = ReturnType<typeof clock>;
type Channel = {
  name: "runner" | "browser";
  usable: boolean;
  running: boolean;
  command(method: string, params: object): Promise<unknown>;
};

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function bounded<T>(
  operation: Promise<T>,
  label: string,
  boundMs = transportBoundMs,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(`${label}: diagnostic wait exceeded ${boundMs}ms`),
            ),
          boundMs,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** Diagnostic sampling only; disabled mode does not inspect page or context. */
export async function startDiagnosticProfile(
  page: Page,
  context: DiagnosticProfileContext,
): Promise<DiagnosticProfile> {
  if (process.env.COMMANDRY_E2E_DIAGNOSTIC_PROFILE !== "1") {
    const stopped = Promise.resolve();
    return { stop: () => stopped };
  }

  const index = {
    schemaVersion: 2,
    purpose:
      "Diagnostic native CPU samples; not acceptance or GPU shader timing",
    identity: {
      testId: context.testId,
      title: context.title,
      project: context.project,
      worker: context.worker,
      runnerPid: process.pid,
    },
    versions: { node: process.version, browser: null as string | null },
    samplingIntervalUs,
    checkpointIntervalMs,
    diagnosticTransportBoundMs: transportBoundMs,
    lifecycleBoundsMs: {
      persistence: persistenceBoundMs,
      setup: setupBoundMs,
      checkpointDrain: checkpointDrainBoundMs,
      finalCapture: finalCaptureBoundMs,
      finalizationMaximum:
        checkpointDrainBoundMs +
        finalCaptureBoundMs +
        transportBoundMs +
        2 * persistenceBoundMs,
    },
    started: clock(),
    finished: null as Clock | null,
    status: "running",
    finalization: {
      state: "not-started",
      started: null as Clock | null,
      finished: null as Clock | null,
      captureAbandoned: false,
    },
    publication: {
      state: "snapshot-requires-finalization-receipt",
      requiresFinalizationReceipt: true,
      finalizationReceiptFile: `${prefix}-finalization.json`,
      finalIndexAttempt: null as number | null,
      finalReceiptAttempt: null as number | null,
      finalIndexAcknowledged: false,
      finalReceiptAcknowledged: false,
      unsavedFinalIndex: false,
    },
    states: [] as {
      clock: Clock;
      value: ReturnType<DiagnosticProfileContext["current"]> | null;
    }[],
    commands: [] as {
      channel: string;
      method: string;
      params: object;
      before: Clock;
      after: Clock;
      durationMs: number;
      outcome: string;
      error?: string;
    }[],
    errors: [] as { stage: string; clock: Clock; message: string }[],
    metrics: [] as { chunk: number; clockDomain: string; raw: unknown }[],
    chunks: [] as {
      number: number;
      reason: string;
      before: Clock;
      after?: Clock;
      profiles: {
        channel: string;
        file?: string;
        status: string;
        nativeClock?: {
          unit: string;
          startTime: number;
          endTime: number;
          timeDeltas: string;
        };
      }[];
    }[],
    saves: [] as {
      id: number;
      file: string;
      temporary?: string;
      before: Clock;
      after?: Clock;
      durationMs?: number;
      bytes: number;
      outcome: string;
      stage: string;
      revoked: boolean;
      physicalSettled: boolean;
      physicalOutcome?: string;
      physicalFinished?: Clock;
      lateSettlement?: boolean;
    }[],
    cleanup: {
      timerCleared: false,
      runnerDisconnected: false,
      browserDetachRequested: false,
      browserDetached: false,
      browserAttachmentAbandoned: false,
      browserAttachmentPending: false,
    },
    limitations: [
      "Native profile and Performance metric clocks are retained separately from runner calibration brackets.",
      "Profiles stop during checkpoint persistence; command/save brackets expose unsampled gaps and overhead.",
      "The current index write cannot contain its own completed save receipt; prior completed index writes are retained.",
      "Every index snapshot requires the separate finalization receipt; a stopped snapshot is not proof of complete publication.",
      "Timed-out filesystem calls are not assumed canceled. Late/uncertain writes can leave temporary or stale snapshot files; final output may be unavailable.",
      "GPU information is not requested; CPU samples and native Performance metrics do not measure GPU shader time.",
    ],
  };
  const node = new Session();
  let nodeConnected = false;
  let browserSession: CDPSession | undefined;
  let browserClose: Promise<void> | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let stopping = false;
  let stopPromise: Promise<void> | undefined;
  let checkpointPending = false;
  let checkpoints = Promise.resolve();
  let writes = Promise.resolve();
  let captureClosed = false;
  let publicationUnsafe = false;
  let writeEpoch = 0;
  let writeSequence = 0;
  const pendingWrites = new Map<
    number,
    {
      attempt: (typeof index.saves)[number];
      abort: AbortController;
      epoch: number;
    }
  >();

  function error(stage: string, failure: unknown) {
    index.errors.push({ stage, clock: clock(), message: message(failure) });
    console.error("Observatory diagnostic profile", stage, message(failure));
  }
  function state() {
    try {
      const current = context.current();
      index.states.push({
        clock: clock(),
        value: {
          timeout: current.timeout,
          status: current.status,
          expectedStatus: current.expectedStatus,
        },
      });
    } catch (failure) {
      index.states.push({ clock: clock(), value: null });
      error("current-test-state", failure);
    }
  }
  function revokeWrites(reason: string) {
    for (const { attempt, abort } of pendingWrites.values()) {
      attempt.revoked = true;
      abort.abort();
      publicationUnsafe = true;
    }
    if (publicationUnsafe) {
      index.publication.state = "uncertain-output";
      error("publication", reason);
    }
  }
  function save(
    file: string,
    value: unknown,
    mode: "capture" | "final-index" | "final-receipt" = "capture",
  ): Promise<boolean> {
    const attempt: (typeof index.saves)[number] = {
      id: ++writeSequence,
      file,
      before: clock(),
      bytes: 0,
      outcome: "pending",
      stage: "queued",
      revoked: false,
      physicalSettled: false,
    };
    index.saves.push(attempt);
    if (mode === "final-index")
      index.publication.finalIndexAttempt = attempt.id;
    if (mode === "final-receipt")
      index.publication.finalReceiptAttempt = attempt.id;
    if (publicationUnsafe || (mode === "capture" && captureClosed)) {
      attempt.outcome = publicationUnsafe
        ? "skipped-uncertain-output"
        : "superseded-capture";
      attempt.stage = "not-started";
      attempt.physicalSettled = true;
      attempt.after = clock();
      return Promise.resolve(false);
    }
    const entry = { attempt, abort: new AbortController(), epoch: writeEpoch };
    pendingWrites.set(attempt.id, entry);
    function revoked() {
      const invalid =
        attempt.revoked ||
        entry.epoch !== writeEpoch ||
        (mode === "capture" && captureClosed);
      if (invalid) attempt.revoked = true;
      return invalid;
    }
    const operation = writes.then(async () => {
      try {
        if (revoked()) return false;
        const path = context.outputPath(file);
        attempt.temporary = context.outputPath(
          `${file}.write-${attempt.id}.tmp`,
        );
        attempt.stage = "mkdir";
        await mkdir(dirname(path), { recursive: true });
        if (revoked()) return false;
        attempt.stage = "serialize";
        const body = JSON.stringify(value, null, 2) + "\n";
        attempt.bytes = Buffer.byteLength(body);
        attempt.stage = "write";
        await writeFile(attempt.temporary, body, {
          signal: entry.abort.signal,
        });
        if (revoked()) return false;
        // Rename cannot be canceled once dispatched. A late snapshot therefore
        // always requires a distinct finalization receipt and never says complete.
        attempt.stage = "rename";
        await rename(attempt.temporary, path);
        attempt.physicalOutcome = revoked()
          ? "late-published-unconfirmed"
          : "published";
        return !revoked();
      } catch (failure) {
        attempt.physicalOutcome = "failed-or-aborted";
        if (!attempt.revoked) {
          attempt.outcome = "failed";
          publicationUnsafe = true;
          index.publication.state = "uncertain-output";
          error(`save:${file}`, failure);
        } else error(`late-save:${file}`, failure);
        return false;
      } finally {
        attempt.physicalSettled = true;
        attempt.physicalFinished = clock();
        attempt.lateSettlement = attempt.revoked;
        if (!attempt.physicalOutcome)
          attempt.physicalOutcome = "revoked-before-publication";
        pendingWrites.delete(attempt.id);
        if (attempt.revoked)
          console.error(
            "Observatory diagnostic late write settlement",
            JSON.stringify(attempt),
          );
      }
    });
    // Physical filesystem work remains serialized even after its caller times out.
    // No further writes are admitted once that physical queue is uncertain.
    writes = operation.then(
      () => {},
      () => {},
    );
    return bounded(operation, `save:${file}`, persistenceBoundMs).then(
      (saved) => {
        if (attempt.outcome === "pending")
          attempt.outcome = saved ? "saved" : "revoked";
        attempt.after = clock();
        attempt.durationMs =
          attempt.after.monotonicAfterMs - attempt.before.monotonicBeforeMs;
        return saved;
      },
      (failure) => {
        attempt.revoked = true;
        entry.abort.abort();
        publicationUnsafe = true;
        attempt.outcome = "timed-out-unconfirmed";
        attempt.after = clock();
        attempt.durationMs =
          attempt.after.monotonicAfterMs - attempt.before.monotonicBeforeMs;
        error(`save-wait:${file}`, failure);
        revokeWrites(
          "A filesystem wait expired; later publication is withheld and late I/O remains unconfirmed",
        );
        return false;
      },
    );
  }
  const persist = (mode: "capture" | "final-index" = "capture") =>
    save(`${prefix}-index.json`, index, mode);
  const runner: Channel = {
    name: "runner",
    usable: false,
    running: false,
    command: (method, params) =>
      new Promise((resolve, reject) => {
        node.post(method, params, (failure, result) => {
          if (failure) reject(failure);
          else resolve(result);
        });
      }),
  };
  const browser: Channel = {
    name: "browser",
    usable: false,
    running: false,
    command: (method, params) => browserSession!.send(method, params),
  };
  const channels = [runner, browser];

  async function command(
    channel: Channel,
    method: string,
    params: object = {},
  ) {
    const before = clock();
    let outcome = "failed";
    let failureMessage: string | undefined;
    try {
      if (!channel.usable)
        throw new Error("Owned diagnostic session is no longer usable");
      const result = await bounded(
        channel.command(method, params),
        `${channel.name}:${method}`,
      );
      outcome = "complete";
      return result;
    } catch (failure) {
      failureMessage = message(failure);
      error(`${channel.name}:${method}`, failure);
      throw failure;
    } finally {
      const after = clock();
      index.commands.push({
        channel: channel.name,
        method,
        params,
        before,
        after,
        durationMs: after.monotonicAfterMs - before.monotonicBeforeMs,
        outcome,
        ...(failureMessage ? { error: failureMessage } : {}),
      });
    }
  }
  function disconnectRunner() {
    runner.usable = false;
    runner.running = false;
    if (!nodeConnected) return;
    try {
      node.disconnect();
      nodeConnected = false;
      index.cleanup.runnerDisconnected = true;
    } catch (failure) {
      error("runner:disconnect", failure);
    }
  }
  function detachBrowser() {
    browser.usable = false;
    browser.running = false;
    index.cleanup.browserDetachRequested = true;
    if (!browserSession) return Promise.resolve();
    if (browserClose) return browserClose;
    const detaching = Promise.resolve()
      .then(() => browserSession!.detach())
      .then(() => {
        index.cleanup.browserDetached = true;
      });
    browserClose = bounded(detaching, "browser:detach").catch((failure) => {
      error("browser:detach", failure);
    });
    return browserClose;
  }
  async function invalidate(channel: Channel) {
    if (channel === runner) disconnectRunner();
    else await detachBrowser();
  }
  async function metrics(chunk: number) {
    if (!browser.usable) return;
    try {
      const raw = await command(browser, "Performance.getMetrics");
      index.metrics.push({
        chunk,
        clockDomain: "raw CDP Performance metrics; no runner-clock subtraction",
        raw,
      });
    } catch {
      await invalidate(browser);
    }
  }
  async function start(channel: Channel) {
    if (!channel.usable || stopping) return;
    try {
      await command(channel, "Profiler.start");
      if (stopping || !channel.usable) {
        await invalidate(channel);
        return;
      }
      channel.running = true;
    } catch {
      await invalidate(channel);
    }
  }
  async function checkpoint(reason: "periodic" | "final") {
    if (captureClosed) return;
    state();
    const chunk: (typeof index.chunks)[number] = {
      number: index.chunks.length,
      reason,
      before: clock(),
      profiles: [],
    };
    index.chunks.push(chunk);
    const pendingSaves: {
      profile: object;
      receipt: (typeof chunk.profiles)[number];
      file: string;
    }[] = [];
    for (const channel of channels) {
      if (captureClosed) break;
      if (!channel.running) {
        chunk.profiles.push({ channel: channel.name, status: "not-running" });
        continue;
      }
      try {
        const result = (await command(channel, "Profiler.stop")) as {
          profile?: unknown;
        };
        channel.running = false;
        const profile = result?.profile as
          | { startTime?: unknown; endTime?: unknown; nodes?: unknown }
          | undefined;
        if (
          !profile ||
          !Number.isFinite(profile.startTime) ||
          !Number.isFinite(profile.endTime) ||
          (profile.endTime as number) < (profile.startTime as number) ||
          !Array.isArray(profile.nodes) ||
          profile.nodes.length === 0
        )
          throw new Error(
            "Native Profiler.stop returned no valid profile clock bounds/nodes",
          );
        const file = `${prefix}-${channel.name}-${String(chunk.number).padStart(3, "0")}.cpuprofile`;
        const receipt: (typeof chunk.profiles)[number] = {
          channel: channel.name,
          status: "pending-save",
          nativeClock: {
            unit: "native profiler microseconds; separate clock domain",
            startTime: profile.startTime as number,
            endTime: profile.endTime as number,
            timeDeltas:
              "Preserved unmodified in the native profile, when supplied",
          },
        };
        chunk.profiles.push(receipt);
        pendingSaves.push({ profile, receipt, file });
      } catch (failure) {
        error(`${channel.name}:checkpoint`, failure);
        chunk.profiles.push({
          channel: channel.name,
          status: "stop-or-profile-failed",
        });
        await invalidate(channel);
      }
    }
    await metrics(chunk.number);
    for (const { profile, receipt, file } of pendingSaves) {
      if (captureClosed) {
        receipt.status = "capture-abandoned-unsaved";
        continue;
      }
      const saved = await save(file, profile);
      receipt.status = saved ? "saved" : "save-failed";
      if (saved) receipt.file = file;
    }
    chunk.after = clock();
    if (!(await persist())) {
      if (reason === "periodic") void stop();
      return;
    }
    if (reason === "periodic" && !stopping) {
      for (const channel of channels) await start(channel);
      if (!(await persist())) void stop();
    }
  }
  function stop() {
    if (stopPromise) return stopPromise;
    stopping = true;
    index.finalization.state = "cleaning";
    index.finalization.started = clock();
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
    index.cleanup.timerCleared = true;
    stopPromise = (async () => {
      try {
        await bounded(checkpoints, "checkpoint-drain", checkpointDrainBoundMs);
        await bounded(
          checkpoint("final"),
          "final-capture",
          finalCaptureBoundMs,
        );
      } catch (failure) {
        index.finalization.captureAbandoned = true;
        error("final-checkpoint", failure);
      } finally {
        // Neither an earlier native write nor its logical checkpoint is allowed
        // to gate resource cleanup. Revoke their right to publish before cleanup.
        captureClosed = true;
        writeEpoch++;
        if (pendingWrites.size)
          revokeWrites(
            "Finalization stopped waiting for pending physical I/O; no final publication can be confirmed",
          );
        disconnectRunner();
        await detachBrowser();
        state();
        index.finished = clock();
        index.finalization.finished = index.finished;
        index.finalization.state =
          !nodeConnected &&
          !index.cleanup.browserAttachmentPending &&
          (!browserSession || index.cleanup.browserDetached)
            ? "owned-session-cleanup-finished"
            : "owned-session-cleanup-unconfirmed";
        const saved = index.chunks
          .flatMap((chunk) => chunk.profiles)
          .filter((profile) => profile.status === "saved");
        index.status = index.errors.length
          ? saved.length
            ? "partial"
            : "failed"
          : "stopped";
        index.publication.finalIndexAcknowledged = await persist("final-index");
        index.publication.unsavedFinalIndex =
          !index.publication.finalIndexAcknowledged;
        const receipt = {
          schemaVersion: 1,
          purpose:
            "Finalization observation; publication acknowledgment cannot be self-certified by the file being written",
          identity: index.identity,
          status: index.status,
          finalization: { ...index.finalization },
          cleanup: { ...index.cleanup },
          publication: {
            finalIndexFile: `${prefix}-index.json`,
            finalIndexAttempt: index.publication.finalIndexAttempt,
            finalIndexAcknowledged: index.publication.finalIndexAcknowledged,
            finalReceiptAttempt: writeSequence + 1,
            receiptAcknowledgment:
              "unconfirmed-at-serialization; observe the caller receipt separately",
            uncertainOutput: publicationUnsafe,
            pendingPhysicalWrites: [...pendingWrites.keys()],
          },
          savedProfileFiles: saved.map((profile) => profile.file),
          errors: [...index.errors],
        };
        index.publication.finalReceiptAcknowledged = await save(
          index.publication.finalizationReceiptFile,
          receipt,
          "final-receipt",
        );
        console.info(
          "Observatory diagnostic finalization receipt",
          JSON.stringify({
            identity: index.identity,
            status: index.status,
            finalization: index.finalization,
            cleanup: index.cleanup,
            publication: index.publication,
            pendingPhysicalWrites: [...pendingWrites.keys()],
            errors: index.errors,
          }),
        );
      }
    })().catch((failure) => {
      error("finalization", failure);
    });
    return stopPromise;
  }

  async function setup() {
    if (stopping) return;
    state();
    index.versions.browser = page.context().browser()?.version() ?? null;
    try {
      node.connect();
      nodeConnected = true;
      runner.usable = true;
      await command(runner, "Profiler.enable");
      await command(runner, "Profiler.setSamplingInterval", {
        interval: samplingIntervalUs,
      });
      await start(runner);
    } catch (failure) {
      error("runner:setup", failure);
      disconnectRunner();
    }
    if (stopping) return;
    try {
      index.cleanup.browserAttachmentPending = true;
      const opening = page
        .context()
        .newCDPSession(page)
        .then(async (session) => {
          browserSession = session;
          if (
            stopping ||
            index.cleanup.browserAttachmentAbandoned ||
            index.cleanup.browserDetachRequested
          ) {
            await detachBrowser();
            error(
              "browser:late-attachment",
              JSON.stringify({
                browserDetached: index.cleanup.browserDetached,
                browserDetachRequested: index.cleanup.browserDetachRequested,
                publication: "No stale index publication attempted",
              }),
            );
            throw new Error(
              "Late browser attachment was detached after setup/finalization ended",
            );
          }
          return session;
        })
        .finally(() => {
          index.cleanup.browserAttachmentPending = false;
        });
      await bounded(opening, "browser:attach");
      if (stopping) {
        await detachBrowser();
        return;
      }
      browser.usable = true;
      await command(browser, "Profiler.enable");
      await command(browser, "Profiler.setSamplingInterval", {
        interval: samplingIntervalUs,
      });
      await command(browser, "Performance.enable");
      await start(browser);
      await metrics(-1);
    } catch (failure) {
      error("browser:setup", failure);
      index.cleanup.browserAttachmentAbandoned = !browserSession;
      await detachBrowser();
    }
    if (stopping) return;
    if (!(await persist()))
      throw new Error(
        "Initial diagnostic index publication was not confirmed; setup is aborted",
      );
    if (stopping) return;
    if (channels.some((channel) => channel.running)) {
      timer = setInterval(() => {
        if (stopping || checkpointPending) return;
        checkpointPending = true;
        checkpoints = checkpoints
          .then(() => checkpoint("periodic"))
          .catch((failure) => {
            error("periodic-checkpoint", failure);
          })
          .finally(() => {
            checkpointPending = false;
          });
      }, checkpointIntervalMs);
      timer.unref();
    }
  }
  try {
    await bounded(setup(), "setup-lifecycle", setupBoundMs);
    if (!channels.some((channel) => channel.running)) await stop();
  } catch (failure) {
    error("setup", failure);
    await stop();
  }
  return { stop };
}

/** No hooks are registered at all in the ordinary acceptance run. */
export function installDiagnosticProfiling(suite: typeof test) {
  if (process.env.COMMANDRY_E2E_DIAGNOSTIC_PROFILE !== "1") return;
  const profiles = new WeakMap<object, DiagnosticProfile>();
  suite.beforeEach(async ({ page }, info) => {
    try {
      profiles.set(
        info,
        await startDiagnosticProfile(page, {
          outputPath: (name) => info.outputPath(name),
          testId: info.testId,
          title: info.title,
          project: info.project.name,
          worker: info.workerIndex,
          current: () => ({
            timeout: info.timeout,
            status: info.status,
            expectedStatus: info.expectedStatus,
          }),
        }),
      );
    } catch (failure) {
      console.error("Observatory diagnostic setup failed", message(failure));
    }
  });
  suite.afterEach(async ({}, info) => {
    try {
      await profiles.get(info)?.stop();
    } catch (failure) {
      console.error(
        "Observatory diagnostic finalization failed",
        message(failure),
      );
    } finally {
      profiles.delete(info);
    }
  });
}
