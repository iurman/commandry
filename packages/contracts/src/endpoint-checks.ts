import { z } from "zod";

const common = {
  id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,199}$/),
  resourceId: z.uuid(),
  environment: z.string().trim().min(1).max(100).nullable(),
  vantage: z.string().trim().min(1).max(200),
  timeoutMs: z.number().int().min(100).max(30000).default(5000),
};
export const endpointCheckCatalogueSchema = z.strictObject({
  schemaVersion: z.literal(1),
  checks: z
    .array(
      z.discriminatedUnion("protocol", [
        z.strictObject({
          ...common,
          protocol: z.literal("http"),
          url: z
            .url()
            .max(2000)
            .refine((raw) => {
              const url = new URL(raw);
              return (
                ["http:", "https:"].includes(url.protocol) &&
                !url.username &&
                !url.password &&
                !url.search &&
                !url.hash &&
                !/[\s\\]/.test(raw)
              );
            }),
          acceptedStatuses: z
            .array(z.number().int().min(200).max(599))
            .min(1)
            .refine((values) => new Set(values).size === values.length),
        }),
        z.strictObject({
          ...common,
          protocol: z.literal("tcp"),
          host: z
            .string()
            .min(1)
            .max(253)
            .regex(/^[a-zA-Z0-9.:-]+$/),
          port: z.number().int().min(1).max(65535),
        }),
      ]),
    )
    .refine(
      (checks) =>
        new Set(checks.map((check) => check.id)).size === checks.length,
    ),
});
export type EndpointCheckCatalogue = z.infer<
  typeof endpointCheckCatalogueSchema
>;
