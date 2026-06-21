"use client";

import { useState, useTransition } from "react";
import { startAuthentication } from "@simplewebauthn/browser";

export function UnlockForm({ from }: { from: string }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [bioBusy, setBioBusy] = useState(false);

  const go = () => window.location.assign(from || "/");

  function submit() {
    setError(null);
    startTransition(async () => {
      const r = await fetch("/api/unlock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const j = await r.json().catch(() => ({ ok: false }));
      if (j.ok) go();
      else {
        setError("Incorrect code.");
        setPin("");
      }
    });
  }

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
      if (j.ok) go();
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

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          autoFocus
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="••••"
          className="field text-center text-2xl tracking-[0.5em]"
          aria-label="Access code"
        />
        <button type="submit" disabled={pending || !pin} className="btn-bronze mt-3 w-full disabled:opacity-60">
          {pending ? "Checking…" : "Unlock"}
        </button>
      </form>

      {error && <p className="mt-2 text-sm text-status-stop">{error}</p>}
    </div>
  );
}
