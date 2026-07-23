"use client";

import { useEffect } from "react";

/* eslint-disable @next/next/no-img-element */
// Microsoft's login page can't load in an iframe, so sign-in opens in a new tab.
// Once signed in there, the session cookie lands on this domain; we poll for it
// and reload so this view updates without a manual refresh.
export function SignInPanel({ deniedByGroup, userName }: { deniedByGroup: boolean; userName: string }) {
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const r = await fetch("/api/auth/session", { cache: "no-store" });
        const s = await r.json();
        if (s && s.user) window.location.href = "/";
      } catch {
        /* ignore transient polling errors */
      }
    }, 3000);
    return () => clearInterval(id);
  }, []);

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
            <a
              href="/api/auth/signin"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-bronze px-6 py-3 text-sm font-bold text-white transition hover:brightness-105"
            >
              <MicrosoftIcon />
              Sign in with Microsoft
            </a>
            <p className="mt-4 text-xs text-ink-muted">
              A new tab opens for sign-in. After you sign in there, this page updates automatically.
            </p>
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
