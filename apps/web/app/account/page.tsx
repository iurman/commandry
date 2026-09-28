import { loadRuntimeConfig } from "@commandry/config";
import { AppShell } from "@commandry/ui";
import { headers } from "next/headers";
import { getAuth } from "../../lib/auth";
import SignOutButton from "./SignOutButton";
import FeedbackSettings from "./FeedbackSettings";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const config = loadRuntimeConfig();
  const session =
    config.humanAuthMode === "password"
      ? await getAuth().api.getSession({ headers: await headers() })
      : null;
  return (
    <AppShell current="Account">
      <header className="cmd-page-header">
        <div>
          <p className="cmd-eyebrow">
            {config.appEnv === "production" ? "Owner account" : "Local account"}
          </p>
          <h1>Account and session</h1>
        </div>
      </header>
      <section className="cmd-workspace-section">
        {config.humanAuthMode === "password" ? (
          <>
            <p>
              Signed in as <strong>{session?.user.email}</strong> through a
              PostgreSQL-backed session.
            </p>
            <SignOutButton />
            <p className="cmd-form-hint">
              An operator reset signs out every device. Recovery after server
              access is lost remains provisional under OQ-003.
            </p>
          </>
        ) : (
          <p>
            Product sign-in is off for local review. The phone&apos;s test/pass
            prompt is a separate local preview gate.
          </p>
        )}
      </section>
      <FeedbackSettings />
    </AppShell>
  );
}
