import type { Meta, StoryObj } from "@storybook/react";
import {
  LocalAgentAuditList,
  LocalAgentCard,
  LocalAgentReadReceipt,
  LocalAgentRunPanel,
  StatePanel,
  type LocalAgentAuditView,
  type LocalAgentProfileView,
  type LocalAgentReadView,
  type LocalAgentRunView,
} from "@commandry/ui";

const at = "2026-09-25T10:00:00.000Z";
const projectId = "0ef5d360-5d30-4863-a148-b4e4ba020101";
const packetId = "96aa7133-d53d-41e4-af33-9fecc2b91721";
const runId = "3a11e8b9-97df-4831-924e-12d1e786775d";
const agentId = "8f24f301-47fa-4ca8-8492-4264993c5025";

const profile: LocalAgentProfileView = {
  id: agentId,
  name: "Harbor reader",
  role: "Review project context for a saved packet",
  runtime: "local-fake-v1",
  sourceLabel: "Synthetic local agent",
  isSynthetic: true,
  createdAt: at,
};

const evidence = {
  kind: "project_brief",
  id: projectId,
  href: `/api/v1/projects/${projectId}/brief`,
  recordedAt: at,
  occurredAt: null,
  sourceLabel: "Synthetic lab project fixture",
  isSynthetic: true,
};

const run: LocalAgentRunView = {
  id: runId,
  occurrenceId: "f68b29e9-908c-4097-b8e4-75850865e45d",
  agentId,
  packetId,
  packetVersion: 2,
  packetDigest: "a".repeat(64),
  workItemId: "ba972830-024c-4bb5-b60c-eb20256fe76d",
  projectId,
  state: "succeeded",
  attempts: 1,
  attemptHistory: [
    {
      id: "a82590fd-b714-4d85-a407-a4b83bc00101",
      number: 1,
      state: "succeeded",
      error: null,
      startedAt: "2026-09-25T10:01:00.000Z",
      completedAt: "2026-09-25T10:01:03.000Z",
    },
  ],
  grant: {
    projectId,
    operations: ["project.brief.read", "work.read"],
    expiresAt: "2026-09-25T10:30:00.000Z",
  },
  result: {
    summary:
      "Synthetic local review read the saved packet and cited project context. No work was performed or verified.",
    contextReadIds: ["3fc3a985-6765-4f60-b31d-d5d17699b6d3"],
    evidence: [evidence],
    runtime: "local-fake-v1",
    isSynthetic: true,
    verificationStatus: "unverified",
    externalActions: [],
  },
  error: null,
  verificationStatus: "unverified",
  runtime: "local-fake-v1",
  sourceLabel: "Synthetic local agent",
  isSynthetic: true,
  externalActions: [],
  createdAt: at,
  startedAt: "2026-09-25T10:01:00.000Z",
  completedAt: "2026-09-25T10:01:03.000Z",
};

const audit: LocalAgentAuditView[] = [
  {
    id: "50dfa7f5-15fd-40ec-ac25-6a75a6db72b0",
    runId,
    actor: "local-fake-v1",
    operation: "project.brief.read",
    projectId,
    decision: "allowed",
    code: null,
    reason: "Read project context for packet",
    createdAt: "2026-09-25T10:01:01.000Z",
  },
  {
    id: "3d082a97-a279-4ebc-973b-c51708c811e1",
    runId,
    actor: "local-review",
    operation: "resource.write",
    projectId,
    decision: "denied",
    code: "OPERATION_NOT_GRANTED",
    reason: "Requested an ungranted operation",
    createdAt: "2026-09-25T10:02:00.000Z",
  },
];

const read: LocalAgentReadView = {
  runId,
  projectId,
  operation: "project.brief.read",
  readAt: "2026-09-25T10:01:01.000Z",
  sensitivity: "unclassified-local-data",
  isSynthetic: true,
  source: {
    kind: "project_brief",
    id: projectId,
    title: "Harbor notes project brief",
    summary:
      "Deterministic local brief with exact source links and stated missing context.",
    href: evidence.href,
    recordedAt: at,
    sourceLabel: "Synthetic lab project fixture",
    isSynthetic: true,
    evidence: [evidence],
  },
  auditId: audit[0]!.id,
};

function LocalAgents({
  mode,
}: {
  mode:
    | "scoped"
    | "unassigned"
    | "queued"
    | "completed"
    | "denied"
    | "read"
    | "loading"
    | "empty"
    | "error";
}) {
  if (mode === "loading" || mode === "empty" || mode === "error") {
    return (
      <StatePanel
        id="agent-lab-state"
        title="Synthetic local agents"
        state={mode}
        description={
          mode === "loading"
            ? "Loading agent profiles and project scope."
            : mode === "empty"
              ? "Create a profile and assign a project to begin."
              : "The local agent API could not be reached."
        }
      />
    );
  }
  if (mode === "scoped" || mode === "unassigned") {
    return (
      <div className="lab-stack">
        <p>
          Synthetic lab fixture. No external agent runtime or secret is
          connected.
        </p>
        <LocalAgentCard
          agent={profile}
          assignments={
            mode === "scoped"
              ? [
                  {
                    id: "f16c7463-b95f-44c4-871b-28d451db68a6",
                    agentId,
                    projectId,
                    isSynthetic: true,
                    createdAt: at,
                  },
                ]
              : []
          }
          projectNames={{ [projectId]: "Harbor notes" }}
          scopeState="ready"
        />
      </div>
    );
  }
  if (mode === "read")
    return (
      <div className="lab-stack">
        <LocalAgentReadReceipt read={read} />
        <LocalAgentAuditList items={audit} />
      </div>
    );
  if (mode === "denied")
    return (
      <div className="lab-stack">
        <StatePanel
          id="denied-read"
          title="Context read"
          state="permission-denied"
          description="The requested operation is outside this run's grant. A denial is recorded in audit history."
        />
        <LocalAgentAuditList items={audit} />
      </div>
    );
  return (
    <div className="lab-stack">
      <LocalAgentRunPanel
        run={
          mode === "queued"
            ? {
                ...run,
                state: "queued",
                attempts: 0,
                attemptHistory: [],
                result: null,
                startedAt: null,
                completedAt: null,
              }
            : run
        }
        agentName={profile.name}
      />
      <LocalAgentAuditList items={mode === "queued" ? [] : audit} />
    </div>
  );
}

const meta = {
  title: "Patterns/Local agents",
  component: LocalAgents,
  args: { mode: "scoped" },
} satisfies Meta<typeof LocalAgents>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ScopedProfile: Story = {};
export const UnassignedProfile: Story = { args: { mode: "unassigned" } };
export const QueuedRun: Story = { args: { mode: "queued" } };
export const CompletedRun: Story = { args: { mode: "completed" } };
export const AllowedRead: Story = { args: { mode: "read" } };
export const DeniedRead: Story = { args: { mode: "denied" } };
export const Loading: Story = { args: { mode: "loading" } };
export const Empty: Story = { args: { mode: "empty" } };
export const ErrorState: Story = { args: { mode: "error" } };
