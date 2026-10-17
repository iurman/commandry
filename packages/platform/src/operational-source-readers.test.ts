import { constants } from "node:fs";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OperationalSourceError,
  type OperationalSourceClaim,
} from "@commandry/application";
import {
  createOperationalSourceReaders,
  readPrivateOperationalCredentialFile,
} from "./operational-source-readers";

const sentinel = "SYNTHETIC_PRIVATE_CREDENTIAL_SENTINEL";
const directories: string[] = [];
async function fixture(contents: string | Uint8Array = sentinel, mode = 0o600) {
  const directory = await fs.mkdtemp(
    join(tmpdir(), "commandry-operational-credential-"),
  );
  directories.push(directory);
  const path = join(directory, "PRIVATE_PATH_SENTINEL");
  await fs.writeFile(path, contents, { mode });
  await fs.chmod(path, mode);
  return { path, directory };
}
async function safeFailure(path: string) {
  try {
    await readPrivateOperationalCredentialFile(path);
    throw new Error("Expected safe rejection");
  } catch (error) {
    expect(error).toBeInstanceOf(OperationalSourceError);
    expect((error as OperationalSourceError).code).toBe(
      "OPERATIONAL_CONFIGURATION_INVALID",
    );
    expect((error as Error).message).toBe("OPERATIONAL_CONFIGURATION_INVALID");
    for (const secret of [sentinel, path, "PRIVATE_PATH_SENTINEL"])
      expect(String(error)).not.toContain(secret);
    expect((error as Error).cause).toBeUndefined();
  }
}
const claim = (
  kind: OperationalSourceClaim["kind"],
): OperationalSourceClaim => ({
  id: "00000000-0000-4000-8000-000000000001",
  leaseId: "synthetic-lease",
  resourceId: "00000000-0000-4000-8000-000000000002",
  kind,
  externalId: kind === "github-repository" ? "owner/repository" : "monitor-one",
  environment: "test",
  freshnessSeconds: 300,
});
const unavailableFetch = () =>
  vi.fn<typeof fetch>(
    async () =>
      new Response("SYNTHETIC_PRIVATE_PROVIDER_BODY", { status: 503 }),
  );
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const directory of directories.splice(0))
    await fs.rm(directory, { recursive: true, force: true });
});

describe("private operational credential files", () => {
  it.each([0o400, 0o600])(
    "uses actual filesystem access for private mode %s and allows one terminal LF or CRLF",
    async (mode) => {
      for (const suffix of ["", "\n", "\r\n"]) {
        const { path } = await fixture(sentinel + suffix, mode);
        expect(await readPrivateOperationalCredentialFile(path)).toBe(sentinel);
      }
    },
  );
  it("enforces the 4096-byte file boundary with and without allowed line endings", async () => {
    for (const contents of [
      "X".repeat(4096),
      "X".repeat(4095) + "\n",
      "X".repeat(4094) + "\r\n",
    ]) {
      const { path } = await fixture(contents);
      expect(await readPrivateOperationalCredentialFile(path)).toBe(
        contents.replace(/\r?\n$/, ""),
      );
    }
    for (const contents of ["X".repeat(4097), "X".repeat(4096) + "\n"])
      await safeFailure((await fixture(contents)).path);
  });
  it.each([
    "",
    "\n",
    "\r\n",
    "has space",
    " leading",
    "trailing ",
    "tab\tkey",
    "line\nkey",
    "key\n\n",
    "key\r",
    "key\u0000",
    "key\u007f",
    "key\u0080",
    "key\u00ff",
  ])(
    "rejects empty/control/non-ASCII or whitespace bytes safely (%s)",
    async (contents) => {
      await safeFailure((await fixture(contents)).path);
    },
  );
  it.each([0o644, 0o640, 0o604, 0o601, 0o610, 0o200, 0o000])(
    "rejects group/world access or missing owner readability (%s)",
    async (mode) => {
      await safeFailure((await fixture(sentinel, mode)).path);
    },
  );
  it("rejects relative, missing, NUL, symlink and non-regular paths without sensitive errors", async () => {
    const { path, directory } = await fixture();
    const symlink = join(directory, "PRIVATE_SYMLINK_SENTINEL");
    await fs.symlink(path, symlink);
    for (const bad of [
      "relative_PRIVATE_PATH_SENTINEL",
      path + "\0PRIVATE",
      join(directory, "missing"),
      symlink,
      directory,
    ])
      await safeFailure(bad);
    expect(await readPrivateOperationalCredentialFile(path)).toBe(sentinel);
  });
  it("rejects growth between fstat and read and closes the actual opened handle", async () => {
    const { path } = await fixture("INITIAL");
    const handle = await fs.open(path, constants.O_RDONLY);
    const before = await handle.stat();
    await fs.appendFile(path, "_GROWTH");
    const open = vi.spyOn(fs, "open").mockResolvedValue(handle);
    vi.spyOn(handle, "stat").mockResolvedValueOnce(before);
    const close = vi.spyOn(handle, "close");
    await safeFailure(path);
    expect(open.mock.calls[0]?.[1]).toBe(
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    expect(close).toHaveBeenCalledTimes(1);
    await expect(handle.read(Buffer.alloc(1), 0, 1, 0)).rejects.toThrow();
  });
  it("closes a real handle when token validation fails and recovers after a private file is corrected", async () => {
    const { path } = await fixture("INVALID TOKEN");
    const handle = await fs.open(path, constants.O_RDONLY);
    vi.spyOn(fs, "open").mockResolvedValueOnce(handle);
    const close = vi.spyOn(handle, "close");
    await safeFailure(path);
    expect(close).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
    await fs.writeFile(path, sentinel);
    await fs.chmod(path, 0o400);
    expect(await readPrivateOperationalCredentialFile(path)).toBe(sentinel);
  });
});

describe("explicit independent operational reader startup", () => {
  it("starts only public GitHub without inherited environment credentials or startup network calls", async () => {
    vi.stubEnv("GH_TOKEN", sentinel);
    vi.stubEnv("GITHUB_TOKEN", sentinel);
    vi.stubEnv("INFRAAGENT_API_KEY", sentinel);
    vi.stubEnv("INFRAAGENT_ORIGIN", "https://implicit-monitor.invalid");
    const fetch = unavailableFetch();
    const configured = await createOperationalSourceReaders({ fetch });
    expect(configured.readers.map((reader) => reader.kind)).toEqual([
      "github-repository",
    ]);
    expect(configured.errors).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
    await configured.readers[0]!.read(claim("github-repository"));
    expect(fetch).toHaveBeenCalled();
    for (const [url, init] of fetch.mock.calls) {
      expect(String(url)).toMatch(/^https:\/\/api\.github\.com\//);
      expect(new Headers(init?.headers).has("authorization")).toBe(false);
      expect(init?.method).toBe("GET");
      expect(init?.redirect).toBe("error");
    }
  });
  it("loads an explicit GitHub token once; rotation is picked up only by a new factory startup", async () => {
    const { path } = await fixture(sentinel + "\n");
    const fetch = unavailableFetch();
    const first = await createOperationalSourceReaders({
      githubTokenFile: path,
      fetch,
    });
    expect(first.errors).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
    await fs.writeFile(path, "ROTATED_SYNTHETIC_CREDENTIAL");
    await first.readers[0]!.read(claim("github-repository"));
    for (const [, init] of fetch.mock.calls)
      expect(new Headers(init?.headers).get("authorization")).toBe(
        "Bearer " + sentinel,
      );
    fetch.mockClear();
    const restarted = await createOperationalSourceReaders({
      githubTokenFile: path,
      fetch,
    });
    expect(fetch).not.toHaveBeenCalled();
    await restarted.readers[0]!.read(claim("github-repository"));
    for (const [, init] of fetch.mock.calls)
      expect(new Headers(init?.headers).get("authorization")).toBe(
        "Bearer ROTATED_SYNTHETIC_CREDENTIAL",
      );
  });
  it("does not fall back to anonymous when an explicit GitHub file is invalid, and recovers after correction", async () => {
    const { path } = await fixture(sentinel, 0o644);
    const fetch = unavailableFetch();
    const failed = await createOperationalSourceReaders({
      githubTokenFile: path,
      fetch,
    });
    expect(failed.readers).toEqual([]);
    expect(failed.errors).toEqual([
      { kind: "github-repository", code: "OPERATIONAL_CONFIGURATION_INVALID" },
    ]);
    for (const secret of [sentinel, path])
      expect(JSON.stringify(failed.errors)).not.toContain(secret);
    expect(fetch).not.toHaveBeenCalled();
    await fs.chmod(path, 0o600);
    const recovered = await createOperationalSourceReaders({
      githubTokenFile: path,
      fetch,
    });
    expect(recovered.errors).toEqual([]);
    expect(recovered.readers.map((reader) => reader.kind)).toEqual([
      "github-repository",
    ]);
    expect(fetch).not.toHaveBeenCalled();
    expect(
      (await createOperationalSourceReaders({ githubTokenFile: "", fetch }))
        .readers,
    ).toEqual([]);
  });
  it("treats absent InfraAgent as normal and partial configuration as that kind's safe error", async () => {
    const { path } = await fixture();
    const fetch = unavailableFetch();
    expect((await createOperationalSourceReaders({ fetch })).errors).toEqual(
      [],
    );
    for (const configuration of [
      { infraAgentOrigin: "https://monitor.invalid" },
      { infraAgentKeyFile: path },
    ]) {
      const result = await createOperationalSourceReaders({
        ...configuration,
        fetch,
      });
      expect(result.readers.map((reader) => reader.kind)).toEqual([
        "github-repository",
      ]);
      expect(result.errors).toEqual([
        {
          kind: "infraagent-monitor",
          code: "OPERATIONAL_CONFIGURATION_INVALID",
        },
      ]);
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    "http://monitor.invalid",
    "http://127.0.0.1:1",
    "https://user:secret@monitor.invalid",
    "https://monitor.invalid/api",
    "https://monitor.invalid/?token=PRIVATE",
    "https://monitor.invalid/#PRIVATE",
    "",
    " https://monitor.invalid",
  ])(
    "retains canonical InfraAgent origin rules (%s)",
    async (infraAgentOrigin) => {
      const { path } = await fixture();
      const fetch = unavailableFetch();
      const result = await createOperationalSourceReaders({
        infraAgentOrigin,
        infraAgentKeyFile: path,
        fetch,
      });
      expect(result.readers.map((reader) => reader.kind)).toEqual([
        "github-repository",
      ]);
      expect(result.errors).toEqual([
        {
          kind: "infraagent-monitor",
          code: "OPERATIONAL_CONFIGURATION_INVALID",
        },
      ]);
      expect(JSON.stringify(result.errors)).not.toContain(
        infraAgentOrigin || "PRIVATE",
      );
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it("configures valid InfraAgent with its explicit origin and original key only, without a startup fetch", async () => {
    const { path } = await fixture(sentinel + "\r\n", 0o400);
    const fetch = unavailableFetch();
    const result = await createOperationalSourceReaders({
      infraAgentOrigin: "https://explicit-monitor.invalid",
      infraAgentKeyFile: path,
      fetch,
    });
    expect(result.errors).toEqual([]);
    expect(result.readers.map((reader) => reader.kind)).toEqual([
      "github-repository",
      "infraagent-monitor",
    ]);
    expect(fetch).not.toHaveBeenCalled();
    await expect(
      result.readers
        .find((reader) => reader.kind === "infraagent-monitor")!
        .read(claim("infraagent-monitor")),
    ).rejects.toMatchObject({ code: "OPERATIONAL_UNAVAILABLE" });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]![0]).toBe(
      "https://explicit-monitor.invalid/api/v1/monitors/monitor-one",
    );
    expect(
      new Headers(fetch.mock.calls[0]![1]?.headers).get("authorization"),
    ).toBe("Bearer " + sentinel);
    expect(fetch.mock.calls[0]![1]?.redirect).toBe("error");
  });
  it("isolates each kind's initialization failure, including simultaneous failures, without secret output", async () => {
    const good = await fixture(),
      bad = await fixture(sentinel, 0o644),
      fetch = unavailableFetch();
    const githubFailed = await createOperationalSourceReaders({
      githubTokenFile: bad.path,
      infraAgentOrigin: "https://monitor.invalid",
      infraAgentKeyFile: good.path,
      fetch,
    });
    expect(githubFailed.readers.map((reader) => reader.kind)).toEqual([
      "infraagent-monitor",
    ]);
    expect(githubFailed.errors).toEqual([
      { kind: "github-repository", code: "OPERATIONAL_CONFIGURATION_INVALID" },
    ]);
    const infraFailed = await createOperationalSourceReaders({
      githubTokenFile: good.path,
      infraAgentOrigin: "https://monitor.invalid",
      infraAgentKeyFile: bad.path,
      fetch,
    });
    expect(infraFailed.readers.map((reader) => reader.kind)).toEqual([
      "github-repository",
    ]);
    expect(infraFailed.errors).toEqual([
      { kind: "infraagent-monitor", code: "OPERATIONAL_CONFIGURATION_INVALID" },
    ]);
    const both = await createOperationalSourceReaders({
      githubTokenFile: bad.path,
      infraAgentOrigin: "https://monitor.invalid",
      infraAgentKeyFile: bad.path,
      fetch,
    });
    expect(both.readers).toEqual([]);
    expect(both.errors.map((error) => error.kind)).toEqual([
      "github-repository",
      "infraagent-monitor",
    ]);
    for (const secret of [sentinel, good.path, bad.path])
      expect(JSON.stringify(both)).not.toContain(secret);
    expect(fetch).not.toHaveBeenCalled();
  });
});
