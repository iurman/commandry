import { describe, expect, it } from "vitest";
import { requireDecisionRevision } from "./project-decision";

describe("project decision revisions", () => {
  it("rejects stale edits and terminal status changes", () => {
    expect(() =>
      requireDecisionRevision(
        { revision: 2, status: "proposed" },
        1,
        "accepted",
      ),
    ).toThrow(/reload/);
    expect(() =>
      requireDecisionRevision(
        { revision: 2, status: "accepted" },
        2,
        "proposed",
      ),
    ).toThrow(/cannot return/);
    expect(() =>
      requireDecisionRevision(
        { revision: 2, status: "superseded" },
        2,
        "accepted",
      ),
    ).toThrow(/cannot be revised/);
    expect(() =>
      requireDecisionRevision(
        { revision: 2, status: "accepted" },
        2,
        "superseded",
      ),
    ).not.toThrow();
  });
});
