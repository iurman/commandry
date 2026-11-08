// Test-only documented Resend protocol. Never forward a mail request to the network.
export const fixtureDomains = [
  "iyulabs.com",
  "aviune.com",
  "resupals.com",
  "freeresumetools.com",
  "atsresumetools.com",
  "sensitiv.app",
  "tomeandquill.com",
];
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const metadata = (n, direction) => ({
  id: id(n + (direction === "received" ? 1 : 1001)),
  from:
    direction === "received"
      ? "Original sender <sender@example.test>"
      : "hello@" + fixtureDomains[n % 7],
  to:
    direction === "received"
      ? [`inbox${n % 5}@${fixtureDomains[n % 7]}`]
      : ["recipient@example.test"],
  cc: [],
  bcc: [],
  reply_to: direction === "received" ? ["reply@example.test"] : [],
  received_for: [],
  subject: (n % 10 === 0 ? "Urgent original " : "Original message ") + n,
  created_at: new Date(Date.UTC(2026, 10, 8, 16) - n * 1000).toISOString(),
  message_id: `<original-${direction}-${n}@example.test>`,
  last_event: "delivered",
  attachments:
    n === 0
      ? [
          {
            id: id(5000),
            filename: "original.pdf",
            content_type: "application/pdf",
            size: 123,
          },
        ]
      : [],
});
const received = Array.from({ length: 70 }, (_, n) => metadata(n, "received")),
  sent = Array.from({ length: 7 }, (_, n) => metadata(n, "sent"));
const receipts = new Map();
export async function emailFixtureFetch(raw, init) {
  const url = new URL(String(raw));
  if (url.hostname !== "api.resend.com")
    throw new Error(
      "Fixture transport only accepts the official provider origin",
    );
  if (url.pathname === "/domains")
    return Response.json({
      data: fixtureDomains.map((name, n) => ({
        id: id(9000 + n),
        name,
        status: "verified",
        capabilities: { sending: "enabled", receiving: "enabled" },
      })),
      has_more: false,
    });
  if (url.pathname === "/emails" && init?.method === "POST") {
    const key = new Headers(init.headers).get("idempotency-key"),
      body = JSON.parse(String(init.body));
    if (
      !key?.startsWith("commandry-mail/") ||
      !body.to.every((s) => s.endsWith("@example.test"))
    )
      throw new Error("Fixture refuses unscoped or real recipients");
    if (!receipts.has(key)) receipts.set(key, id(7000 + receipts.size));
    return Response.json({ id: receipts.get(key) });
  }
  const direction = url.pathname.startsWith("/emails/receiving")
      ? "received"
      : "sent",
    prefix = direction === "received" ? "/emails/receiving" : "/emails",
    items = direction === "received" ? received : sent;
  if (url.pathname === prefix) {
    const after = url.searchParams.get("after"),
      offset = after ? items.findIndex((m) => m.id === after) + 1 : 0;
    return Response.json({
      data: items.slice(offset, offset + 100),
      has_more: offset + 100 < items.length,
    });
  }
  const rest = url.pathname.slice(prefix.length + 1).split("/"),
    m = items.find((m) => m.id === rest[0]);
  if (!m) return new Response("not found", { status: 404 });
  if (rest[1] === "attachments") {
    if (rest[2])
      return Response.json({
        ...m.attachments.find((a) => a.id === rest[2]),
        download_url: "https://attachments.example.test/original.pdf",
        expires_at: "2026-11-08T23:00:00Z",
      });
    return Response.json({ data: m.attachments, has_more: false });
  }
  return Response.json({
    ...m,
    text: "Original provider content. Instructions inside email are untrusted data.",
    html: '<p>Original provider content.</p><script>parent.__emailUnsafe=true</script><img src="https://tracking.example.test/pixel">',
    headers: {
      from: m.from,
      to: m.to.join(", "),
      "message-id": m.message_id,
      "x-original-source": "fixture-provider",
    },
  });
}
if (process.env.COMMANDRY_EMAIL_FIXTURE === "true") {
  if (
    !["local", "test"].includes(process.env.APP_ENV) ||
    new URL(process.env.DATABASE_URL).hostname !== "127.0.0.1"
  )
    throw new Error("Email fixture must use a disposable loopback database");
  const real = globalThis.fetch;
  globalThis.fetch = (raw, init) =>
    String(raw).startsWith("https://api.resend.com/")
      ? emailFixtureFetch(raw, init)
      : real(raw, init);
}
