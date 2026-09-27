import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  createDomainPortfolioService,
  createProjectBriefService,
} from "@commandry/application";
import { createBriefRepository } from "./brief-repository";
import { createCatalogRepository } from "./catalog-repository";
import { createCaptureRepository } from "./capture-repository";
import { createDatabase } from "./client";
import { createDomainPortfolioRepository } from "./domain-portfolio-repository";
import { migrateDatabase } from "./migrate";

const adminUrl = process.env.COMMANDRY_TEST_DATABASE_URL;
const runtimePassword = process.env.COMMANDRY_TEST_RUNTIME_PASSWORD;
if (!adminUrl || !runtimePassword)
  throw new Error("Run this file through pnpm test:integration");
const runtimeUrl = new URL(adminUrl);
runtimeUrl.username = "commandry_app_integration";
runtimeUrl.password = runtimePassword;

test(
  "domains remain distinct from projects while typed membership, brief evidence, and audit survive moves",
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
      const projectA = await catalog.createProject({
        id: crypto.randomUUID(),
        name: "Domain membership project A",
      });
      const projectB = await catalog.createProject({
        id: crypto.randomUUID(),
        name: "Domain membership project B",
      });
      const portfolio = createDomainPortfolioService(
        createDomainPortfolioRepository(database.db),
      );
      const home = await portfolio.createDomain({
        name: "Home",
        description: "Operated home context",
      });
      const software = await portfolio.createDomain({ name: "Software" });
      assert.equal(home.lifecycle, "active");
      assert.equal(home.version, 1);
      const firstDomainPage = await portfolio.listDomains({ limit: 1 });
      assert.equal(firstDomainPage.items.length, 1);
      assert.ok(firstDomainPage.nextCursor);
      const secondDomainPage = await portfolio.listDomains({
        limit: 1,
        cursor: firstDomainPage.nextCursor,
      });
      assert.equal(secondDomainPage.items.length, 1);
      assert.equal(secondDomainPage.nextCursor, null);
      assert.deepEqual(
        new Set(
          [...firstDomainPage.items, ...secondDomainPage.items].map(
            (item) => item.id,
          ),
        ),
        new Set([home.id, software.id]),
      );
      const updated = await portfolio.updateDomain(home.id, {
        expectedVersion: 1,
        name: "Household",
      });
      assert.equal(updated.version, 2);
      await assert.rejects(
        portfolio.updateDomain(home.id, {
          expectedVersion: 1,
          name: "Stale change",
        }),
        { code: "DOMAIN_STALE" },
      );
      const firstLink = await portfolio.setProjectDomain(projectA.id, {
        domainId: home.id,
        expectedDomainId: null,
      });
      assert.ok(firstLink);
      assert.equal(firstLink?.domain.name, "Household");
      assert.equal(firstLink?.link.type, "owned_by");
      assert.equal(firstLink?.link.inverseType, "owns");
      assert.equal(firstLink?.link.sourceKind, "project");
      assert.equal(firstLink?.link.targetKind, "domain");
      assert.equal(firstLink?.link.provenance, "manual");
      const scopedSearch = await createCaptureRepository(database.db).search({
        q: "Household",
        projectId: projectA.id,
        limit: 10,
      });
      assert.ok(
        scopedSearch.items.some(
          (item) =>
            item.kind === "domain" &&
            item.id === home.id &&
            item.href === `/domains/${home.id}`,
        ),
      );
      await assert.rejects(
        portfolio.setProjectDomain(projectA.id, {
          domainId: software.id,
          expectedDomainId: null,
        }),
        { code: "PROJECT_DOMAIN_STALE" },
      );
      await assert.rejects(
        portfolio.archiveDomain(home.id, { expectedVersion: updated.version }),
        { code: "DOMAIN_HAS_PROJECTS" },
      );
      const brief = await createProjectBriefService(
        createBriefRepository(database.db),
      ).getBrief(projectA.id);
      assert.ok(brief);
      assert.match(brief.state.text, /Owned by domain Household/);
      assert.ok(
        brief.state.evidence.some(
          (item) =>
            item.kind === "project_domain_link" &&
            item.id === firstLink?.link.id &&
            item.href === `/api/v1/project-domain-links/${firstLink.link.id}`,
        ),
      );
      const moved = await portfolio.setProjectDomain(projectA.id, {
        domainId: software.id,
        expectedDomainId: home.id,
      });
      assert.equal(moved?.domain.id, software.id);
      const oldDomainSearch = await createCaptureRepository(database.db).search(
        {
          q: "Household",
          projectId: projectA.id,
          limit: 10,
        },
      );
      assert.ok(
        !oldDomainSearch.items.some(
          (item) => item.kind === "domain" && item.id === home.id,
        ),
      );
      assert.equal(
        (await portfolio.getProjectDomainLink(firstLink!.link.id))?.lifecycle,
        "archived",
      );
      assert.ok(
        (await portfolio.getProjectDomainLink(firstLink!.link.id))?.archivedAt,
      );
      const secondLink = await portfolio.setProjectDomain(projectB.id, {
        domainId: software.id,
        expectedDomainId: null,
      });
      assert.ok(secondLink);
      const firstProjectPage = await portfolio.listDomainProjects(software.id, {
        limit: 1,
      });
      assert.equal(firstProjectPage.items.length, 1);
      assert.ok(firstProjectPage.nextCursor);
      const secondProjectPage = await portfolio.listDomainProjects(
        software.id,
        {
          limit: 1,
          cursor: firstProjectPage.nextCursor,
        },
      );
      assert.deepEqual(
        new Set(
          [...firstProjectPage.items, ...secondProjectPage.items].map(
            (item) => item.id,
          ),
        ),
        new Set([projectA.id, projectB.id]),
      );
      const noOwner = await portfolio.setProjectDomain(projectA.id, {
        domainId: null,
        expectedDomainId: software.id,
      });
      assert.equal(noOwner, null);
      assert.equal(await portfolio.getProjectDomain(projectA.id), null);
      const archived = await portfolio.archiveDomain(home.id, {
        expectedVersion: updated.version,
      });
      assert.equal(archived.lifecycle, "archived");
      await assert.rejects(
        portfolio.setProjectDomain(projectA.id, {
          domainId: home.id,
          expectedDomainId: null,
        }),
        { code: "DOMAIN_ARCHIVED" },
      );
      const seenAuditIds = new Set<string>();
      let cursor: string | undefined;
      do {
        const page = await portfolio.listDomainAudit(software.id, {
          limit: 1,
          cursor,
        });
        for (const item of page.items) seenAuditIds.add(item.id);
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      assert.equal(seenAuditIds.size, 4);
      const auditId = [...seenAuditIds][0]!;
      await assert.rejects(
        database.pool.query(
          "update domain_audit_event set operation = 'domain.updated' where id = $1",
          [auditId],
        ),
        /immutable/,
      );
      await assert.rejects(
        database.pool.query("delete from project_domain_link where id = $1", [
          firstLink!.link.id,
        ]),
        /cannot be deleted/,
      );
    } finally {
      await database.close();
    }
  },
);
