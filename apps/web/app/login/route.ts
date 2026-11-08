// Public alias for the owner sign-in linked from commandry.site (ADR 0019).
export function GET() {
  return new Response(null, {
    status: 307,
    headers: { location: "/sign-in", "cache-control": "no-store" },
  });
}
