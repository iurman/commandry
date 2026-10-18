import { providerInventoryEvidenceSchema } from "@commandry/contracts";

/** Only complete supported sections can contribute canonical inventory. No health inference. */
export function projectProviderInventoryResources(
  raw: unknown,
  expectedAccountId?: string,
) {
  const inventory = providerInventoryEvidenceSchema.parse(raw);
  if (
    expectedAccountId !== undefined &&
    inventory.accountId !== expectedAccountId
  )
    throw new Error("Inventory account identity mismatch");
  return inventory.sections.flatMap((section) =>
    section.state === "available" && section.complete
      ? section.items.map((item) => ({
          externalKey: `${inventory.provider}:${inventory.accountId}:${section.kind}:${item.id}`,
          name:
            section.kind === "zone"
              ? `${item.name} DNS`
              : section.kind === "worker"
                ? `${item.name} / Cloudflare Worker`
                : item.name,
          kind:
            section.kind === "zone"
              ? "dns-zone"
              : section.kind === "registration"
                ? "domain"
                : section.kind === "tunnel"
                  ? "service"
                  : "deployment",
          subtype: `${inventory.provider}-${section.kind}`,
          externalUrl: item.externalUrl,
          observedAt: section.readAt,
        }))
      : [],
  );
}
