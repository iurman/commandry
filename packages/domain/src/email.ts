/** Email content and classifications never confer authority. */
export class MailError extends Error {
  constructor(
    public readonly code:
      | "NOT_FOUND"
      | "FORBIDDEN"
      | "UNAVAILABLE"
      | "VERSION_CONFLICT"
      | "APPROVAL_REQUIRED"
      | "IDENTITY_UNVERIFIED"
      | "RECONCILIATION_REQUIRED"
      | "INVALID_INPUT",
    message = code,
  ) {
    super(message);
  }
}
export function mailAddress(value: string): string {
  const bare = (value.match(/<([^<>]+)>/)?.[1] ?? value).trim().toLowerCase();
  return /^[^\s<>@,;]+@[^\s<>@,;]+$/.test(bare) && !/[\r\n\0]/.test(value)
    ? bare
    : "";
}
export function mailDomain(value: string): string {
  return mailAddress(value).split("@")[1] ?? "";
}
export function mailAttentionReasons(
  message: {
    subject: string;
    from: string;
    to: string[];
    cc: string[];
    bcc: string[];
    receivedFor: string[];
    status: string;
  },
  rules: readonly {
    enabled: boolean;
    field: "subject" | "from" | "recipient";
    contains: string;
    reason: string;
  }[],
): string[] {
  const reasons = new Set<string>();
  if (
    [
      "bounced",
      "failed",
      "complained",
      "suppressed",
      "delivery_delayed",
    ].includes(message.status)
  )
    reasons.add(`Delivery: ${message.status}`);
  for (const rule of rules) {
    const field =
      rule.field === "recipient"
        ? [
            ...message.to,
            ...message.cc,
            ...message.bcc,
            ...message.receivedFor,
          ].join(" ")
        : message[rule.field];
    if (
      rule.enabled &&
      field.toLowerCase().includes(rule.contains.toLowerCase())
    )
      reasons.add(rule.reason);
  }
  return [...reasons];
}
export function requireMailIdentity(
  account: {
    enabled: boolean;
    domains: string[];
    verifiedDomains: string[];
    verifiedAt: string | null;
  },
  from: string,
  now: Date,
): void {
  const domain = mailDomain(from);
  if (
    !account.enabled ||
    !domain ||
    !account.domains.includes(domain) ||
    !account.verifiedDomains.includes(domain) ||
    !account.verifiedAt ||
    !Number.isFinite(Date.parse(account.verifiedAt)) ||
    !Number.isFinite(now.getTime()) ||
    now.getTime() - Date.parse(account.verifiedAt) > 86400000
  )
    throw new MailError("IDENTITY_UNVERIFIED");
}
export function requireMailApproval(
  draft: {
    approvedBy: string | null;
    approvedUntil: string | null;
    state: string;
  },
  now: Date,
) {
  if (
    !draft.approvedBy?.startsWith("user:") ||
    !draft.approvedUntil ||
    !Number.isFinite(Date.parse(draft.approvedUntil)) ||
    !Number.isFinite(now.getTime()) ||
    Date.parse(draft.approvedUntil) <= now.getTime() ||
    !["approved", "queued", "sending"].includes(draft.state)
  )
    throw new MailError("APPROVAL_REQUIRED");
}
export const MAIL_ACTION_POLICIES = {
  read: {
    capability: "mail.read",
    risk: "read-only",
    approval: "issued scope",
    audit: "mail.read",
  },
  triage: {
    capability: "mail.triage",
    risk: "reversible",
    approval: "issued scope",
    audit: "mail.triage",
  },
  draft: {
    capability: "mail.draft",
    risk: "reversible",
    approval: "issued scope",
    audit: "mail.draft",
  },
  send: {
    capability: "mail.send",
    risk: "sensitive",
    approval: "exact immutable draft, owner, expiry",
    audit: "mail.send.queued",
  },
} as const;
