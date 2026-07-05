"use client";

import { useState } from "react";

/** Downloads a server-generated PDF of the investor presentation via /api/pdf. */
export function ExportPdfButton() {
  const [busy, setBusy] = useState(false);

  function download() {
    setBusy(true);
    window.location.href = `/api/pdf?path=${encodeURIComponent(window.location.pathname)}`;
    setTimeout(() => setBusy(false), 10_000);
  }

  return (
    <button onClick={download} disabled={busy} className="btn-bronze disabled:opacity-60">
      {busy ? "Preparing PDF…" : "Export PDF"}
    </button>
  );
}
