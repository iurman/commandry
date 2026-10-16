import { describe, expect, it, vi } from "vitest";
import {
  createProviderStatusPoller,
  type ProviderStatusPort,
} from "./provider-status";
function fixture() {
  const claim = { leaseId: "lease", etag: '"old"' };
  const port: ProviderStatusPort = {
    claim: vi.fn(async () => claim),
    complete: vi.fn(async () => {}),
    fail: vi.fn(async () => {}),
  };
  return { port, claim };
}
describe("one server-owned provider poll claim", () => {
  it("does no source request when another worker owns the claim", async () => {
    const { port } = fixture();
    vi.mocked(port.claim).mockResolvedValue(null);
    const read = vi.fn();
    expect(await createProviderStatusPoller(port, read).pollNext()).toBe(false);
    expect(read).not.toHaveBeenCalled();
  });
  it("uses conditional last-known evidence without manufacturing a new notice", async () => {
    const { port, claim } = fixture();
    const result = {
      snapshot: null,
      notModified: true,
      etag: claim.etag,
      retrySeconds: 120,
    };
    expect(
      await createProviderStatusPoller(
        port,
        vi.fn(async () => result),
      ).pollNext(),
    ).toBe(true);
    expect(port.complete).toHaveBeenCalledWith(claim, result);
    expect(port.fail).not.toHaveBeenCalled();
  });
  it("records a bounded retry without submitting an empty reconciliation on provider failure", async () => {
    const { port, claim } = fixture();
    await createProviderStatusPoller(port, async () => {
      throw { code: "PROVIDER_RATE_LIMITED", retrySeconds: 600 };
    }).pollNext();
    expect(port.fail).toHaveBeenCalledWith(claim, "PROVIDER_RATE_LIMITED", 600);
    expect(port.complete).not.toHaveBeenCalled();
  });
  it("rejects a missing complete snapshot before persistence", async () => {
    const { port } = fixture();
    await createProviderStatusPoller(port, async () => ({
      snapshot: null,
      notModified: false,
      etag: null,
      retrySeconds: 120,
    })).pollNext();
    expect(port.fail).toHaveBeenCalled();
    expect(port.complete).not.toHaveBeenCalled();
  });
});
