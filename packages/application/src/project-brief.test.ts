import { describe, expect, it } from "vitest";
import {
  assembleProjectBrief,
  createProjectBriefService,
  type ProjectBriefSnapshot,
} from "./project-brief";

const projectId = "99d0e203-80a0-47f1-bc4f-3c7cc26f79f3";
const taskId = "6413d449-cae4-41a8-9fb5-b7467a7c5cef";
const eventId = "1d2fa112-45a1-4550-8e43-5df97dcd501d";
const asOf = "2026-09-26T12:00:00.000Z";
const snapshot: ProjectBriefSnapshot = {
  asOf,
  project: {
    id: projectId,
    name: "Garden",
    summary: null,
    type: "general",
    lifecycle: "active",
    createdAt: asOf,
    updatedAt: asOf,
  },
  work: {
    items: [
      {
        id: taskId,
        projectId,
        sourceCaptureId: "2ff0230d-32e2-4417-8744-83b8b409bfa2",
        title: "Replace timer",
        description: "Check the wiring",
        status: "open",
        createdAt: asOf,
        updatedAt: asOf,
      },
    ],
    nextCursor: "41360909-b93b-44f6-8ea7-1d1a7f622a20",
  },
  knowledge: { items: [], nextCursor: null },
  decisions: {
    items: [
      {
        id: "edc86014-4890-42d7-8bb0-4c7217d9c929",
        projectId,
        question: "Which timer should we use?",
        outcome: "Keep the existing local timer",
        alternatives: "Buy a new controller",
        rationale: "The current device is repairable",
        status: "accepted",
        revision: 2,
        sourceLabel: "Manual local decision",
        createdAt: asOf,
        updatedAt: asOf,
      },
    ],
    nextCursor: null,
  },
  resources: {
    items: [
      {
        link: {
          id: "d6af880d-68a0-4287-a358-5682ca776f6e",
          type: "relates_to",
          inverseType: "relates_to",
          resource: {
            id: "e714c333-09a7-42cc-85f0-dfaf2b1395d3",
            kind: "device",
            name: "Timer",
            subtype: null,
            parentResourceId: null,
            state: null,
            externalUrl: null,
            lastObservedAt: null,
          },
        },
        linkedAt: asOf,
      },
    ],
    nextCursor: null,
  },
  events: {
    items: [
      {
        id: eventId,
        type: "monitor.down",
        summary: "Synthetic operational fixture: monitor reported down",
        severity: "critical",
        projectId,
        resourceId: "e714c333-09a7-42cc-85f0-dfaf2b1395d3",
        occurredAt: "2026-09-26T11:00:00.000Z",
        ingestedAt: asOf,
        sourceEnvelopeId: "7258ef04-177c-4e4d-b47e-7caf4ce582dc",
        sourceKind: "synthetic-operations",
        sourceLabel: "Synthetic operational fixture",
        isSynthetic: true,
        processingVersion: "synthetic-projection/v1",
        alertId: "114e46c5-060c-48bd-bb73-322328e49170",
        evidenceHref:
          "/api/v1/source-envelopes/7258ef04-177c-4e4d-b47e-7caf4ce582dc",
      },
    ],
    nextCursor: null,
  },
  attention: {
    items: [
      {
        id: "114e46c5-060c-48bd-bb73-322328e49170",
        state: "open",
        severity: "critical",
        ruleId: "synthetic.monitor.availability.v1",
        reason:
          "Synthetic monitor-down evidence opened this local attention condition.",
        projectId,
        resourceId: "e714c333-09a7-42cc-85f0-dfaf2b1395d3",
        firstObservedAt: "2026-09-26T11:00:00.000Z",
        lastObservedAt: "2026-09-26T11:00:00.000Z",
        recordedAt: "2026-09-26T11:05:00.000Z",
        resolvedAt: null,
        lastEventId: eventId,
        evidenceEventIds: [eventId],
        sourceKind: "synthetic-operations",
        sourceLabel: "Synthetic operational fixture",
        isSynthetic: true,
      },
    ],
    nextCursor: null,
  },
};

describe("project brief application", () => {
  it("identifies a revised note as current local knowledge rather than original capture text", () => {
    const noteId = "1503fef8-7a72-45dc-b47b-717e2b0aba53";
    const brief = assembleProjectBrief(
      {
        ...snapshot,
        knowledge: {
          items: [
            {
              id: noteId,
              projectId,
              sourceCaptureId: "f03427b8-37aa-44eb-9c81-5d120e5bff9b",
              kind: "note",
              title: "Current garden note",
              content: "Revised observation",
              version: 2,
              createdAt: asOf,
              updatedAt: asOf,
            },
          ],
          nextCursor: null,
        },
      },
      asOf,
    );
    expect(brief.sections.knowledge.items[0]).toMatchObject({
      sourceLabel: "Locally revised knowledge note",
      evidence: [
        {
          href: `/api/v1/knowledge-items/${noteId}`,
          sourceLabel: "Locally revised knowledge note",
        },
        {
          href: "/api/v1/captures/f03427b8-37aa-44eb-9c81-5d120e5bff9b",
          sourceLabel: "Manual local capture",
        },
      ],
    });
  });

  it("cites every factual statement and preserves event source, timing, and unknown health", () => {
    const brief = assembleProjectBrief(snapshot, asOf);
    expect(brief.method).toBe("deterministic-local-v1");
    expect(brief.state.evidence[0]?.href).toBe(`/api/v1/projects/${projectId}`);
    expect(brief.sections.work.items[0]?.evidence[0]?.href).toBe(
      `/api/v1/work-items/${taskId}`,
    );
    expect(brief.sections.work.nextCursor).toBe(snapshot.work.nextCursor);
    expect(brief.sections.resources.items[0]?.detail).toContain("unknown");
    expect(brief.sections.decisions.items[0]?.evidence[0]).toMatchObject({
      href: "/api/v1/decisions/edc86014-4890-42d7-8bb0-4c7217d9c929",
      sourceLabel: "Manual local decision",
      isSynthetic: false,
    });
    expect(brief.sections.activity.items[0]?.evidence[0]).toMatchObject({
      id: eventId,
      href: `/api/v1/events/${eventId}`,
      occurredAt: "2026-09-26T11:00:00.000Z",
      recordedAt: asOf,
      isSynthetic: true,
    });
    expect(brief.sections.activity.items[0]?.sourceLabel).toBe(
      "Synthetic operational fixture",
    );
    expect(brief.sections.attention.items[0]?.evidence[0]).toMatchObject({
      recordedAt: "2026-09-26T11:05:00.000Z",
      occurredAt: "2026-09-26T11:00:00.000Z",
    });
    expect(brief.nextActions.items[0]).toMatchObject({
      kind: "inference",
      ruleId: "open-work-review-v1",
    });
    expect(
      Object.values(brief.missing).every(
        (gap) => gap.status === "not_recorded",
      ),
    ).toBe(true);
  });

  it("does not claim empty pages mean the whole project has no records", async () => {
    const emptySnapshot: ProjectBriefSnapshot = {
      ...snapshot,
      work: { items: [], nextCursor: null },
      resources: { items: [], nextCursor: null },
      events: { items: [], nextCursor: null },
    };
    let requestedLimit = 0;
    const service = createProjectBriefService({
      readProjectSnapshot: async (_id, query) => {
        requestedLimit = query.limit;
        return emptySnapshot;
      },
    });
    const brief = await service.getBrief(projectId);
    expect(requestedLimit).toBe(5);
    expect(brief?.sections.work.emptyState).toContain("preview");
    expect(brief?.nextActions.items).toEqual([]);
    expect(brief?.nextActions.scope).toBe("preview_only");
  });
});
