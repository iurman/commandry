import { loadRuntimeConfig } from "@commandry/config";
import { redirect } from "next/navigation";
import SignInForm from "./SignInForm";

export const dynamic = "force-dynamic";

export default function SignInPage() {
  const config = loadRuntimeConfig();
  if (config.localAuthMode !== "password") redirect("/");
  return (
    <main className="cmd-auth-page" id="main-content">
      <section className="cmd-auth-card" aria-labelledby="sign-in-heading">
        <p className="cmd-eyebrow">Commandry / local sign-in experiment</p>
        <h1 id="sign-in-heading">Sign in</h1>
        <p>
          This provisional single-user login stores sessions in PostgreSQL. It
          is separate from the phone preview&apos;s test/pass review gate.
        </p>
        <SignInForm />
        <p className="cmd-form-hint">
          Recovery and production activation remain open under OQ-003.
        </p>
      </section>
    </main>
  );
}
