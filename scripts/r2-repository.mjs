// A production backup may claim offsite evidence only for a canonical R2 S3
// endpoint. Successful restic upload and download are checked separately.
export function parseR2Repository(value) {
  if (typeof value !== "string") return null;
  const match =
    /^s3:https:\/\/([0-9a-f]{32})(?:\.(eu|fedramp|us))?\.r2\.cloudflarestorage\.com\/([a-z0-9][a-z0-9-]{1,61}[a-z0-9])(?:\/([a-zA-Z0-9._/-]+))?$/.exec(
      value,
    );
  if (!match) return null;
  const prefix = match[4] ?? "";
  if (
    prefix &&
    prefix
      .split("/")
      .some((part) => part === "" || part === "." || part === "..")
  )
    return null;
  return {
    accountId: match[1],
    jurisdiction: match[2] ?? null,
    bucket: match[3],
    prefix,
  };
}
