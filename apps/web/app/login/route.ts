import { NextResponse, type NextRequest } from "next/server";

// Public alias for the owner sign-in linked from commandry.site (ADR 0019).
export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL("/sign-in", request.url), {
    status: 307,
    headers: { "cache-control": "no-store" },
  });
}
