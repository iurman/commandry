import { z } from "zod";

const id = z.uuid();
const header = (max = 1000) =>
  z
    .string()
    .max(max)
    .refine((s) => !/[\r\n\0]/.test(s), "Invalid header");
export const mailAddressSchema = z
  .email()
  .max(320)
  .transform((s) => s.toLowerCase());
export const mailDirectionSchema = z.enum(["received", "sent"]);
export const mailRuleSchema = z.strictObject({
  id,
  field: z.enum(["subject", "from", "recipient"]),
  contains: z.string().trim().min(1).max(200),
  reason: z.string().trim().min(1).max(300),
  enabled: z.boolean(),
});
export type MailRule = z.infer<typeof mailRuleSchema>;
export const mailMetadataSchema = z.object({
  externalId: id,
  direction: mailDirectionSchema,
  from: header(),
  to: z.array(header()).max(100),
  cc: z.array(header()).max(100).default([]),
  bcc: z.array(header()).max(100).default([]),
  replyTo: z.array(header()).max(100).default([]),
  receivedFor: z.array(header()).max(100).default([]),
  subject: header(2000),
  occurredAt: z.iso.datetime({ offset: true }),
  messageId: header().nullable(),
  inReplyTo: header().nullable().default(null),
  references: z.array(header()).max(100).default([]),
  status: header(100),
  attachmentCount: z.number().int().min(0).nullable().default(null),
});
export type MailMetadata = z.infer<typeof mailMetadataSchema>;
export type MailMessage = MailMetadata & {
  id: string;
  version: number;
  accountId: string;
  unread: boolean;
  attention: "open" | "reviewed" | "resolved";
  reasons: string[];
  annotation: {
    summary: string;
    actorId: string;
    at: string;
    verification: "unverified";
  } | null;
};
export const mailPageQuerySchema = z.strictObject({
  accountId: id.optional(),
  domain: z
    .string()
    .regex(/^[a-z0-9.-]+$/)
    .max(253)
    .optional(),
  address: mailAddressSchema.optional(),
  direction: mailDirectionSchema.optional(),
  view: z.enum(["all", "unread", "attention"]).default("all"),
  q: z.string().max(200).default(""),
  cursor: z.string().max(2000).nullable().default(null),
  limit: z.number().int().min(1).max(100).default(30),
  threadMessageId: header().optional(),
});
export type MailPageQuery = z.infer<typeof mailPageQuerySchema>;
export type MailPage<T> = { items: T[]; nextCursor: string | null };
export type MailCounts = {
  received: number;
  sent: number;
  unread: number;
  attention: number;
};
export type MailInbox = MailCounts & {
  accountId: string;
  address: string;
  domain: string;
};
export type MailAccount = {
  id: string;
  projectId: string;
  name: string;
  provider: "resend";
  domains: string[];
  verifiedDomains: string[];
  verifiedAt: string | null;
  enabled: boolean;
  lastSyncedAt: string | null;
  error: string | null;
  receivedComplete: boolean;
  sentComplete: boolean;
  receivedCursor: string | null;
  sentCursor: string | null;
  retentionDays: number;
  pendingEvents: number;
  failedEvents: number;
};
export const mailDraftInputSchema = z.strictObject({
  accountId: id,
  from: mailAddressSchema,
  to: z.array(mailAddressSchema).min(1).max(50),
  cc: z.array(mailAddressSchema).max(50).default([]),
  bcc: z.array(mailAddressSchema).max(50).default([]),
  subject: header(998).min(1),
  text: z.string().min(1).max(100000),
  replyToId: id.nullable().default(null),
  supersedesId: id.nullable().default(null),
});
export type MailDraftInput = z.infer<typeof mailDraftInputSchema>;
export type MailDraft = MailDraftInput & {
  id: string;
  createdBy: string;
  createdAt: string;
  state:
    | "draft"
    | "approved"
    | "queued"
    | "sending"
    | "accepted"
    | "failed"
    | "uncertain"
    | "superseded";
  approvedBy: string | null;
  approvedUntil: string | null;
  providerId: string | null;
  error: string | null;
  attemptedAt: string | null;
  inReplyTo: string | null;
  references: string[];
};
export const mailTriageSchema = z
  .strictObject({
    id,
    expectedVersion: z.number().int().positive(),
    unread: z.boolean().optional(),
    attention: z.enum(["open", "reviewed", "resolved"]).optional(),
    summary: z.string().max(8000).optional(),
  })
  .refine(
    (v) =>
      v.unread !== undefined ||
      v.attention !== undefined ||
      v.summary !== undefined,
    "Change required",
  );
export type MailTriage = z.infer<typeof mailTriageSchema>;
export const mailReadSchema = z.strictObject({
  id,
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(32000).default(32000),
});
export const mailIdSchema = z.strictObject({ id });
export const mailAttachmentQuerySchema = z.strictObject({
  id,
  attachmentId: id.optional(),
  cursor: z.string().max(200).nullable().default(null),
});
export const mailCreateAccountSchema = z.strictObject({
  projectId: id,
  name: z.string().trim().min(1).max(100),
});
export const mailRulesInputSchema = z.strictObject({
  accountId: id,
  expectedVersion: z.number().int().min(0),
  rules: z.array(mailRuleSchema).max(100),
});
export const mailJobSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("reconcile"),
    accountId: id,
    direction: mailDirectionSchema,
  }),
  z.strictObject({ kind: z.literal("send"), id }),
  z.strictObject({
    kind: z.literal("hydrate"),
    accountId: id,
    externalId: id,
    direction: mailDirectionSchema,
  }),
]);
export type MailJob = z.infer<typeof mailJobSchema>;
export type MailAttachment = {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  contentId?: string;
  disposition?: "inline" | "attachment";
  downloadUrl?: string;
  expiresAt?: string;
};
export type MailContent = {
  text: string | null;
  html: string | null;
  headers: Record<string, string>;
  metadata: MailMetadata;
};
export type MailReadResult = {
  message: MailMessage;
  content: {
    text: string | null;
    html: string | null;
    headers: Record<string, string>;
    offset: number;
    nextOffset: number | null;
    totalCharacters: number;
  };
  source: "provider" | "provider-index";
  availability: "available" | "unavailable";
  unavailableReason?: string;
  untrusted: true;
};
export const MAIL_DOMAINS = [
  "iyulabs.com",
  "aviune.com",
  "resupals.com",
  "freeresumetools.com",
  "atsresumetools.com",
  "sensitiv.app",
  "tomeandquill.com",
] as const;

export type MailOverview = {
  counts: MailCounts;
  domains: (MailCounts & { domain: string; accountId: string })[];
  recent: MailPage<MailMessage>;
  accounts: MailAccount[];
  population: string;
  asOf: string;
};
