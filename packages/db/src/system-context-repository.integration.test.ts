import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  createDomainPortfolioService,
  createProjectBriefService,
  createSystemContextService,
} from "@commandry/application";
import { createBriefRepository } from "./brief-repository";
import { createCatalogRepository } from "./catalog-repository";
import { createCaptureRepository } from "./capture-repository";
import { createDatabase } from "./client";
import { createDomainPortfolioRepository } from "./domain-portfolio-repository";
import { migrateDatabase } from "./migrate";
import { createSystemContextRepository } from "./system-context-repository";

const adminUrl = process.env.COMMANDRY_TEST_DATABASE_URL;
const runtimePassword = process.env.COMMANDRY_TEST_RUNTIME_PASSWORD;
if (!adminUrl || !runtimePassword)
  throw new Error("Run this file through pnpm test:integration");
const runtimeUrl = new URL(adminUrl);
runtimeUrl.username = "commandry_app_integration";
runtimeUrl.password = runtimePassword;

test(
  "systems connect domains, projects, and resources through auditable typed links without claiming live state",
  { timeout: 90_000 },
  async () => {
    await migrateDatabase({
      connectionString: adminUrl,
      migrationsDir: resolve(process.cwd(), "packages/db/migrations"),
    });
    const database = createDatabase({
      connectionString: runtimeUrl.toString(),
      max: 3,
    });
    try {
      const catalog = createCatalogRepository(database.db);
      const project = await catalog.createProject({
        id: crypto.randomUUID(),
        name: "System context project",
      });
      const resource = await catalog.createResource({
        id: crypto.randomUUID(),
        kind: "service",
        name: "System context service",
      });
      const domains = createDomainPortfolioService(
        createDomainPortfolioRepository(database.db),
      );
      const home = await domains.createDomain({ name: "System context home" });
      const systems = createSystemContextService(
        createSystemContextRepository(database.db),
      );
      const operated = await systems.createSystem({
        name: "Home automation",
        summary: "Operated local capability",
      });
      const spare = await systems.createSystem({ name: "Game hosting" });
      assert.equal(operated.domain, null);
      assert.equal(operated.lifecycle, "active");
      const firstPage = await systems.listSystems({ limit: 1 });
      assert.ok(firstPage.nextCursor);
      const secondPage = await systems.listSystems({
        limit: 1,
        cursor: firstPage.nextCursor,
      });
      assert.deepEqual(
        new Set(
          [...firstPage.items, ...secondPage.items].map((item) => item.id),
        ),
        new Set([operated.id, spare.id]),
      );
      const updated = await systems.updateSystem(operated.id, {
        expectedVersion: 1,
        summary: "Manually modeled home capability",
      });
      assert.equal(updated.version, 2);
      await assert.rejects(
        systems.updateSystem(operated.id, {
          expectedVersion: 1,
          name: "Stale",
        }),
        { code: "SYSTEM_STALE" },
      );
      const owned = await systems.setSystemDomain(operated.id, {
        domainId: home.id,
        expectedDomainId: null,
      });
      assert.equal(owned?.link.type, "owned_by");
      assert.equal(owned?.link.sourceKind, "system");
      assert.equal((await systems.getSystem(operated.id))?.domain?.id, home.id);
      assert.equal(
        (await systems.listDomainSystems(home.id, { limit: 1 })).items[0]?.id,
        operated.id,
      );
      await assert.rejects(
        domains.archiveDomain(home.id, { expectedVersion: home.version }),
        { code: "DOMAIN_HAS_SYSTEMS" },
      );
      const related = await systems.linkSystemProject(operated.id, project.id);
      assert.equal(related.link.type, "relates_to");
      assert.equal(
        (await systems.linkSystemProject(operated.id, project.id)).link.id,
        related.link.id,
      );
      const supported = await systems.linkSystemResource(
        operated.id,
        resource.id,
      );
      assert.equal(supported.link.type, "supports");
      assert.equal(supported.link.sourceKind, "resource");
      assert.equal(resource.state, null);
      assert.equal(resource.lastObservedAt, null);
      assert.equal(
        (await systems.listProjectSystems(project.id, { limit: 1 })).items[0]
          ?.system.id,
        operated.id,
      );
      assert.equal(
        (await systems.listResourceSystems(resource.id, { limit: 1 })).items[0]
          ?.system.id,
        operated.id,
      );
      const brief = await createProjectBriefService(
        createBriefRepository(database.db),
      ).getBrief(project.id);
      assert.ok(brief);
      assert.equal(brief.sections.systems?.items[0]?.title, "Home automation");
      assert.ok(
        brief.sections.systems?.items[0]?.evidence.some(
          (item) =>
            item.kind === "system_project_link" &&
            item.id === related.link.id &&
            item.href === `/api/v1/system-project-links/${related.link.id}`,
        ),
      );
      const search = createCaptureRepository(database.db);
      const scoped = await search.search({
        q: "automation",
        projectId: project.id,
        limit: 10,
      });
      assert.ok(
        scoped.items.some(
          (item) =>
            item.kind === "system" &&
            item.id === operated.id &&
            item.href === `/systems/${operated.id}`,
        ),
      );
      const unrelated = await search.search({
        q: "Game hosting",
        projectId: project.id,
        limit: 10,
      });
      assert.ok(!unrelated.items.some((item) => item.kind === "system"));
      await assert.rejects(
        systems.archiveSystem(operated.id, {
          expectedVersion: updated.version,
        }),
        { code: "SYSTEM_HAS_LINKS" },
      );
      const archivedProject = await systems.archiveSystemProjectLink(
        related.link.id,
      );
      assert.equal(archivedProject.lifecycle, "archived");
      assert.equal(
        (await systems.getSystemProjectLink(related.link.id))?.lifecycle,
        "archived",
      );
      const archivedResource = await systems.archiveSystemResourceLink(
        supported.link.id,
      );
      assert.equal(archivedResource.lifecycle, "archived");
      await systems.setSystemDomain(operated.id, {
        domainId: null,
        expectedDomainId: home.id,
      });
      assert.equal(
        (await systems.getSystemDomainLink(owned!.link.id))?.lifecycle,
        "archived",
      );
      const archivedSystem = await systems.archiveSystem(operated.id, {
        expectedVersion: updated.version,
      });
      assert.equal(archivedSystem.lifecycle, "archived");
      await assert.rejects(
        systems.linkSystemResource(operated.id, resource.id),
        { code: "SYSTEM_ARCHIVED" },
      );
      assert.equal(
        (
          await domains.archiveDomain(home.id, {
            expectedVersion: home.version,
          })
        ).lifecycle,
        "archived",
      );
      const auditIds = new Set<string>();
      let cursor: string | undefined;
      do {
        const page = await systems.listSystemAudit(operated.id, {
          limit: 2,
          cursor,
        });
        for (const event of page.items) auditIds.add(event.id);
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      assert.equal(auditIds.size, 9);
      await assert.rejects(
        database.pool.query("delete from system_project_link where id = $1", [
          related.link.id,
        ]),
        /cannot be deleted/,
      );
      await assert.rejects(
        database.pool.query(
          "update system_audit_event set operation = 'system.updated' where id = $1",
          [[...auditIds][0]],
        ),
        /immutable/,
      );
    } finally {
      await database.close();
    }
  },
);
