import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { createAuth } from "./auth";
import { createDatabase } from "./client";

const adminUrl = process.env.COMMANDRY_TEST_DATABASE_URL;
const runtimePassword = process.env.COMMANDRY_TEST_RUNTIME_PASSWORD;
if (!adminUrl || !runtimePassword) {
  throw new Error("Run this file through pnpm test:integration");
}
const runtimeUrl = new URL(adminUrl);
runtimeUrl.username = "commandry_app_integration";
runtimeUrl.password = runtimePassword;

test("provisional single-user Better Auth uses PostgreSQL sessions and a closed sign-up route", async () => {
  const origin = "http://127.0.0.1:3099";
  const email = "local-owner@commandry.test";
  const password = `Local-${randomBytes(16).toString("hex")}`;
  const connection = createDatabase({
    connectionString: runtimeUrl.toString(),
    max: 2,
  });
  const options = {
    db: connection.db,
    secret: randomBytes(32).toString("hex"),
    baseURL: origin,
    adminEmail: email,
    passwordLoginEnabled: true,
    trustedOrigins: [origin],
  };
  const bootstrap = createAuth({ ...options, allowBootstrap: true });
  const web = createAuth(options);
  const post = (
    auth: typeof web,
    path: string,
    body: object,
    cookie?: string,
  ) =>
    auth.handler(
      new Request(`${origin}/api/auth/${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin,
          ...(cookie ? { cookie } : {}),
        },
        body: JSON.stringify(body),
      }),
    );
  try {
    const refusedPublicSignup = await post(web, "sign-up/email", {
      name: "Owner",
      email,
      password,
    });
    assert.notEqual(refusedPublicSignup.status, 200);

    const refusedOtherUser = await post(bootstrap, "sign-up/email", {
      name: "Intruder",
      email: "other@commandry.test",
      password,
    });
    assert.notEqual(refusedOtherUser.status, 200);

    const registered = await post(bootstrap, "sign-up/email", {
      name: "Local owner",
      email,
      password,
    });
    assert.equal(registered.status, 200, await registered.text());
    const stored = await connection.pool.query<{ password: string }>(
      'SELECT password FROM account JOIN "user" ON "user".id = account.user_id WHERE "user".email = $1',
      [email],
    );
    assert.equal(stored.rows.length, 1);
    assert.notEqual(stored.rows[0]?.password, password);

    const wrongPassword = await post(web, "sign-in/email", {
      email,
      password: "Wrong-Password-1234",
    });
    assert.notEqual(wrongPassword.status, 200);
    const signIn = await post(web, "sign-in/email", { email, password });
    assert.equal(signIn.status, 200, await signIn.text());
    const cookie = signIn.headers.get("set-cookie")?.split(";", 1)[0];
    assert.ok(cookie);
    assert.ok(cookie.includes("session_token="));

    const current = await web.handler(
      new Request(`${origin}/api/auth/get-session`, {
        headers: { cookie },
      }),
    );
    assert.equal(current.status, 200);
    const session = (await current.json()) as { user?: { email: string } };
    assert.equal(session.user?.email, email);

    const signOut = await post(web, "sign-out", {}, cookie);
    assert.equal(signOut.status, 200, await signOut.text());
    const expired = await web.handler(
      new Request(`${origin}/api/auth/get-session`, {
        headers: { cookie },
      }),
    );
    assert.equal(await expired.text(), "null");
  } finally {
    await connection.close();
  }
});
