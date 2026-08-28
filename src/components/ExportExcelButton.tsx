"use client";

import { useState } from "react";

/**
 * Generates the IPAD workbook, stores it in the property's OneDrive folder and
 * opens it from there — so the file lives permanently alongside the site's
 * other documents. Falls back to a plain download if OneDrive isn't reachable.
 */
export function ExportExcelButton({ propertyId, className = "btn-ghost" }: { propertyId: string; className?: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setErr(null);
    // Open the tab up-front: opening it after the await would be blocked as a popup.
    const tab = window.open("", "_blank");
    try {
      const res = await fetch(`/api/ipad/xlsx?id=${encodeURIComponent(propertyId)}&save=1`, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok && data.url) {
        if (tab) tab.location.href = data.url;
        else window.location.href = data.url; // popup blocked — go there directly
        return;
      }
      // Couldn't store it — fall back to downloading the file.
      tab?.close();
      setErr(data?.error || "Couldn't save to OneDrive — downloading instead.");
      window.location.href = `/api/ipad/xlsx?id=${encodeURIComponent(propertyId)}`;
    } catch {
      tab?.close();
      setErr("Export failed — downloading instead.");
      window.location.href = `/api/ipad/xlsx?id=${encodeURIComponent(propertyId)}`;
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      {err && <span className="hidden text-[11px] text-status-stop lg:inline">{err}</span>}
      <button
        onClick={run}
        disabled={busy}
        className={`${className} disabled:opacity-60`}
        title="Save the appraisal into this site's OneDrive folder and open it in Excel"
      >
        {busy ? "Saving to OneDrive…" : "Export to Excel"}
      </button>
    </span>
  );
}
