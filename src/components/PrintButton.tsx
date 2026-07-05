"use client";

import { useState } from "react";

/** Downloads a server-generated PDF of the current report page (rendered by
 * headless Chromium via /api/pdf) — a real file, no print dialog, no browser
 * headers/footers. */
export function PrintButton({ label = "Download PDF" }: { label?: string }) {
  const [busy, setBusy] = useState(false);

  function download() {
    setBusy(true);
    window.location.href = `/api/pdf?path=${encodeURIComponent(window.location.pathname)}`;
    // The navigation is a file download, so the page stays put — just reset the
    // label once the download has had time to start.
    setTimeout(() => setBusy(false), 10_000);
  }

  return (
    <button onClick={download} disabled={busy} className="btn-primary disabled:opacity-60">
      {busy ? "Preparing PDF…" : label}
    </button>
  );
}
