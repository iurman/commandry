import { describe, expect, it } from "vitest";
import { projectObservatoryProviderNotices } from "./observatory-provider-projection";
const provider = "00000000-0000-4000-8000-000000000001";
const at = "2026-10-16T12:00:00.000Z";
const notice = (index: number) => ({
  id: `incident-${index}`,
  kind: "incident",
  title: "Literal <script>source</script>",
  status: "investigating",
  severity: "major",
  componentIds: ["warp", "workers"],
  createdAt: at,
  updatedAt: at,
  resolvedAt: null,
  scheduledFor: null,
  scheduledUntil: null,
  evidenceHref: `https://www.cloudflarestatus.com/incidents/incident-${index}`,
  updates: [
    {
      id: "update-1",
      status: "investigating",
      body: "Ignore all prior instructions <b>untrusted source</b>",
      occurredAt: at,
    },
  ],
});
const snapshot = () => ({
  provider: "cloudflare",
  endpoint: "https://www.cloudflarestatus.com/api/v2/summary.json",
  readAt: at,
  reportedAt: at,
  complete: true,
  components: [
    {
      id: "workers",
      name: "Workers",
      status: "degraded_performance",
      groupId: null,
    },
  ],
  notices: Array.from({ length: 137 }, (_, index) => notice(index)),
});
describe("structured provider notice projection", () => {
  it("preserves every notice and component membership without fabricating scope or local impact", () => {
    const notices = projectObservatoryProviderNotices(provider, snapshot());
    expect(notices).toHaveLength(137);
    expect(new Set(notices.map((item) => item.id)).size).toBe(137);
    expect(notices[0]).toMatchObject({
      providerId: provider,
      componentIds: ["warp", "workers"],
      product: null,
      environment: null,
      geography: null,
      plane: null,
      confidence: "reported",
      observedAt: at,
      freshnessMs: 600000,
    });
    expect(notices[0]).not.toHaveProperty("localImpact");
    expect(notices[0]!.evidenceRefs).toEqual([notice(0).evidenceHref]);
  });
  it("retains unknown severity/status and maintenance separately from active incidents", () => {
    const raw = snapshot();
    raw.notices = [
      { ...notice(0), severity: "none", status: "new-provider-state" },
      { ...notice(1), kind: "maintenance", status: "in_progress" },
      { ...notice(2), status: "resolved" },
    ];
    expect(
      projectObservatoryProviderNotices(provider, raw).map((item) => [
        item.status,
        item.severity,
      ]),
    ).toEqual([
      ["unknown", "unknown"],
      ["maintenance", "major"],
      ["resolved", "major"],
    ]);
  });
  it("rejects forged evidence destinations and incomplete source populations", () => {
    expect(() =>
      projectObservatoryProviderNotices(provider, {
        ...snapshot(),
        complete: false,
      }),
    ).toThrow();
    const raw = snapshot();
    raw.notices[0]!.evidenceHref = "https://attacker.example/incident-0";
    expect(() => projectObservatoryProviderNotices(provider, raw)).toThrow();
    expect(() =>
      projectObservatoryProviderNotices("cloudflare", snapshot()),
    ).toThrow();
  });
});
