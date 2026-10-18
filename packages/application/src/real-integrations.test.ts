import { describe, expect, it, vi } from "vitest";
import {
  createRealIntegrationPoller,
  prepareLinuxHostObservation,
  RealProviderError,
  type RealPollClaim,
} from "./real-integrations";
import { normalizeGitHubActivity } from "@commandry/domain";
import { linuxHostSampleSchema } from "@commandry/contracts";
const claim: RealPollClaim = {
  id: crypto.randomUUID(),
  leaseId: crypto.randomUUID(),
  identifier: "iurman/commandry",
  page: 1,
  etag: null,
  pendingEtag: null,
};
const now = new Date("2026-10-04T09:00:00Z");
const host = {
  hostname: "electra",
  sampleId: crypto.randomUUID(),
  observedAt: now.toISOString(),
  memory: { totalBytes: 1000, availableBytes: 750 },
  disk: { totalBytes: 2000, availableBytes: 500 },
  uptimeSeconds: 10,
  load1Milli: 50,
};
describe("real source evidence", () => {
  it("preserves provider payload, scope and occurrence while identifying merged PRs", () => {
    const payload = {
      id: "123",
      type: "PullRequestEvent",
      repo: { name: claim.identifier },
      created_at: now.toISOString(),
      payload: { action: "closed", pull_request: { merged: true } },
    };
    expect(normalizeGitHubActivity(claim.identifier, payload)).toMatchObject({
      type: "git.pull_request.merged",
      rawPayload: payload,
      sourceEventId: "123",
    });
    expect(
      normalizeGitHubActivity("Iurman/Commandry", payload).rawPayload,
    ).toBe(payload);
    expect(() => normalizeGitHubActivity("other/repo", payload)).toThrow(
      "does not match",
    );
    expect(() =>
      normalizeGitHubActivity(claim.identifier, {
        ...payload,
        created_at: "invalid",
      }),
    ).toThrow();
  });
  it("derives internal capacity without claiming external availability", () => {
    expect(prepareLinuxHostObservation("electra", host, now).metrics).toEqual([
      { name: "host_memory_used", unit: "percent", value: 25 },
      { name: "host_disk_used", unit: "percent", value: 75 },
      { name: "host_uptime", unit: "seconds", value: 10 },
      { name: "host_load_1m", unit: "milli_load", value: 50 },
    ]);
    expect(() => prepareLinuxHostObservation("other", host, now)).toThrow();
    expect(() =>
      prepareLinuxHostObservation(
        "electra",
        { ...host, observedAt: "2026-10-04T09:06:00Z" },
        now,
      ),
    ).toThrow();
    expect(
      linuxHostSampleSchema.safeParse({
        ...host,
        memory: { totalBytes: 1, availableBytes: 2 },
      }).success,
    ).toBe(false);
  });
  it("accepts a reported operating system identity and keeps it in the original evidence", () => {
    const os = {
      id: "debian",
      idLike: [],
      prettyName: "Debian GNU/Linux 12 (bookworm)",
      platform: "proxmox-ve" as const,
    };
    expect(
      prepareLinuxHostObservation("electra", { ...host, os }, now).rawPayload,
    ).toMatchObject({ os });
    // Collectors older than the field still deliver.
    expect(linuxHostSampleSchema.safeParse(host).success).toBe(true);
    for (const invalid of [
      { ...os, id: "Debian" },
      { ...os, id: "" },
      { ...os, idLike: ["debian", "debian"] },
      { ...os, idLike: Array.from({ length: 9 }, (_, i) => `d${i}`) },
      { ...os, prettyName: "" },
      { ...os, prettyName: "x".repeat(201) },
      { ...os, prettyName: "Debian\u0007" },
      { ...os, platform: "truenas" },
      { ...os, role: "hypervisor" },
    ])
      expect(
        linuxHostSampleSchema.safeParse({ ...host, os: invalid }).success,
      ).toBe(false);
    // The sample stays strict, so a receiver must accept a field before collectors send it.
    expect(
      linuxHostSampleSchema.safeParse({ ...host, kernel: "6.1" }).success,
    ).toBe(false);
  });
  it("persists rate-limit backoff and sanitizes unexpected provider errors", async () => {
    const port = {
      claimDue: vi.fn(async () => claim),
      completePoll: vi.fn(),
      failPoll: vi.fn(),
    };
    await createRealIntegrationPoller(port, async () => {
      throw new RealProviderError("GITHUB_RATE_LIMITED", 1800);
    }).pollNext();
    expect(port.failPoll).toHaveBeenCalledWith(
      claim,
      "GITHUB_RATE_LIMITED",
      1800,
    );
    await createRealIntegrationPoller(port, async () => {
      throw new Error("private detail");
    }).pollNext();
    expect(port.failPoll).toHaveBeenLastCalledWith(
      claim,
      "PROVIDER_UNAVAILABLE",
      300,
    );
    expect(port.completePoll).not.toHaveBeenCalled();
  });
});
