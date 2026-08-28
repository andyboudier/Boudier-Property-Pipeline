"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Generates the IPAD workbook, stores it in the property's OneDrive folder and
 * opens it from there — so the file lives permanently alongside the site's
 * other documents. Falls back to a plain download if OneDrive isn't reachable.
 */
export function ExportExcelButton({
  propertyId,
  className = "btn-ghost",
  exported = false,
}: {
  propertyId: string;
  className?: string;
  /** Already exported: the workbook is the master, so greying this out stops a
   *  second export silently overwriting it. Reverting to the App IPAD re-enables it. */
  exported?: boolean;
}) {
  const router = useRouter();
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
        router.refresh(); // pick up the lock so this button greys out straight away
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
        disabled={busy || exported}
        className={`${className} disabled:cursor-not-allowed disabled:opacity-50`}
        title={
          exported
            ? "Already exported — open the workbook from the banner, or revert to the App IPAD to export again"
            : "Save the appraisal into this site's OneDrive folder and open it in Excel"
        }
      >
        {busy ? "Saving to OneDrive…" : exported ? "Exported to Excel" : "Export to Excel"}
      </button>
    </span>
  );
}
