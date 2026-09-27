"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@commandry/ui";
import { useRouter } from "next/navigation";

export default function SignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!response.ok) {
        setError("Sign-in failed. Check the email and password.");
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("Sign-in is unavailable. Try again locally.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="cmd-form" onSubmit={submit}>
      <label htmlFor="local-auth-email">Email</label>
      <input
        autoComplete="username"
        id="local-auth-email"
        onChange={(event) => setEmail(event.target.value)}
        required
        type="email"
        value={email}
      />
      <label htmlFor="local-auth-password">Password</label>
      <input
        autoComplete="current-password"
        id="local-auth-password"
        onChange={(event) => setPassword(event.target.value)}
        required
        type="password"
        value={password}
      />
      {error && (
        <p className="cmd-form-error" role="alert">
          {error}
        </p>
      )}
      <Button disabled={busy} type="submit" variant="primary">
        {busy ? "Signing in..." : "Sign in"}
      </Button>
    </form>
  );
}
