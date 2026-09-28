import { loadRuntimeConfig } from "@commandry/config";
import { redirect } from "next/navigation";
import SignInForm from "./SignInForm";

export const dynamic = "force-dynamic";

export default function SignInPage() {
  const config = loadRuntimeConfig();
  if (config.humanAuthMode !== "password") redirect("/");
  const production = config.appEnv === "production";
  return (
    <main className="cmd-auth-page" id="main-content">
      <section className="cmd-auth-card" aria-labelledby="sign-in-heading">
        <p className="cmd-eyebrow">
          Commandry /{" "}
          {production ? "owner sign-in" : "local sign-in experiment"}
        </p>
        <h1 id="sign-in-heading">Sign in</h1>
        <p>
          This provisional single-owner login stores sessions in PostgreSQL.
          {production
            ? " Access is limited to the configured owner."
            : " It is separate from the phone preview's test/pass review gate."}
        </p>
        <SignInForm />
        <p className="cmd-form-hint">
          Lost the password? An operator with server access can reset it and
          revoke every session. Recovery after server access is lost remains
          open under OQ-003.
        </p>
      </section>
    </main>
  );
}
