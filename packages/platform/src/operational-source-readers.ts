import { constants } from "node:fs";
import fs, { type FileHandle } from "node:fs/promises";
import { isAbsolute } from "node:path";
import {
  OperationalSourceError,
  type OperationalObservation,
  type OperationalSourceClaim,
} from "@commandry/application";
import { createGitHubObservatoryReader } from "./github-observatory";
import { createInfraAgentAvailabilityReader } from "./infraagent-availability";
import { createNamecheapInventoryReader } from "./namecheap-inventory";
import { createCloudflareInventoryReader } from "./cloudflare-inventory";
import { createCommandryReadinessReader } from "./commandry-readiness";
import {
  createEndpointCheckReader,
  readEndpointCheckCatalogue,
} from "./endpoint-check";

const maximumBytes = 4096;
const invalid = () =>
  new OperationalSourceError("OPERATIONAL_CONFIGURATION_INVALID");

/** Trusted startup-only file read. No credential, input path or filesystem error escapes. */
export async function readPrivateOperationalCredentialFile(
  absolutePath: string,
): Promise<string> {
  let handle: FileHandle | undefined;
  try {
    if (
      typeof absolutePath !== "string" ||
      !isAbsolute(absolutePath) ||
      absolutePath.includes("\0") ||
      !constants.O_NOFOLLOW
    )
      throw invalid();
    // Nonblocking open also lets fstat reject a FIFO without waiting for a writer.
    handle = await fs.open(
      absolutePath,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    const before = await handle.stat();
    const privateRegular = (stat: typeof before) =>
      stat.isFile() &&
      (stat.mode & 0o400) !== 0 &&
      (stat.mode & 0o077) === 0 &&
      stat.size > 0 &&
      stat.size <= maximumBytes;
    if (!privateRegular(before)) throw invalid();
    const buffer = Buffer.alloc(maximumBytes + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(
        buffer,
        length,
        buffer.length - length,
        length,
      );
      if (bytesRead === 0) break;
      length += bytesRead;
    }
    const after = await handle.stat();
    if (
      !privateRegular(after) ||
      after.size !== before.size ||
      length !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      after.ctimeMs !== before.ctimeMs
    )
      throw invalid();
    let token = buffer.subarray(0, length);
    if (token.at(-1) === 0x0a)
      token = token.subarray(0, token.length - (token.at(-2) === 0x0d ? 2 : 1));
    if (
      token.length === 0 ||
      token.length > maximumBytes ||
      token.some((byte) => byte < 0x21 || byte > 0x7e)
    )
      throw invalid();
    return token.toString("ascii");
  } catch {
    throw invalid();
  } finally {
    if (handle) {
      try {
        await handle.close();
      } catch {
        throw invalid();
      }
    }
  }
}

export type OperationalSourceReaders = {
  readers: {
    kind: OperationalSourceClaim["kind"];
    read: (claim: OperationalSourceClaim) => Promise<OperationalObservation>;
  }[];
  errors: {
    kind: OperationalSourceClaim["kind"];
    code: "OPERATIONAL_CONFIGURATION_INVALID";
  }[];
};

/** Explicit server construction only; loaded credentials rotate with the worker startup. */
export async function createOperationalSourceReaders(
  options: {
    namecheapUsername?: string;
    namecheapKeyFile?: string;
    namecheapClientIp?: string;
    cloudflareAccountId?: string;
    cloudflareTokenFile?: string;
    endpointChecksFile?: string;
    githubTokenFile?: string;
    infraAgentOrigin?: string;
    infraAgentKeyFile?: string;
    appOrigin?: string;
    allowLoopbackForTests?: boolean;
    fetch?: typeof fetch;
  } = {},
): Promise<OperationalSourceReaders> {
  const readers: OperationalSourceReaders["readers"] = [];
  const errors: OperationalSourceReaders["errors"] = [];
  const transport = options.fetch === undefined ? {} : { fetch: options.fetch };
  if (
    options.namecheapUsername !== undefined ||
    options.namecheapKeyFile !== undefined ||
    options.namecheapClientIp !== undefined
  ) {
    try {
      if (
        !options.namecheapUsername ||
        !options.namecheapKeyFile ||
        !options.namecheapClientIp
      )
        throw invalid();
      readers.push({
        kind: "namecheap-account",
        read: createNamecheapInventoryReader({
          username: options.namecheapUsername,
          apiKey: await readPrivateOperationalCredentialFile(
            options.namecheapKeyFile,
          ),
          clientIp: options.namecheapClientIp,
          ...transport,
        }),
      });
    } catch {
      errors.push({
        kind: "namecheap-account",
        code: "OPERATIONAL_CONFIGURATION_INVALID",
      });
    }
  }
  if (
    options.cloudflareAccountId !== undefined ||
    options.cloudflareTokenFile !== undefined
  ) {
    try {
      if (!options.cloudflareAccountId || !options.cloudflareTokenFile)
        throw invalid();
      readers.push({
        kind: "cloudflare-account",
        read: createCloudflareInventoryReader({
          accountId: options.cloudflareAccountId,
          token: await readPrivateOperationalCredentialFile(
            options.cloudflareTokenFile,
          ),
          ...transport,
        }),
      });
    } catch {
      errors.push({
        kind: "cloudflare-account",
        code: "OPERATIONAL_CONFIGURATION_INVALID",
      });
    }
  }
  if (options.endpointChecksFile !== undefined) {
    try {
      readers.push({
        kind: "endpoint-check",
        read: createEndpointCheckReader({
          catalogue: await readEndpointCheckCatalogue(
            options.endpointChecksFile,
          ),
          ...transport,
        }),
      });
    } catch {
      errors.push({
        kind: "endpoint-check",
        code: "OPERATIONAL_CONFIGURATION_INVALID",
      });
    }
  }
  try {
    const authentication =
      options.githubTokenFile === undefined
        ? {}
        : {
            token: await readPrivateOperationalCredentialFile(
              options.githubTokenFile,
            ),
          };
    readers.push({
      kind: "github-repository",
      read: createGitHubObservatoryReader({ ...authentication, ...transport }),
    });
  } catch {
    errors.push({
      kind: "github-repository",
      code: "OPERATIONAL_CONFIGURATION_INVALID",
    });
  }
  if (options.appOrigin !== undefined) {
    try {
      readers.push({
        kind: "http-readiness",
        read: createCommandryReadinessReader({
          appOrigin: options.appOrigin,
          ...(options.allowLoopbackForTests === true
            ? { allowLoopbackForTests: true }
            : {}),
          ...transport,
        }),
      });
    } catch {
      errors.push({
        kind: "http-readiness",
        code: "OPERATIONAL_CONFIGURATION_INVALID",
      });
    }
  }
  if (
    options.infraAgentOrigin !== undefined ||
    options.infraAgentKeyFile !== undefined
  ) {
    try {
      if (
        options.infraAgentOrigin === undefined ||
        options.infraAgentKeyFile === undefined
      )
        throw invalid();
      const apiKey = await readPrivateOperationalCredentialFile(
        options.infraAgentKeyFile,
      );
      readers.push({
        kind: "infraagent-monitor",
        read: createInfraAgentAvailabilityReader({
          baseUrl: options.infraAgentOrigin,
          apiKey,
          ...transport,
        }),
      });
    } catch {
      errors.push({
        kind: "infraagent-monitor",
        code: "OPERATIONAL_CONFIGURATION_INVALID",
      });
    }
  }
  return { readers, errors };
}
