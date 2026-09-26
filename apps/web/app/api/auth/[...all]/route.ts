import { toNextJsHandler } from "better-auth/next-js";
import { loadRuntimeConfig } from "@commandry/config";
import { createAuth } from "@commandry/db";
import { getDatabase } from "../../../../lib/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let handlers: ReturnType<typeof toNextJsHandler> | undefined;

function getHandlers() {
  if (!handlers) {
    const config = loadRuntimeConfig();
    const auth = createAuth({
      db: getDatabase().db,
      secret: config.betterAuthSecret,
      baseURL: config.appOrigin,
    });
    handlers = toNextJsHandler(auth);
  }
  return handlers;
}

export async function GET(request: Request): Promise<Response> {
  return getHandlers().GET(request);
}

export async function POST(request: Request): Promise<Response> {
  return getHandlers().POST(request);
}
