import { describe, expect, it } from "vitest";
import { chooseCommandCenterNextAction } from "./command-center";

describe("Command Center next action", () => {
  it("links to the source context of the most recent active local notification", () => {
    expect(
      chooseCommandCenterNextAction([
        {
          href: "/approvals/example",
          title: "Simulated action awaits review",
          reason: "A local decision is required.",
        },
      ]),
    ).toEqual({
      href: "/approvals/example",
      label: "Review Simulated action awaits review",
      reason: "A local decision is required.",
      source: "notification",
    });
  });

  it("uses the Inbox when no current notification exists", () => {
    expect(chooseCommandCenterNextAction([])).toMatchObject({
      href: "/inbox",
      source: "inbox",
    });
  });
});
