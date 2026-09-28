import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

function onClose(child) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve(code));
  });
}

export async function pipeAndHash(
  sourceCommand,
  targetCommand,
  cwd,
  onTargetLine,
  onTargetStderr,
  streamTransform,
) {
  const source = spawn(sourceCommand[0], sourceCommand[1], { cwd });
  const target = spawn(targetCommand[0], targetCommand[1], { cwd });
  const hash = createHash("sha256");
  const hasher = new Transform({
    transform(chunk, _encoding, done) {
      hash.update(chunk);
      done(null, chunk);
    },
  });
  let pending = "";
  let invalidOutput = false;
  target.stdout.setEncoding("utf8");
  target.stdout.on("data", (chunk) => {
    pending += chunk;
    if (pending.length > 128 * 1024) {
      invalidOutput = true;
      target.kill();
      return;
    }
    let newline = pending.indexOf("\n");
    while (newline >= 0) {
      try {
        onTargetLine?.(pending.slice(0, newline));
      } catch {
        invalidOutput = true;
        target.kill();
        return;
      }
      pending = pending.slice(newline + 1);
      newline = pending.indexOf("\n");
    }
  });
  source.stderr.resume();
  if (onTargetStderr) target.stderr.on("data", onTargetStderr);
  else target.stderr.resume();
  const results = await Promise.allSettled([
    pipeline(
      source.stdout,
      hasher,
      ...(streamTransform ? [streamTransform] : []),
      target.stdin,
    ),
    onClose(source),
    onClose(target),
  ]);
  if (invalidOutput) throw new Error("STREAM_OUTPUT_FAILED");
  if (results[1].status === "rejected" || results[1].value !== 0)
    throw new Error("STREAM_SOURCE_FAILED");
  if (results[2].status === "rejected" || results[2].value !== 0)
    throw new Error("STREAM_TARGET_FAILED");
  if (results[0].status === "rejected")
    throw new Error("STREAM_PIPELINE_FAILED");
  if (pending) onTargetLine?.(pending);
  return hash.digest("hex");
}
