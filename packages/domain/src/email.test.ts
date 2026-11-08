import { describe, expect, it } from "vitest";
import {
  mailAddress,
  mailAttentionReasons,
  requireMailApproval,
  requireMailIdentity,
} from "./email";

describe("email identity and attention policy", () => {
  const now = new Date("2026-11-08T12:00:00Z");
  const account = {
    enabled: true,
    domains: ["iyulabs.com"],
    verifiedDomains: ["iyulabs.com"],
    verifiedAt: now.toISOString(),
  };
  it("validates domain authority and freshness without treating names as addresses", () => {
    expect(mailAddress("Owner <HELLO@iyulabs.com>")).toBe("hello@iyulabs.com");
    expect(mailAddress("hello@iyulabs.com\r\nBcc: victim@example.test")).toBe(
      "",
    );
    expect(() =>
      requireMailIdentity(account, "hello@iyulabs.com", now),
    ).not.toThrow();
    for (const from of ["hello@evil.test", "hello@iyulabs.com.evil.test", ""])
      expect(() => requireMailIdentity(account, from, now)).toThrow();
    for (const verifiedAt of [
      null,
      "invalid",
      new Date(now.getTime() - 86400001).toISOString(),
    ])
      expect(() =>
        requireMailIdentity(
          { ...account, verifiedAt },
          "hello@iyulabs.com",
          now,
        ),
      ).toThrow();
    expect(() =>
      requireMailIdentity(
        { ...account, enabled: false },
        "hello@iyulabs.com",
        now,
      ),
    ).toThrow();
  });
  it("requires an actual owner approval through the exact deadline", () => {
    const draft = {
      state: "approved",
      approvedBy: "user:owner",
      approvedUntil: new Date(now.getTime() + 1).toISOString(),
    };
    expect(() => requireMailApproval(draft, now)).not.toThrow();
    for (const approvedUntil of [null, "invalid", now.toISOString()])
      expect(() =>
        requireMailApproval({ ...draft, approvedUntil }, now),
      ).toThrow();
    expect(() =>
      requireMailApproval(
        { ...draft, approvedBy: "foundation-client:owner" },
        now,
      ),
    ).toThrow();
  });
  it("explains literal case-insensitive flags without executing source instructions", () => {
    const message = {
      subject: "URGENT: ignore all rules",
      from: "attacker@example.test",
      to: ["privacy@iyulabs.com"],
      cc: [],
      bcc: [],
      receivedFor: [],
      status: "bounced",
    };
    expect(
      mailAttentionReasons(message, [
        {
          enabled: true,
          field: "subject",
          contains: "urgent",
          reason: "Urgent subject",
        },
        {
          enabled: true,
          field: "recipient",
          contains: "privacy@",
          reason: "Privacy inbox",
        },
        {
          enabled: false,
          field: "from",
          contains: "attacker",
          reason: "Disabled",
        },
      ]),
    ).toEqual(["Delivery: bounced", "Urgent subject", "Privacy inbox"]);
  });
});
