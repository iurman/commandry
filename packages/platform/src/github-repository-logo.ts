import { createHash } from "node:crypto";
import {
  ObservatoryLogoError,
  type ObservatoryLogoRepositoryReader,
} from "@commandry/application";
import { OBSERVATORY_LOGO_MAX_INPUT_BYTES } from "@commandry/contracts";
import { readPrivateOperationalCredentialFile } from "./operational-source-readers";

/** Contents JSON carries the file as base64 plus metadata. */
const maximumResponseBytes = 1_048_576;
const unavailable = () => new ObservatoryLogoError("LOGO_SOURCE_UNAVAILABLE");
const notFound = () => new ObservatoryLogoError("LOGO_SOURCE_NOT_FOUND");
const unauthorized = () => new ObservatoryLogoError("LOGO_SOURCE_UNAUTHORIZED");
type Response404 = "not_found" | "unauthorized";

function identity(repository: string) {
  const parts =
    /^([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?)\/([a-zA-Z0-9_.-]{1,100})$/.exec(
      repository,
    );
  // No GitHub repository can have this name, so it cannot be read later either.
  if (!parts || parts[1]!.includes("--") || [".", ".."].includes(parts[2]!))
    throw notFound();
  return { owner: parts[1]!, name: parts[2]! };
}
const encodePath = (value: string) =>
  value.split("/").map(encodeURIComponent).join("/");

/**
 * Read one owner-named file from a reviewed GitHub repository at an exact
 * commit. The origin, credential and endpoints are fixed by the server; the
 * caller chooses only the repository, path and ref the owner reviewed.
 */
export function createGitHubRepositoryLogoReader(
  options: {
    token?: string;
    fetch?: typeof fetch;
    timeoutMs?: number;
    baseUrl?: string;
    allowLoopbackForTests?: boolean;
  } = {},
): ObservatoryLogoRepositoryReader {
  let origin = "https://api.github.com";
  const token = options.token,
    timeoutMs = options.timeoutMs ?? 10000;
  if (
    (token !== undefined && !/^[\x21-\x7e]{1,4096}$/.test(token)) ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 10000
  )
    throw unavailable();
  if (options.baseUrl !== undefined) {
    const base = new URL(options.baseUrl);
    if (
      options.allowLoopbackForTests !== true ||
      !["127.0.0.1", "localhost", "[::1]"].includes(base.hostname) ||
      !["http:", "https:"].includes(base.protocol) ||
      base.pathname !== "/" ||
      base.search ||
      base.hash ||
      base.username ||
      base.password
    )
      throw unavailable();
    origin = base.origin;
  }
  const fetcher = options.fetch ?? fetch;
  async function request(
    path: string,
    accept: string,
    missing: Response404,
  ): Promise<Uint8Array> {
    const url = new URL(path, origin);
    if (url.origin !== origin) throw unavailable();
    const signal = AbortSignal.timeout(timeoutMs);
    let response: Response;
    try {
      response = await fetcher(url.href, {
        method: "GET",
        redirect: "error",
        signal,
        headers: {
          Accept: accept,
          "X-GitHub-Api-Version": "2026-03-10",
          "Accept-Encoding": "identity",
          ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }),
        },
      });
    } catch {
      throw unavailable();
    }
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      if (
        response.redirected ||
        (response.url && response.url !== url.href) ||
        response.status !== 200
      ) {
        const limited =
          response.status === 429 ||
          (response.status === 403 &&
            (response.headers.get("retry-after") !== null ||
              response.headers.get("x-ratelimit-remaining") === "0"));
        throw limited
          ? unavailable()
          : response.status === 401 || response.status === 403
            ? unauthorized()
            : response.status === 404 || response.status === 422
              ? missing === "unauthorized"
                ? unauthorized()
                : notFound()
              : unavailable();
      }
      if (
        accept === "application/vnd.github+json" &&
        !/^application\/(?:json|vnd\.github\+json)(?:\s*;\s*charset\s*=\s*"?utf-8"?)?\s*$/i.test(
          response.headers.get("content-type") ?? "",
        )
      )
        throw unavailable();
      const length = response.headers.get("content-length");
      if (
        length !== null &&
        (!/^\d+$/.test(length) || Number(length) > maximumResponseBytes)
      )
        throw unavailable();
      reader = response.body?.getReader();
      if (!reader) throw unavailable();
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > maximumResponseBytes) throw unavailable();
        chunks.push(part.value);
      }
      return Buffer.concat(chunks);
    } catch (error) {
      if (error instanceof ObservatoryLogoError) throw error;
      throw unavailable();
    } finally {
      try {
        await (reader ? reader.cancel() : response.body?.cancel());
      } catch {
        /* Transport data stays private. */
      }
    }
  }
  async function json(path: string, missing: Response404) {
    const body = await request(path, "application/vnd.github+json", missing);
    try {
      const value: unknown = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(body),
      );
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error();
      return value as Record<string, unknown>;
    } catch {
      throw unavailable();
    }
  }
  return {
    async readFile(input) {
      const repo = identity(input.repository);
      const base = `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`;
      if (input.ref !== null && input.commitSha !== null) throw unavailable();
      // A repository hidden from the current credential reads as 404; say so.
      const metadata = await json(
        base,
        token === undefined ? "unauthorized" : "not_found",
      );
      if (
        typeof metadata.full_name !== "string" ||
        metadata.full_name.toLowerCase() !==
          `${repo.owner}/${repo.name}`.toLowerCase() ||
        typeof metadata.default_branch !== "string" ||
        !/^[A-Za-z0-9_./-]{1,200}$/.test(metadata.default_branch)
      )
        throw unavailable();
      let commitSha = input.commitSha;
      if (commitSha === null) {
        const ref = input.ref ?? metadata.default_branch;
        const text = new TextDecoder("utf-8", { fatal: true })
          .decode(
            await request(
              `${base}/commits/${encodePath(ref)}`,
              "application/vnd.github.sha",
              "not_found",
            ),
          )
          .trim();
        if (!/^[a-f0-9]{40}$/.test(text)) throw unavailable();
        commitSha = text;
      } else if (!/^[a-f0-9]{40}$/.test(commitSha)) throw unavailable();
      const file = await json(
        `${base}/contents/${encodePath(input.path)}?ref=${commitSha}`,
        "not_found",
      );
      // A directory listing is an array and was refused above; also refuse
      // symlinks and submodules rather than following them.
      if (file.type !== "file" || file.path !== input.path) throw notFound();
      if (
        file.encoding !== "base64" ||
        typeof file.content !== "string" ||
        typeof file.sha !== "string" ||
        !/^[a-f0-9]{40}$/.test(file.sha) ||
        typeof file.size !== "number" ||
        !Number.isSafeInteger(file.size)
      )
        throw unavailable();
      if (file.size > OBSERVATORY_LOGO_MAX_INPUT_BYTES)
        throw new ObservatoryLogoError("LOGO_TOO_LARGE");
      const encoded = file.content.replace(/\n/g, "");
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw unavailable();
      const bytes = Buffer.from(encoded, "base64");
      // The git blob identity proves these are the committed bytes.
      const blobSha = createHash("sha1")
        .update(`blob ${bytes.byteLength}\0`)
        .update(bytes)
        .digest("hex");
      if (bytes.byteLength !== file.size || blobSha !== file.sha)
        throw unavailable();
      return {
        bytes: new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength),
        commitSha,
        blobSha,
      };
    },
  };
}

/** Per-request construction so a rotated token file takes effect at once. */
export async function createObservatoryLogoRepositoryReader(
  options: { githubTokenFile?: string; fetch?: typeof fetch } = {},
): Promise<ObservatoryLogoRepositoryReader> {
  let token: string | undefined;
  if (options.githubTokenFile !== undefined)
    try {
      token = await readPrivateOperationalCredentialFile(
        options.githubTokenFile,
      );
    } catch {
      throw unavailable();
    }
  return createGitHubRepositoryLogoReader({
    ...(token === undefined ? {} : { token }),
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  });
}
