"use client";

import { useState, useTransition } from "react";
import type { MonitorCriteria } from "@/lib/types";
import { PROPERTY_TYPE_OPTIONS } from "@/lib/monitorCriteria";
import { actionSaveCriteria } from "@/app/actions";

export function CriteriaEditor({ initial }: { initial: MonitorCriteria }) {
  const [c, setC] = useState<MonitorCriteria>(initial);
  const [areasText, setAreasText] = useState(initial.areas.join(", "));
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<string | null>(null);

  function toggleType(t: string) {
    setC((s) => ({
      ...s,
      propertyTypes: s.propertyTypes.includes(t) ? s.propertyTypes.filter((x) => x !== t) : [...s.propertyTypes, t],
    }));
    setSavedAt(null);
  }

  function save() {
    const areas = areasText.split(",").map((a) => a.trim()).filter(Boolean);
    const next = { ...c, areas };
    startTransition(async () => {
      await actionSaveCriteria(next);
      setC(next);
      setSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    });
  }

  const sqm = c.maxSqFt != null ? Math.round(c.maxSqFt * 0.092903) : null;

  return (
    <section className="card p-5">
      <h2 className="font-serif text-lg text-ink">Monitor criteria</h2>
      <p className="mt-1 text-xs text-ink-muted">
        Applied to auto-monitored listings before they become prospects. Manually added prospects are never filtered.
      </p>

      <div className="mt-4">
        <span className="label">Property types</span>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {PROPERTY_TYPE_OPTIONS.map((t) => {
            const on = c.propertyTypes.includes(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => toggleType(t)}
                className="rounded-full border px-3 py-1 text-xs font-medium transition"
                style={{ borderColor: on ? "#16202B" : "#E7E4DE", background: on ? "#16202B" : "#fff", color: on ? "#fff" : "#5B6976" }}
              >
                {t}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="label">Max size (ft²)</span>
          <input type="number" className="field tabular-nums" value={c.maxSqFt ?? ""} onChange={(e) => { setC((s) => ({ ...s, maxSqFt: toNum(e.target.value) })); setSavedAt(null); }} />
          {sqm != null && <span className="mt-0.5 block text-[10px] text-ink-muted">≈ {sqm} m²</span>}
        </label>
        <label className="block">
          <span className="label">Max guide price (£)</span>
          <input type="number" className="field tabular-nums" value={c.maxPrice ?? ""} onChange={(e) => { setC((s) => ({ ...s, maxPrice: toNum(e.target.value) })); setSavedAt(null); }} />
        </label>
        <label className="flex items-end gap-2 pb-2">
          <input type="checkbox" checked={c.includeIfNoPrice} onChange={(e) => { setC((s) => ({ ...s, includeIfNoPrice: e.target.checked })); setSavedAt(null); }} className="h-4 w-4" />
          <span className="text-sm text-ink-soft">List even if no price quoted</span>
        </label>
      </div>

      <div className="mt-4">
        <span className="label">Areas (comma-separated — counties, towns or postcode areas)</span>
        <input className="field" value={areasText} onChange={(e) => { setAreasText(e.target.value); setSavedAt(null); }} placeholder="Berkshire, Hampshire, Wiltshire, Surrey, Oxfordshire" />
      </div>

      <div className="mt-4 flex items-center justify-end gap-3">
        {savedAt && <span className="text-sm text-status-go">Saved · {savedAt}</span>}
        <button onClick={save} disabled={pending} className="btn-primary disabled:opacity-60">
          {pending ? "Saving…" : "Save criteria"}
        </button>
      </div>
    </section>
  );
}

function toNum(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}
