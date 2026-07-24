"use client";

import { useState } from "react";

// The OneDrive desktop app does the actual syncing — a web app can't drive it
// directly. The reliable, Microsoft-supported path is: open the folder, then
// use OneDrive's own "Add shortcut to My files" (a one-time click), after which
// it stays synced into Finder automatically.
export function DocumentsSync({ rootUrl }: { rootUrl: string }) {
  const [opened, setOpened] = useState(false);

  function openAndSync() {
    setOpened(true);
    window.open(rootUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {/* Sync-to-Mac card */}
      <section className="card p-5">
        <div className="flex items-center gap-2">
          <span className="text-lg" aria-hidden="true">💻</span>
          <h2 className="font-serif text-lg text-ink">Sync to this Mac</h2>
        </div>
        <p className="mt-1 text-sm text-ink-muted">
          Make the OneDrive documents appear in Finder and stay up to date. You do this once.
        </p>

        <button onClick={openAndSync} className="btn-bronze mt-4">
          Sync documents to my Mac
        </button>

        <ol className="mt-4 space-y-2 text-[13px] text-ink-soft">
          <li>
            <span className="mr-1.5 font-semibold text-bronze-dark">1.</span>
            The OneDrive folder opens in your browser (the button above).
          </li>
          <li>
            <span className="mr-1.5 font-semibold text-bronze-dark">2.</span>
            On that page click <strong>Add shortcut to My files</strong> (top toolbar). If it&apos;s a
            library view, click <strong>Sync</strong> instead.
          </li>
          <li>
            <span className="mr-1.5 font-semibold text-bronze-dark">3.</span>
            Approve the &ldquo;Open Microsoft OneDrive?&rdquo; prompt. The folder then syncs into
            Finder under <code className="rounded bg-paper-warm px-1">OneDrive</code> and updates
            automatically.
          </li>
        </ol>

        {opened && (
          <p className="mt-3 rounded-md bg-paper-warm/70 px-3 py-2 text-xs text-ink-muted">
            Folder opened in a new tab — finish steps 2–3 there. Nothing to do back here.
          </p>
        )}

        <p className="mt-3 text-xs text-ink-muted">
          Needs the OneDrive app installed and signed in on this Mac.{" "}
          <a
            href="https://www.microsoft.com/en-gb/microsoft-365/onedrive/download"
            target="_blank"
            rel="noopener noreferrer"
            className="text-bronze-dark hover:underline"
          >
            Get OneDrive for Mac ↗
          </a>
        </p>
      </section>

      {/* Open in browser card */}
      <section className="card p-5">
        <div className="flex items-center gap-2">
          <span className="text-lg" aria-hidden="true">🌐</span>
          <h2 className="font-serif text-lg text-ink">Open in the browser</h2>
        </div>
        <p className="mt-1 text-sm text-ink-muted">
          Browse, upload and download without syncing — the shared OneDrive folder, in your browser.
        </p>
        <a href={rootUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost mt-4 inline-block">
          Open documents in OneDrive ↗
        </a>
        <p className="mt-4 text-xs text-ink-muted">
          Each site also has its own folder here (Photos · Architect · Planning · Investors · Costs),
          and the property page&apos;s <strong>Documents ↗</strong> button jumps straight to that
          site&apos;s folder.
        </p>
      </section>
    </div>
  );
}
