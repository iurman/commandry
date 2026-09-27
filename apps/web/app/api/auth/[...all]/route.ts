import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "../../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let handlers: ReturnType<typeof toNextJsHandler> | undefined;

function getHandlers() {
  if (!handlers) {
    handlers = toNextJsHandler(getAuth());
  }
  return handlers;
}

export async function GET(request: Request): Promise<Response> {
  return getHandlers().GET(request);
}

export async function POST(request: Request): Promise<Response> {
  return getHandlers().POST(request);
}
