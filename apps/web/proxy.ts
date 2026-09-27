import { loadRuntimeConfig } from "@commandry/config";
import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "./lib/auth";

const publicPaths = new Set([
  "/sign-in",
  "/health/live",
  "/health/ready",
  "/version",
  "/manifest.webmanifest",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/sw.js",
  "/offline.html",
]);

export function isMachineAuthPath(pathname: string, method: string): boolean {
  if (method !== "POST") return false;
  return (
    pathname === "/mcp" ||
    /^\/api\/v1\/integrations\/[^/]+\/receive$/.test(pathname) ||
    /^\/api\/v1\/agent-runs\/[^/]+\/callbacks$/.test(pathname)
  );
}

export async function proxy(request: NextRequest) {
  const config = loadRuntimeConfig();
  if (config.localAuthMode !== "password") return NextResponse.next();

  const path = request.nextUrl.pathname;
  if (
    publicPaths.has(path) ||
    path.startsWith("/api/auth/") ||
    isMachineAuthPath(path, request.method)
  ) {
    return NextResponse.next();
  }

  try {
    const session = await getAuth().api.getSession({
      headers: request.headers,
    });
    if (
      session?.user.email.toLowerCase() ===
      config.initialAdminEmail?.toLowerCase()
    ) {
      return NextResponse.next();
    }
  } catch {
    return new Response("Sign-in check unavailable", {
      status: 503,
      headers: { "cache-control": "no-store" },
    });
  }

  if (path.startsWith("/api/") || path === "/mcp") {
    return NextResponse.json(
      { code: "UNAUTHENTICATED", message: "Sign in to Commandry." },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }
  return NextResponse.redirect(new URL("/sign-in", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
