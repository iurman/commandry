import type { ReactNode } from "react";

const plannedDestinations = [
  "Work",
  "Infrastructure",
  "Automations",
  "Knowledge",
] as const;

export function AppShell({
  children,
  current = "Home",
}: {
  children: ReactNode;
  current?: "Home" | "Inbox" | "Projects" | "Activity" | "Search" | "Agents";
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
          {plannedDestinations.map((destination) => (
            <span
              aria-disabled="true"
              className="cmd-nav-link cmd-nav-planned"
              key={destination}
            >
              <span>{destination}</span>
              <span className="cmd-nav-note">Planned</span>
            </span>
          ))}
        </nav>
        <p className="cmd-sidebar-note">
          <span className="cmd-mobile-nav-hint">Swipe to see more. </span>
          Other destinations are visible for orientation and are not available
          yet.
        </p>
      </aside>
      <main className="cmd-main" id="main-content">
        {children}
      </main>
    </div>
  );
}
