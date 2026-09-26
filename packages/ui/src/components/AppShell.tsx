import type { ReactNode } from "react";

export function AppShell({
  children,
  current = "Home",
}: {
  children: ReactNode;
  current?:
    | "Home"
    | "Inbox"
    | "Projects"
    | "Work"
    | "Knowledge"
    | "Integrations"
    | "Infrastructure"
    | "Activity"
    | "Search"
    | "Agents"
    | "Approvals"
    | "Automations"
    | "Notifications";
}) {
  return (
    <div className="cmd-shell">
      <a className="cmd-skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="cmd-sidebar">
        <div className="cmd-brand">
          <span className="cmd-brand-name">Commandry</span>
          <span className="cmd-brand-caption">Local workspace</span>
        </div>
        <nav aria-label="Main navigation" className="cmd-navigation">
          <a
            aria-current={current === "Home" ? "page" : undefined}
            className={`cmd-nav-link ${current === "Home" ? "cmd-nav-current" : ""}`}
            href="/"
          >
            Home
          </a>
          <a
            aria-current={current === "Inbox" ? "page" : undefined}
            className={`cmd-nav-link ${current === "Inbox" ? "cmd-nav-current" : ""}`}
            href="/inbox"
          >
            Inbox
          </a>
          <a
            aria-current={current === "Projects" ? "page" : undefined}
            className={`cmd-nav-link ${current === "Projects" ? "cmd-nav-current" : ""}`}
            href="/projects"
          >
            Projects
          </a>
          <a
            aria-current={current === "Work" ? "page" : undefined}
            className={`cmd-nav-link ${current === "Work" ? "cmd-nav-current" : ""}`}
            href="/work"
          >
            Work
          </a>
          <a
            aria-current={current === "Knowledge" ? "page" : undefined}
            className={`cmd-nav-link ${current === "Knowledge" ? "cmd-nav-current" : ""}`}
            href="/knowledge"
          >
            Knowledge
          </a>
          <a
            aria-current={current === "Integrations" ? "page" : undefined}
            className={`cmd-nav-link ${current === "Integrations" ? "cmd-nav-current" : ""}`}
            href="/integrations"
          >
            Integrations
          </a>
          <a
            aria-current={current === "Infrastructure" ? "page" : undefined}
            className={`cmd-nav-link ${current === "Infrastructure" ? "cmd-nav-current" : ""}`}
            href="/infrastructure"
          >
            Infrastructure
          </a>
          <a
            aria-current={current === "Activity" ? "page" : undefined}
            className={`cmd-nav-link ${current === "Activity" ? "cmd-nav-current" : ""}`}
            href="/activity"
          >
            Activity
          </a>
          <a
            aria-current={current === "Search" ? "page" : undefined}
            className={`cmd-nav-link ${current === "Search" ? "cmd-nav-current" : ""}`}
            href="/search"
          >
            Search
          </a>
          <a
            aria-current={current === "Agents" ? "page" : undefined}
            className={`cmd-nav-link ${current === "Agents" ? "cmd-nav-current" : ""}`}
            href="/agents"
          >
            Agents
          </a>
          <a
            aria-current={current === "Approvals" ? "page" : undefined}
            className={`cmd-nav-link ${current === "Approvals" ? "cmd-nav-current" : ""}`}
            href="/approvals"
          >
            Approvals
          </a>
          <a
            aria-current={current === "Automations" ? "page" : undefined}
            className={`cmd-nav-link ${current === "Automations" ? "cmd-nav-current" : ""}`}
            href="/automations"
          >
            Automations
          </a>
          <a
            aria-current={current === "Notifications" ? "page" : undefined}
            className={`cmd-nav-link ${current === "Notifications" ? "cmd-nav-current" : ""}`}
            href="/notifications"
          >
            Notifications
          </a>
        </nav>
        <p className="cmd-sidebar-note">
          <span className="cmd-mobile-nav-hint">Swipe to see more. </span>
          Navigation opens the local workspaces.
        </p>
      </aside>
      <main className="cmd-main" id="main-content">
        {children}
      </main>
    </div>
  );
}
