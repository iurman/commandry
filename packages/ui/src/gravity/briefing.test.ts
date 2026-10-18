import { describe, expect, it } from "vitest";
import {
  mixedObservatoryFixture,
  observatoryFixtureId,
  operationalObservatoryFixture,
  projectObservatory,
} from "@commandry/test-support";
import { briefingAge, observatoryBriefing } from "./briefing";
import { OperationalLayout } from "./operational-layout";
import { defaultObservatoryPreferences } from "./observatory-preferences";

const options = defaultObservatoryPreferences();

describe("observatory briefing", () => {
  it("summarises the landscape with its primary groups in visiting order", () => {
    const scene = projectObservatory(mixedObservatoryFixture());
    const { primaryGroupIds } = new OperationalLayout().project(scene, options);
    const briefing = observatoryBriefing(scene, [], null, primaryGroupIds);
    expect(briefing).toMatchObject({
      subjectId: null,
      title: "Complete authorized landscape",
      headline: `${primaryGroupIds.length} primary groups, 91 unique resources.`,
    });
    expect(briefing.groups).toHaveLength(1);
    expect(briefing.groups[0]!.items.map((item) => item.id)).toEqual(
      primaryGroupIds,
    );
    // No check is monitored: it is said so, never called healthy.
    expect(briefing.facts[0]).toMatch(/^No availability checks/);
    expect(briefing.facts.join(" ")).not.toMatch(/healthy|passing/);
  });

  it("organises a repository collection by project links and nested collections, naming every repository", () => {
    const scene = projectObservatory(mixedObservatoryFixture());
    const repositories = scene.representations.find(
      (node) => node.kind === "collection" && node.label === "Repositories",
    )!;
    const briefing = observatoryBriefing(scene, [], repositories.id);
    expect(briefing.headline).toBe(
      "60 repositories: 12 linked to projects, 48 unmapped.",
    );
    expect(
      briefing.groups.map((group) => [group.title, group.items.length]),
    ).toEqual([
      ["Project repositories", 12],
      ["Unmapped repositories", 48],
    ]);
    const named = briefing.groups.flatMap((group) =>
      group.items.map((item) => item.id),
    );
    expect(new Set(named).size).toBe(60);
    expect(
      briefing.groups[0]!.items.every((item) => item.kind === "repository"),
    ).toBe(true);
    // Unmapped repositories carry no claim about deployment or activity.
    expect(
      briefing.groups[1]!.items.every((item) => item.note === undefined),
    ).toBe(true);
    const unmapped = scene.representations.find(
      (node) => node.label === "Unmapped repositories",
    )!;
    expect(observatoryBriefing(scene, [], unmapped.id).headline).toBe(
      "48 repositories: all unmapped.",
    );
  });

  it("lists reviewed deployments, names an issue on the member that carries it and orders recent activity", () => {
    const input = operationalObservatoryFixture();
    const scene = projectObservatory(input);
    const collection = scene.representations.find(
      (node) => node.kind === "collection" && node.label === "Repositories",
    )!;
    const repositories = observatoryBriefing(scene, [], collection.id);
    expect(repositories.groups[0]!.title).toBe("Deployed (reviewed relation)");
    expect(repositories.groups[0]!.items.length).toBeGreaterThan(0);
    expect(
      repositories.groups[0]!.items.every((item) =>
        item.note?.startsWith("deploys "),
      ),
    ).toBe(true);
    expect(repositories.headline).toMatch(/with a reviewed deployment/);

    const landscape = observatoryBriefing(scene, [], null);
    const database = landscape.issues.filter(
      (issue) => issue.text === "Required check failing",
    );
    expect(database.map((issue) => issue.label)).toEqual([
      "Synthetic Shared database",
    ]);
    expect(database[0]!.tone).toBe("impact");
    expect(landscape.issues[0]!.tone).toBe("impact");

    const host = scene.representations.find(
      (node) => node.kind === "host" && node.label === "Synthetic host 40003",
    )!;
    const service = scene.representations.find(
      (node) => node.label === "Synthetic API" && !node.referenceTo,
    )!;
    const event = (index: number, minutes: number) => ({
      id: observatoryFixtureId(70000 + index),
      resourceId: service.resourceId,
      summary: `Event ${index}`,
      occurredAt: new Date(
        Date.parse(scene.evaluatedAt) - minutes * 60000,
      ).toISOString(),
      sourceLabel: "Fixture",
      evidenceHref: `/api/v1/source-envelopes/${observatoryFixtureId(71000 + index)}`,
    });
    const briefing = observatoryBriefing(
      scene,
      [event(1, 300), event(2, 5), event(3, 90), event(4, 3000)],
      host.id,
    );
    expect(briefing.activity.map((item) => item.summary)).toEqual([
      "Event 2",
      "Event 3",
      "Event 1",
    ]);
    expect(briefing.activity.map((item) => item.age)).toEqual([
      "5 min ago",
      "2 h ago",
      "5 h ago",
    ]);
    expect(briefing.activity[0]!.subjectId).toBe(service.id);
    expect(briefing.groups.map((group) => group.title)).toContain("Services");
    expect(briefing.facts[0]).toMatch(/observed checks? passing; 1 failing/);
  });

  it("states ages relative to the scene evaluation", () => {
    const now = "2026-10-16T12:00:00.000Z";
    expect(briefingAge("2026-10-16T11:59:40.000Z", now)).toBe("just now");
    expect(briefingAge("2026-10-14T12:00:00.000Z", now)).toBe("2 d ago");
    expect(briefingAge("not a time", now)).toBe("");
  });
});
