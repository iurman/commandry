import { z } from "zod";
import { mailPageQuerySchema } from "@commandry/contracts";
import EmailWorkspace from "./EmailWorkspace";

export const dynamic = "force-dynamic";
export default async function EmailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const query = mailPageQuerySchema.safeParse(
    Object.fromEntries(
      [
        "accountId",
        "domain",
        "address",
        "direction",
        "view",
        "q",
        "threadMessageId",
      ]
        .filter((key) => raw[key] !== undefined)
        .map((key) => [key, raw[key]]),
    ),
  );
  const selected =
    raw.message === undefined ? null : z.uuid().safeParse(raw.message);
  return (
    <EmailWorkspace
      initialQuery={query.success ? query.data : {}}
      initialSelected={selected && selected.success ? selected.data : null}
      initialError={
        !query.success || (selected && !selected.success)
          ? "Email link filters are invalid. Showing unified mail."
          : ""
      }
    />
  );
}
