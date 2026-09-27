import { describe, expect, it } from "vitest";
import { assessLocalRecovery } from "./local-recovery";

describe("local recovery evidence", () => {
  it("keeps every production gate unverified even after a passed local restore", () => {
    const drill = { outcome: "passed" as const, id: "local-drill" };
    const status = assessLocalRecovery(drill);
    expect(status.localRehearsal).toBe("passed");
    expect(status.latestDrill).toBe(drill);
    expect(status.productionReady).toBe(false);
    expect(status.productionGates).toHaveLength(4);
    expect(
      status.productionGates.every((gate) => gate.status === "unverified"),
    ).toBe(true);
  });

  it("distinguishes no rehearsal from a failed one", () => {
    expect(assessLocalRecovery(null).localRehearsal).toBe("not_run");
    expect(assessLocalRecovery({ outcome: "failed" }).localRehearsal).toBe(
      "failed",
    );
  });
});
