export async function mailApi<T>(
  operation: string,
  input: unknown = {},
): Promise<T> {
  const response = await fetch("/api/v1/email/" + operation, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      data.code === "UNAVAILABLE"
        ? "Original mail is unavailable. Check the connection and provider retention."
        : data.code === "IDENTITY_UNVERIFIED"
          ? "This sending identity needs current domain verification."
          : data.code === "APPROVAL_REQUIRED"
            ? "Review and approve this exact draft before sending."
            : data.code === "UNAUTHENTICATED" || response.status === 401
              ? "Sign in with the owner account to access private email."
              : data.code === "FORBIDDEN"
                ? "This action is outside your authorized email scope."
                : data.code === "VERSION_CONFLICT"
                  ? "This record changed. Refresh and review the current version."
                  : "Email request failed. " +
                    String(data.code ?? response.status),
    );
  return data as T;
}
