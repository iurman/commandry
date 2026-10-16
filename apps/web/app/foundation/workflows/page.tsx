import { loadRuntimeConfig } from "@commandry/config";
import { entityIdSchema } from "@commandry/contracts";
import { AppShell } from "@commandry/ui";
import { headers } from "next/headers";
import { getAuth } from "../../../lib/auth";
import { FoundationWorkflowReview } from "./FoundationWorkflowReview";
export const dynamic = "force-dynamic";
export default async function FoundationWorkflowsPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string | string[] }>;
}) {
  const config = loadRuntimeConfig();
  const query = await searchParams;
  const project = entityIdSchema.safeParse(query.projectId);
  const session =
    config.humanAuthMode === "password"
      ? await getAuth().api.getSession({ headers: await headers() })
      : null;
  const owner = Boolean(
    session &&
    session.user.email.toLowerCase() ===
      config.initialAdminEmail?.toLowerCase(),
  );
  return (
    <AppShell current="Account">
      <header className="cmd-page-header">
        <div>
          <p className="cmd-eyebrow">Owner workflow review</p>
          <h1>Agent proposals and inventory</h1>
        </div>
      </header>
      <p className="cmd-form-hint">
        Review exact configuration comparisons and proposed host inventory
        changes. Cited findings are reviewed in Inbox.
      </p>
      <FoundationWorkflowReview
        enabled={owner}
        initialProjectId={project.success ? project.data : ""}
      />
      <p>
        <a href="/inbox">Review agent findings in Inbox</a> |{" "}
        <a href="/account">Return to Account</a>
      </p>
    </AppShell>
  );
}
