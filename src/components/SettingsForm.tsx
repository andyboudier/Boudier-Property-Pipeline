"use client";

import { useState, useTransition } from "react";
import type { ProcedabilitySettings } from "@/lib/types";
import { actionSaveSettings } from "@/app/actions";

export function SettingsForm({ initial }: { initial: ProcedabilitySettings }) {
  const [s, setS] = useState<ProcedabilitySettings>(initial);
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<string | null>(null);

  function set<K extends keyof ProcedabilitySettings>(key: K, value: ProcedabilitySettings[K]) {
    setS((cur) => ({ ...cur, [key]: value }));
    setSavedAt(null);
  }

  function save() {
    startTransition(async () => {
      await actionSaveSettings(s);
      setSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    });
  }

  return (
    <div className="space-y-5">
      <section className="card p-5">
        <h2 className="font-serif text-lg text-ink">Size gate</h2>
        <p className="mt-1 text-xs text-ink-muted">Sites below the minimum fail; above the ceiling are flagged for extra review.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Num label="Minimum floor area (ft²)" value={s.minSqFt} step={100} onChange={(v) => set("minSqFt", v)} />
          <Num label="Maximum floor area (ft²)" value={s.maxSqFt} step={500} onChange={(v) => set("maxSqFt", v)} />
        </div>
      </section>

      <section className="card p-5">
        <h2 className="font-serif text-lg text-ink">Viability (IPAD)</h2>
        <p className="mt-1 text-xs text-ink-muted">Profit on GDV at or above target passes; between target and floor is review; below the floor fails.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Pct label="Target profit on GDV" value={s.targetProfitOnGdvPct} onChange={(v) => set("targetProfitOnGdvPct", v)} />
          <Pct label="Review floor (profit on GDV)" value={s.reviewProfitOnGdvPct} onChange={(v) => set("reviewProfitOnGdvPct", v)} />
        </div>
      </section>

      <section className="card p-5">
        <h2 className="font-serif text-lg text-ink">DCAS tolerances</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Num label="Max 'Concerning' ratings for a clean GO" value={s.maxConcerningForGo} step={1} onChange={(v) => set("maxConcerningForGo", v)} />
          <Pct label="Min DCAS completion before trusting verdict" value={s.minDcasCompletionPct} onChange={(v) => set("minDcasCompletionPct", v)} />
        </div>
      </section>

      <div className="flex items-center justify-end gap-3">
        {savedAt && <span className="text-sm text-status-go">Saved · {savedAt}</span>}
        <button onClick={save} disabled={pending} className="btn-primary disabled:opacity-60">
          {pending ? "Saving…" : "Save criteria"}
        </button>
      </div>
    </div>
  );
}

function Num({ label, value, step, onChange }: { label: string; value: number; step?: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input type="number" step={step ?? 1} className="field tabular-nums" value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} />
    </label>
  );
}

function Pct({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="label">{label} (%)</span>
      <input
        type="number"
        step={0.5}
        className="field tabular-nums"
        value={Math.round(value * 1000) / 10}
        onChange={(e) => onChange((Number(e.target.value) || 0) / 100)}
      />
    </label>
  );
}
