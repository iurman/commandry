"use client";

import { useState } from "react";
import { Button } from "@commandry/ui";
import { useRouter } from "next/navigation";

export default function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signOut() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/sign-out", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if (!response.ok) {
        setError("Could not sign out. Try again.");
        return;
      }
      router.replace("/sign-in");
      router.refresh();
    } catch {
      setError("Could not sign out. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button disabled={busy} onClick={signOut}>
        {busy ? "Signing out..." : "Sign out"}
      </Button>
      {error && (
        <p className="cmd-form-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
