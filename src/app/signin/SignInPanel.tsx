"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

/* eslint-disable @next/next/no-img-element */
// One-click sign-in: go straight to Microsoft (skip NextAuth's provider-picker
// page, since Entra is the only provider), same window, back to the app on
// success.
export function SignInPanel({ deniedByGroup, userName }: { deniedByGroup: boolean; userName: string }) {
  const [busy, setBusy] = useState(false);

  function start() {
    setBusy(true);
    signIn("microsoft-entra-id", { callbackUrl: "/" });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper-warm px-4">
      <div className="w-full max-w-md rounded-2xl border border-paper-line bg-white px-8 py-10 text-center shadow-sm">
        <img src="/boudier-logo.png" alt="Boudier Property" className="mx-auto mb-6 h-12 w-auto" />
        <div className="mb-1 font-serif text-xs uppercase tracking-[0.3em] text-bronze-dark">
          Intelligent Development, Lasting Value
        </div>
        <h1 className="mt-3 font-serif text-2xl text-ink">Site Appraisal Pipeline</h1>

        {deniedByGroup ? (
          <>
            <p className="mt-3 text-sm text-ink-muted">
              You&apos;re signed in{userName ? ` as ${userName}` : ""}, but this account isn&apos;t
              authorised for the pipeline. Ask an administrator to add you to the access group.
            </p>
            <a
              href="/api/auth/signout"
              className="mt-6 inline-block rounded-lg bg-ink px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90"
            >
              Sign out
            </a>
          </>
        ) : (
          <>
            <p className="mt-3 text-sm text-ink-muted">
              Sign in with your Microsoft 365 account to continue.
            </p>
            <button
              type="button"
              onClick={start}
              disabled={busy}
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-bronze px-6 py-3 text-sm font-bold text-white transition hover:brightness-105 disabled:opacity-70"
            >
              <MicrosoftIcon />
              {busy ? "Redirecting to Microsoft…" : "Sign in with Microsoft"}
            </button>
          </>
        )}
      </div>
    </main>
  );
}

function MicrosoftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}
