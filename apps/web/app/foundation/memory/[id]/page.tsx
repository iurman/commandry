import { loadRuntimeConfig } from "@commandry/config";
import { entityIdSchema } from "@commandry/contracts";
import { AppShell } from "@commandry/ui";
import { headers } from "next/headers";
import { getAuth } from "../../../../lib/auth";
import { FoundationMemoryReview } from "./FoundationMemoryReview";

export const dynamic = "force-dynamic";

export default async function FoundationMemoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ projectId?: string | string[] }>;
}) {
  const config = loadRuntimeConfig();
  const [route, query] = await Promise.all([params, searchParams]);
  const id = entityIdSchema.safeParse(route.id);
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
    <AppShell current="Knowledge">
      <header className="cmd-page-header">
        <div>
          <p className="cmd-eyebrow">Owner memory review</p>
          <h1>Review an assertion</h1>
        </div>
      </header>
      <p className="cmd-form-hint">
        Review the exact assertion and its source. Acceptance, factual
        verification and permission to use an instruction are separate
        decisions.
      </p>
      {id.success && project.success ? (
        <FoundationMemoryReview
          enabled={owner}
          projectId={project.data}
          memoryId={id.data}
        />
      ) : (
        <p role="alert">
          A valid assertion and project are required. Open the review link from
          the import receipt.
        </p>
      )}
      <p>
        <a href="/account">Return to Account and import receipts</a>
      </p>
    </AppShell>
  );
}
