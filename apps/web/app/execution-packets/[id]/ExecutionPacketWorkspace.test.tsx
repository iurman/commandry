// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import type { ExecutionPacket } from "@commandry/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import ExecutionPacketWorkspace from "./ExecutionPacketWorkspace";

const projectId = "0ef5d360-5d30-4863-a148-b4e4ba020101";
const workId = "ba972830-024c-4bb5-b60c-eb20256fe76d";
const noteId = "dd51b59e-9013-4e49-84c3-c177ad0b7956";
const resourceId = "cab264fd-a273-4b24-972f-cd112134a44d";
const resourceLinkId = "1c572adb-cb61-4a75-bd30-b3e4dd7fa8db";
const captureId = "7cb8f86e-a063-4658-8d5e-0cc3678ca2a7";
const packetId = "96aa7133-d53d-41e4-af33-9fecc2b91721";
const at = "2026-09-25T10:00:00.000Z";
const evidence = (
  kind:
    | "project"
    | "work_item"
    | "capture"
    | "knowledge_item"
    | "project_resource_link",
  id: string,
  isSynthetic = false,
) => ({
  kind,
  id,
  href: `/api/v1/${kind.replaceAll("_", "-")}s/${id}`,
  recordedAt: at,
  occurredAt: null,
  sourceLabel: isSynthetic
    ? "Synthetic operational fixture"
    : "Manual local capture",
  isSynthetic,
});

const packet: ExecutionPacket = {
  id: packetId,
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
      description: "Confirm the west door.",
      status: "open",
      evidence: [evidence("work_item", workId), evidence("capture", captureId)],
    },
    projectContext: {
      id: projectId,
      name: "Harbor notes",
      summary: null,
      type: "general",
      lifecycle: "active",
      evidence: evidence("project", projectId),
    },
    selectedKnowledge: [
      {
        id: noteId,
        title: "Venue note",
        evidence: evidence("knowledge_item", noteId),
      },
    ],
    selectedResources: [
      {
        id: resourceId,
        linkId: resourceLinkId,
        linkType: "supports",
        evidence: evidence("project_resource_link", resourceLinkId, true),
      },
    ],
    missing: {
      acceptanceCriteria: {
        status: "not_recorded",
        message: "Acceptance criteria were not recorded.",
      },
      verificationExpectations: {
        status: "not_recorded",
        message: "Verification expectations were not recorded.",
      },
      taskConstraints: {
        status: "not_recorded",
        message: "Task constraints were not recorded.",
      },
    },
    authorization: {
      capabilityGrants: [],
      externalActions: "not_authorized",
      explanation: "No capability grants are included.",
    },
  },
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Execution packet review", () => {
  it("renders exact versioned snapshot, selected sources and missing authorization", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(packet), { status: 200 })),
    );
    render(<ExecutionPacketWorkspace packetId={packetId} />);
    expect(
      await screen.findByRole("heading", { name: "Execution packet" }),
    ).toBeTruthy();
    expect(screen.getByText("Version 2 for Prepare launch")).toBeTruthy();
    expect(screen.getByText("a".repeat(64))).toBeTruthy();
    expect(
      screen.getByText(
        "This packet records selected context at creation time. It does not verify the task, grant a capability, or start an agent run.",
      ),
    ).toBeTruthy();
    const knowledge = screen.getByRole("region", {
      name: "Selected knowledge",
    });
    expect(within(knowledge).getByText("Venue note")).toBeTruthy();
    expect(
      within(knowledge)
        .getByRole("link", { name: "View current knowledge note" })
        .getAttribute("href"),
    ).toBe(`/knowledge-items/${noteId}`);
    expect(
      within(knowledge).getByText(
        /Only the note identity and source reference/,
      ),
    ).toBeTruthy();
    const resources = screen.getByRole("region", {
      name: "Selected resources",
    });
    expect(
      within(resources).getByText(`Resource ID: ${resourceId}`),
    ).toBeTruthy();
    expect(
      within(resources).getByText(/Project relationship: supports/),
    ).toBeTruthy();
    expect(
      within(resources)
        .getByRole("link", { name: "View project resource link source" })
        .getAttribute("href"),
    ).toBe(`/api/v1/project-resource-links/${resourceLinkId}`);
    expect(
      within(resources)
        .getByRole("link", { name: "View current resource" })
        .getAttribute("href"),
    ).toBe(`/resources/${resourceId}`);
    expect(
      within(resources).getByText(/Synthetic · Synthetic operational fixture/),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "View exact original capture" })
        .getAttribute("href"),
    ).toBe(`/inbox?captureId=${captureId}`);
    expect(
      screen.getByText("Acceptance criteria were not recorded."),
    ).toBeTruthy();
    expect(screen.getByText("External actions: not authorized.")).toBeTruthy();
  });

  it("shows a load failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ message: "Packet not found" }), {
            status: 404,
          }),
      ),
    );
    render(<ExecutionPacketWorkspace packetId={packetId} />);
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Packet not found",
    );
  });
});
