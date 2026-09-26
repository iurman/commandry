import type { Meta, StoryObj } from "@storybook/react";
import {
  ExecutionPacket,
  ProjectBrief,
  type ExecutionPacketView,
  type ProjectBriefView,
} from "@commandry/ui";

const projectId = "0ef5d360-5d30-4863-a148-b4e4ba020101";
const workId = "ba972830-024c-4bb5-b60c-eb20256fe76d";
const captureId = "7cb8f86e-a063-4658-8d5e-0cc3678ca2a7";
const resourceId = "cab264fd-a273-4b24-972f-cd112134a44d";
const resourceLinkId = "1c572adb-cb61-4a75-bd30-b3e4dd7fa8db";
const at = "2026-09-25T10:00:00.000Z";
const projectEvidence = {
  kind: "project",
  id: projectId,
  href: `/api/v1/projects/${projectId}`,
  recordedAt: at,
  occurredAt: null,
  sourceLabel: "Synthetic lab project fixture",
  isSynthetic: true,
};
const workEvidence = {
  kind: "work_item",
  id: workId,
  href: `/api/v1/work-items/${workId}`,
  recordedAt: at,
  occurredAt: null,
  sourceLabel: "Synthetic lab capture fixture",
  isSynthetic: true,
};
const captureEvidence = {
  kind: "capture",
  id: captureId,
  href: `/api/v1/captures/${captureId}`,
  recordedAt: at,
  occurredAt: null,
  sourceLabel: "Synthetic lab capture fixture",
  isSynthetic: true,
};
const syntheticEvidence = {
  kind: "event",
  id: "13e65c38-4ee6-4c2a-916e-220e61a87c21",
  href: "/api/v1/events/13e65c38-4ee6-4c2a-916e-220e61a87c21",
  recordedAt: "2026-09-25T10:02:00.000Z",
  occurredAt: at,
  sourceLabel: "Synthetic operational fixture",
  isSynthetic: true,
};
const emptySection = (name: string, path: string) => ({
  items: [],
  nextCursor: null,
  fullListHref: path,
  emptyState: `No ${name} recorded in this project.`,
});

const brief: ProjectBriefView = {
  project: {
    id: projectId,
    name: "Harbor notes",
    summary: "Coordinate a local launch review.",
  },
  generatedAt: "2026-09-25T10:05:00.000Z",
  asOf: "2026-09-25T10:04:00.000Z",
  method: "deterministic-local-v1",
  state: {
    text: "Project lifecycle is active. This reflects the saved project record.",
    evidence: [projectEvidence],
  },
  sections: {
    work: {
      items: [
        {
          id: workId,
          kind: "work_item",
          title: "Prepare launch",
          detail: "Open task",
          evidence: [workEvidence, captureEvidence],
          sourceLabel: "Synthetic lab capture fixture",
          isSynthetic: true,
        },
      ],
      nextCursor: null,
      fullListHref: `/api/v1/projects/${projectId}/work`,
      emptyState: null,
    },
    knowledge: emptySection(
      "knowledge",
      `/api/v1/projects/${projectId}/knowledge`,
    ),
    resources: emptySection(
      "resources",
      `/api/v1/projects/${projectId}/resources`,
    ),
    activity: {
      items: [
        {
          id: syntheticEvidence.id,
          kind: "event",
          title: "Synthetic monitor reported unavailable",
          detail: "A fixture event for demonstration only.",
          evidence: [syntheticEvidence],
          sourceLabel: syntheticEvidence.sourceLabel,
          isSynthetic: true,
        },
      ],
      nextCursor: null,
      fullListHref: `/api/v1/events?projectId=${projectId}`,
      emptyState: null,
    },
    attention: emptySection(
      "attention",
      `/api/v1/attention?projectId=${projectId}`,
    ),
  },
  missing: {
    decisions: {
      status: "not_recorded",
      message: "No decisions were recorded.",
    },
    questions: {
      status: "not_recorded",
      message: "No questions were recorded.",
    },
    blockers: { status: "not_recorded", message: "No blockers were recorded." },
    acceptanceCriteria: {
      status: "not_recorded",
      message: "No acceptance criteria were recorded.",
    },
  },
  nextActions: {
    items: [
      {
        kind: "inference",
        ruleId: "open-work-review-v1",
        text: "Review open task: Prepare launch",
        evidence: [workEvidence],
      },
    ],
    scope: "preview_only",
    explanation:
      "A preview inferred from recorded open tasks. It is not an assigned action.",
  },
};

const packet: ExecutionPacketView = {
  id: "96aa7133-d53d-41e4-af33-9fecc2b91721",
  schemaVersion: "execution-packet/v1",
  packetVersion: 2,
  workItemId: workId,
  projectId,
  sourceCaptureId: captureId,
  generatedAt: at,
  contentDigest: "a".repeat(64),
  snapshot: {
    objective: {
      title: "Prepare launch",
      description: "Confirm the local venue.",
      status: "open",
      evidence: [workEvidence, captureEvidence],
    },
    projectContext: {
      id: projectId,
      name: "Harbor notes",
      summary: "Coordinate a local launch review.",
      type: "general",
      lifecycle: "active",
      evidence: projectEvidence,
    },
    selectedKnowledge: [],
    selectedResources: [
      {
        id: resourceId,
        linkId: resourceLinkId,
        linkType: "supports",
        evidence: {
          ...syntheticEvidence,
          kind: "project_resource_link",
          id: resourceLinkId,
          href: `/api/v1/project-resource-links/${resourceLinkId}`,
          occurredAt: null,
          sourceLabel: "Synthetic lab project resource link",
        },
      },
    ],
    missing: {
      acceptanceCriteria: {
        status: "not_recorded",
        message: "No acceptance criteria were recorded.",
      },
      verificationExpectations: {
        status: "not_recorded",
        message: "No verification expectations were recorded.",
      },
      taskConstraints: {
        status: "not_recorded",
        message: "No task constraints were recorded.",
      },
    },
    authorization: {
      capabilityGrants: [],
      externalActions: "not_authorized",
      explanation: "This packet grants no capabilities.",
    },
  },
};

function EvidenceViews({ mode }: { mode: "brief" | "empty" | "packet" }) {
  return (
    <div className="lab-stack">
      <p>
        Synthetic Storybook fixture. These examples are not live activity,
        resource health, or execution.
      </p>
      {mode === "packet" ? (
        <ExecutionPacket packet={packet} />
      ) : (
        <ProjectBrief
          brief={
            mode === "empty"
              ? {
                  ...brief,
                  sections: {
                    work: emptySection(
                      "work",
                      `/api/v1/projects/${projectId}/work`,
                    ),
                    knowledge: brief.sections.knowledge,
                    resources: brief.sections.resources,
                    activity: emptySection(
                      "activity",
                      `/api/v1/events?projectId=${projectId}`,
                    ),
                    attention: brief.sections.attention,
                  },
                  nextActions: { ...brief.nextActions, items: [] },
                }
              : brief
          }
          sectionHrefs={{
            work: "#work",
            knowledge: "#knowledge",
            resources: "#resources",
            activity: "#activity",
            attention: "#attention",
          }}
        />
      )}
    </div>
  );
}

const meta = {
  title: "Patterns/Evidence views",
  component: EvidenceViews,
  args: { mode: "brief" },
} satisfies Meta<typeof EvidenceViews>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ProjectBriefWithEvidence: Story = {};
export const ProjectBriefEmpty: Story = { args: { mode: "empty" } };
export const ImmutablePacket: Story = { args: { mode: "packet" } };
