"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { PropertySnapshot } from "@/lib/types";
import { actionRestoreSnapshot, actionDeleteSnapshot } from "@/app/actions";
import { gbp } from "@/lib/format";

export function RecoverList({ snapshots }: { snapshots: PropertySnapshot[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  function restore(s: PropertySnapshot) {
    setBusyId(s.id);
    startTransition(async () => {
      const res = await actionRestoreSnapshot(s.id);
      setBusyId(null);
      if (res.id) router.push(`/property/${res.id}`);
      else router.refresh();
    });
  }

  function purge(s: PropertySnapshot) {
    if (!window.confirm(`Permanently delete the snapshot of "${s.name}"?\n\nThis cannot be undone.`)) return;
    setBusyId(s.id);
    startTransition(async () => {
      await actionDeleteSnapshot(s.id);
      setBusyId(null);
      router.refresh();
    });
  }

  if (snapshots.length === 0) {
    return (
      <div className="card p-10 text-center text-sm text-ink-muted">
        Nothing to recover. Deleted sites are saved here as snapshots so you can restore them.
      </div>
    );
  }

  return (
    <div className="card divide-y divide-paper-line">
      {snapshots.map((s) => (
        <div key={s.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="font-medium text-ink">{s.name}</div>
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
              <span>
                {s.data.town || "—"}
                {s.data.guidePrice != null ? ` · ${gbp(s.data.guidePrice)}` : ""}
              </span>
              <span
                className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase"
                style={{ background: `${reasonMeta(s.reason).color}1A`, color: reasonMeta(s.reason).color }}
              >
                {reasonMeta(s.reason).label}
              </span>
              <span>{formatWhen(s.takenAt)}</span>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <button onClick={() => restore(s)} disabled={pending} className="btn-bronze text-sm disabled:opacity-60">
              {busyId === s.id ? "Working…" : "Restore"}
            </button>
            <button
              onClick={() => purge(s)}
              disabled={pending}
              className="btn-ghost text-sm hover:border-status-stop hover:text-status-stop disabled:opacity-60"
            >
              Delete forever
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function reasonMeta(reason: string): { label: string; color: string } {
  switch (reason) {
    case "delete":
      return { label: "Deleted", color: "#B23A48" };
    case "overwrite":
      return { label: "Before overwrite", color: "#C2872B" };
    case "pre-restore":
      return { label: "Before restore", color: "#4F6D7A" };
    case "auto":
      return { label: "Auto backup", color: "#2E7D5B" };
    default:
      return { label: reason || "Snapshot", color: "#8A8F94" };
  }
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
