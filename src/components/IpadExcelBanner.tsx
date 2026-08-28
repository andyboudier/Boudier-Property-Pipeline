"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { actionRevertIpadToApp } from "@/app/actions";

/** Shown when the IPAD has been exported to Excel: the app's copy is read-only
 * and the workbook in OneDrive is the master, until someone reverts. */
export function IpadExcelBanner({ propertyId, url, at }: { propertyId: string; url: string; at?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);

  const when = at
    ? new Date(at).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "";

  function revert() {
    start(async () => {
      await actionRevertIpadToApp(propertyId);
      setConfirming(false);
      router.refresh();
    });
  }

  return (
    <div className="no-print rounded-lg border border-bronze/50 bg-bronze/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-ink">📊 This IPAD is now in Excel</p>
          <p className="mt-0.5 text-sm text-ink-muted">
            The workbook in this site&apos;s OneDrive folder is the master copy{when ? ` (exported ${when})` : ""}. The
            appraisal below is read-only so the two can&apos;t drift apart.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <a href={url} target="_blank" rel="noopener noreferrer" className="btn-bronze">Open in Excel ↗</a>
          {confirming ? (
            <span className="flex items-center gap-2">
              <span className="text-xs text-ink-muted">Edit in the app again?</span>
              <button onClick={revert} disabled={pending} className="btn-primary px-3 py-1.5 text-xs disabled:opacity-60">
                {pending ? "Reverting…" : "Yes, revert"}
              </button>
              <button onClick={() => setConfirming(false)} className="btn-ghost px-3 py-1.5 text-xs">Cancel</button>
            </span>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className="btn-ghost"
              title="Make the app's IPAD editable again (the Excel file stays in OneDrive)"
            >
              Revert to App IPAD
            </button>
          )}
        </div>
      </div>
      {confirming && (
        <p className="mt-2 text-xs text-ink-muted">
          Any changes made in the Excel workbook won&apos;t come back into the app — re-enter them here if you need them.
        </p>
      )}
    </div>
  );
}
