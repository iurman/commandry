import { AppShell, StatePanel, StatusBadge } from "@commandry/ui";

export default function HomePage() {
  return (
    <AppShell>
      <header className="cmd-page-header">
        <div>
          <p className="cmd-eyebrow">Home</p>
          <h1>Command Center</h1>
          <p className="cmd-lead">
            Attention, meaningful change, and possible next work will appear
            here when their sources are connected.
          </p>
        </div>
        <StatusBadge dimension="sync" label="Not connected" tone="neutral" />
      </header>

      <div className="cmd-notice">
        <h2>Local foundation</h2>
        <p>
          No account, integrations, or live signals are configured. This screen
          does not report project or system health.
        </p>
      </div>

      <div className="cmd-panel-grid">
        <StatePanel
          description="Attention will show sourced items that explain why they need review. No live sources are connected."
          id="attention-title"
          state="empty"
          title="Attention"
        />
        <StatePanel
          description="Meaningful changes will appear with their source evidence after activity is connected."
          id="change-title"
          state="empty"
          title="Change"
        />
        <StatePanel
          description="Suggested next actions will appear when there is enough context to make them useful."
          id="next-title"
          state="empty"
          title="Next"
        />
      </div>
    </AppShell>
  );
}
