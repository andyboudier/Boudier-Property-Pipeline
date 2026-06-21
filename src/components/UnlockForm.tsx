"use client";

import { useState } from "react";
import { startAuthentication } from "@simplewebauthn/browser";

export function UnlockForm({ from, hadError }: { from: string; hadError?: boolean }) {
  const [error, setError] = useState<string | null>(hadError ? "Incorrect code." : null);
  const [bioBusy, setBioBusy] = useState(false);

  async function touchId() {
    setError(null);
    setBioBusy(true);
    try {
      const optRes = await fetch("/api/passkey/authenticate");
      const { options, hasCredentials } = await optRes.json();
      if (!hasCredentials) {
        setError("No device set up yet. Enter the code, then enable Touch ID under Criteria.");
        return;
      }
      const resp = await startAuthentication({ optionsJSON: options });
      const vRes = await fetch("/api/passkey/authenticate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(resp),
      });
      const j = await vRes.json();
      if (j.ok) window.location.assign(from || "/");
      else setError(j.error || "Touch ID failed.");
    } catch (e) {
      if (!(e instanceof Error) || e.name !== "NotAllowedError") {
        setError(e instanceof Error ? e.message : "Touch ID failed.");
      }
    } finally {
      setBioBusy(false);
    }
  }

  return (
    <div className="mt-4">
      <button onClick={touchId} disabled={bioBusy} className="btn-ghost w-full disabled:opacity-60">
        {bioBusy ? "Waiting for Touch ID…" : "Unlock with Touch ID"}
      </button>

      <div className="my-3 flex items-center gap-2 text-[11px] uppercase tracking-wide text-ink-muted">
        <span className="h-px flex-1 bg-paper-line" /> or code <span className="h-px flex-1 bg-paper-line" />
      </div>

      {/* Native form POST → server sets the cookie on a redirect (works in every browser). */}
      <form method="POST" action="/api/unlock">
        <input type="hidden" name="from" value={from} />
        <input
          autoFocus
          name="pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          placeholder="••••"
          className="field text-center text-2xl tracking-[0.5em]"
          aria-label="Access code"
        />
        <button type="submit" className="btn-bronze mt-3 w-full">
          Unlock
        </button>
      </form>

      {error && <p className="mt-2 text-sm text-status-stop">{error}</p>}
    </div>
  );
}
