export class KnowledgeLinkError extends Error {
  constructor(
    public readonly code: "CAPTURE_NOT_URL" | "LINK_URL_UNSAFE",
    message: string,
  ) {
    super(message);
    this.name = "KnowledgeLinkError";
  }
}

export function safeKnowledgeLinkUrl(original: string): string {
  let url: URL;
  try {
    url = new URL(original);
  } catch {
    throw new KnowledgeLinkError("LINK_URL_UNSAFE", "Link URL is invalid");
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password
  ) {
    throw new KnowledgeLinkError(
      "LINK_URL_UNSAFE",
      "Link URL must be HTTP or HTTPS without embedded credentials",
    );
  }
  url.search = "";
  url.hash = "";
  return url.toString();
}
