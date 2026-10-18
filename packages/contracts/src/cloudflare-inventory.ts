import { z } from "zod";

export const cloudflareInventoryKindSchema = z.enum([
  "zone",
  "worker",
  "pages",
  "tunnel",
  "registration",
]);
export const cloudflareInventoryItemSchema = z.strictObject({
  id: z.string().min(1).max(250),
  name: z.string().trim().min(1).max(500),
  kind: cloudflareInventoryKindSchema,
  externalUrl: z
    .url()
    .refine((value) =>
      ["https://dash.cloudflare.com", "https://ap.www.namecheap.com"].includes(
        new URL(value).origin,
      ),
    ),
  state: z.string().min(1).max(100).nullable(),
  expirationDate: z
    .union([z.iso.datetime({ offset: true }), z.iso.date()])
    .nullable(),
  autoRenew: z.boolean().nullable(),
});
export const cloudflareInventorySectionSchema = z
  .strictObject({
    kind: cloudflareInventoryKindSchema,
    state: z.enum(["available", "inaccessible", "unavailable"]),
    readAt: z.iso.datetime({ offset: true }),
    complete: z.boolean(),
    errorCode: z.string().max(100).nullable(),
    items: z.array(cloudflareInventoryItemSchema),
  })
  .superRefine((value, context) => {
    if (
      new Set(value.items.map((item) => item.id)).size !== value.items.length ||
      value.items.some((item) => item.kind !== value.kind) ||
      (value.state === "available"
        ? !value.complete || value.errorCode !== null
        : value.complete ||
          value.errorCode === null ||
          value.items.length !== 0)
    )
      context.addIssue({
        code: "custom",
        message: "Inventory section identity or completeness mismatch",
      });
  });
export const cloudflareInventoryEvidenceSchema = z
  .strictObject({
    provider: z.literal("cloudflare"),
    accountId: z.string().regex(/^[a-f0-9]{32}$/),
    readAt: z.iso.datetime({ offset: true }),
    sections: z.array(cloudflareInventorySectionSchema).length(5),
  })
  .superRefine((value, context) => {
    if (
      new Set(value.sections.map((section) => section.kind)).size !== 5 ||
      value.sections.some((section) =>
        section.items.some(
          (item) =>
            !item.externalUrl.startsWith(
              `https://dash.cloudflare.com/${value.accountId}/`,
            ),
        ),
      )
    )
      context.addIssue({
        code: "custom",
        message:
          "Inventory must retain the exact account and all supported sections",
      });
  });
export type CloudflareInventoryEvidence = z.infer<
  typeof cloudflareInventoryEvidenceSchema
>;

export const namecheapInventoryEvidenceSchema = z
  .strictObject({
    provider: z.literal("namecheap"),
    accountId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
    readAt: z.iso.datetime({ offset: true }),
    sections: z
      .array(
        cloudflareInventorySectionSchema.safeExtend({
          kind: z.literal("registration"),
        }),
      )
      .length(1),
  })
  .superRefine((value, context) => {
    if (
      value.sections.some((section) =>
        section.items.some(
          (item) =>
            item.externalUrl !==
            `https://ap.www.namecheap.com/domains/domaincontrolpanel/${encodeURIComponent(item.name)}/domain`,
        ),
      )
    )
      context.addIssue({
        code: "custom",
        message: "Registrar inventory links must match exact domain identities",
      });
  });
export const providerInventoryEvidenceSchema = z.discriminatedUnion(
  "provider",
  [cloudflareInventoryEvidenceSchema, namecheapInventoryEvidenceSchema],
);
