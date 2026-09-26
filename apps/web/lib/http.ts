import { randomUUID } from "node:crypto";

export function jsonResponse(
  request: Request,
  body: unknown,
  status = 200,
  operation = "http.response",
): Response {
  const supplied = request.headers.get("x-correlation-id");
  const correlationId =
    supplied && /^[a-zA-Z0-9_-]{1,100}$/.test(supplied)
      ? supplied
      : randomUUID();
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: status >= 500 ? "error" : "info",
      service: "web",
      environment: process.env.APP_ENV ?? "unknown",
      release: process.env.RELEASE_SHA ?? "unknown",
      actorClass: "anonymous-local",
      operation,
      correlationId,
      status,
    }),
  );
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-correlation-id": correlationId,
    },
  });
}
