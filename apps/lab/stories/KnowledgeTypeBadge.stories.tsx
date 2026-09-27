import type { Meta, StoryObj } from "@storybook/react";
import { KnowledgeTypeBadge } from "@commandry/ui";

const meta = {
  title: "Records/KnowledgeTypeBadge",
  component: KnowledgeTypeBadge,
  parameters: { layout: "centered" },
  args: { kind: "note" },
} satisfies Meta<typeof KnowledgeTypeBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Note: Story = {};
export const Idea: Story = { args: { kind: "idea" } };
export const Research: Story = { args: { kind: "research" } };
export const Requirement: Story = { args: { kind: "requirement" } };
export const ArchitectureNote: Story = {
  args: { kind: "architecture_note" },
};
export const Runbook: Story = { args: { kind: "runbook" } };
export const MeetingNote: Story = { args: { kind: "meeting_note" } };
export const LessonLearned: Story = { args: { kind: "lesson_learned" } };
export const Instruction: Story = { args: { kind: "instruction" } };
