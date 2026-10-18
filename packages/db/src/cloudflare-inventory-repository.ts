import { and, eq, sql } from "drizzle-orm";
import { foundationDigest } from "@commandry/domain";
import { projectProviderInventoryResources } from "@commandry/application";
import type { CommandryDatabase } from "./client";
import { observatoryInventoryResource } from "./observatory-schema";
import { resource, projectResourceLink } from "./schema";

type Transaction = Parameters<
  Parameters<CommandryDatabase["transaction"]>[0]
>[0];
const identity = (key: string) => {
  const hash = foundationDigest({ providerInventoryIdentity: key });
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
};

/** Same source-lease transaction as encrypted observation/audit; never erases absent inventory. */
export async function reconcileProviderInventory(
  tx: Transaction,
  binding: {
    id: string;
    resourceId: string;
    projectId: string | null;
    externalId: string;
    kind: string;
  },
  details: unknown,
) {
  const provider = (details as { provider?: unknown }).provider;
  if (
    provider !==
    (binding.kind === "cloudflare-account" ? "cloudflare" : "namecheap")
  )
    throw new Error("Inventory provider identity mismatch");
  if (!binding.projectId) throw new Error("Inventory project binding required");
  const desired = projectProviderInventoryResources(
    details,
    binding.externalId,
  );
  const resourceIds: string[] = [];
  // Serialize matching/adoption across separately reviewed sources for this provider.
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`provider-inventory:${binding.resourceId}`}, 0))`,
  );
  for (const item of desired) {
    const [mapping] = await tx
      .select()
      .from(observatoryInventoryResource)
      .where(eq(observatoryInventoryResource.externalKey, item.externalKey));
    let canonicalId = mapping?.resourceId;
    if (!canonicalId) {
      const matches = await tx
        .select()
        .from(resource)
        .where(
          and(
            eq(resource.kind, item.kind),
            eq(resource.externalUrl, item.externalUrl),
          ),
        )
        .for("share");
      if (matches.length > 1)
        throw new Error("Inventory identity needs owner reconciliation");
      canonicalId = matches[0]?.id ?? identity(item.externalKey);
      if (!matches.length)
        await tx
          .insert(resource)
          .values({
            id: canonicalId,
            kind: item.kind,
            name: item.name,
            subtype: item.subtype,
            externalUrl: item.externalUrl,
            parentResourceId: binding.resourceId,
            lastObservedAt: new Date(item.observedAt),
          })
          .onConflictDoNothing();
    }
    const [canonical] = await tx
      .select()
      .from(resource)
      .where(eq(resource.id, canonicalId))
      .for("update");
    if (!canonical || canonical.kind !== item.kind)
      throw new Error("Inventory resource identity mismatch");
    resourceIds.push(canonicalId);
    await tx
      .update(resource)
      .set({
        lastObservedAt: new Date(item.observedAt),
        ...(mapping && canonical.name === mapping.providerName
          ? { name: item.name }
          : {}),
        ...(mapping && canonical.externalUrl === mapping.providerUrl
          ? { externalUrl: item.externalUrl }
          : {}),
      })
      .where(eq(resource.id, canonicalId));
    const row = {
      externalKey: item.externalKey,
      sourceId: binding.id,
      resourceId: canonicalId,
      providerName: item.name,
      providerUrl: item.externalUrl,
      lastSeenAt: new Date(item.observedAt),
    };
    await tx
      .insert(observatoryInventoryResource)
      .values(row)
      .onConflictDoUpdate({
        target: observatoryInventoryResource.externalKey,
        set: row,
      });
    const [link] = await tx
      .select({ id: projectResourceLink.id })
      .from(projectResourceLink)
      .where(
        and(
          eq(projectResourceLink.projectId, binding.projectId),
          eq(projectResourceLink.resourceId, canonicalId),
          eq(projectResourceLink.lifecycle, "active"),
        ),
      );
    if (!link)
      await tx
        .insert(projectResourceLink)
        .values({
          id: identity(`link:${binding.projectId}:${canonicalId}`),
          projectId: binding.projectId,
          resourceId: canonicalId,
          type: "relates_to",
          sourceKind: "project",
          targetKind: "resource",
          lifecycle: "active",
        })
        .onConflictDoNothing();
  }
  return resourceIds;
}
