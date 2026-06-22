"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import type { Dcas, RatingValue } from "@/lib/types";
import { RATINGS, ratingColor } from "@/lib/ratings";
import { dcasStats } from "@/lib/dcasSchema";
import { actionSaveDcas } from "@/app/actions";
import { useAutosave } from "@/lib/useAutosave";

export function DcasForm({
  propertyId,
  initial,
  guidePrice,
}: {
  propertyId: string;
  initial: Dcas;
  guidePrice: number | null;
}) {
  const [dcas, setDcas] = useState<Dcas>(initial);
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const stats = useMemo(() => dcasStats(dcas), [dcas]);

  function patchMeta(patch: Partial<Pick<Dcas, "opportunity" | "description" | "date" | "overallComments">>) {
    setDcas((d) => ({ ...d, ...patch }));
    setDirty(true);
  }

  function patchItem(sectionKey: string, itemId: string, patch: { rating?: RatingValue; note?: string }) {
    setDcas((d) => ({
      ...d,
      sections: d.sections.map((s) =>
        s.key !== sectionKey
          ? s
          : { ...s, items: s.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)) },
      ),
    }));
    setDirty(true);
  }

  function save() {
    startTransition(async () => {
      await actionSaveDcas(propertyId, dcas);
      setSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      setDirty(false);
    });
  }

  useAutosave({ data: dcas, dirty, save, persist: () => void actionSaveDcas(propertyId, dcas) });

  return (
    <div className="space-y-6">
      {/* Sticky action bar */}
      <div className="sticky top-16 z-30 -mx-4 border-b border-paper-line bg-paper-warm/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4 text-sm">
            <span className="text-ink-muted">
              <span className="font-semibold text-ink">{stats.answered}</span>/{stats.total} answered
            </span>
            <span className="hidden items-center gap-1.5 sm:flex">
              <Pill color="#B23A48" label={`${stats.criticals} critical`} />
              <Pill color="#C2872B" label={`${stats.concerning} concerning`} />
            </span>
            {pending ? (
              <span className="text-bronze-dark">Saving…</span>
            ) : dirty ? (
              <span className="text-ink-muted">Editing…</span>
            ) : savedAt ? (
              <span className="text-status-go">Saved · {savedAt}</span>
            ) : (
              <span className="text-ink-muted">Autosaves as you go</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/property/${propertyId}/dcas/print`} className="btn-ghost">
              PDF / Print
            </Link>
            <button onClick={save} disabled={pending} className="btn-primary disabled:opacity-60">
              {pending ? "Saving…" : "Save now"}
            </button>
          </div>
        </div>
      </div>

      {/* Header meta */}
      <section className="card p-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-1">
            <label className="label">Opportunity</label>
            <input className="field" value={dcas.opportunity} onChange={(e) => patchMeta({ opportunity: e.target.value })} />
          </div>
          <div className="sm:col-span-1">
            <label className="label">Date</label>
            <input type="date" className="field" value={dcas.date} onChange={(e) => patchMeta({ date: e.target.value })} />
          </div>
          <div className="sm:col-span-1">
            <label className="label">Guide price (from pipeline)</label>
            <input
              className="field bg-paper-warm/60"
              readOnly
              value={guidePrice != null ? new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(guidePrice) : "—"}
            />
          </div>
          <div className="sm:col-span-3">
            <label className="label">Description</label>
            <textarea
              className="field min-h-[60px]"
              value={dcas.description}
              onChange={(e) => patchMeta({ description: e.target.value })}
            />
          </div>
        </div>
      </section>

      {/* Sections */}
      {dcas.sections.map((section) => (
        <section key={section.key} className="card overflow-hidden">
          <header className="flex items-center justify-between border-b border-paper-line bg-paper-warm/40 px-5 py-3">
            <h2 className="font-serif text-lg text-ink">{section.title}</h2>
            <span className="text-xs text-ink-muted">
              {section.items.filter((i) => i.rating !== null).length}/{section.items.length}
            </span>
          </header>
          <ul className="divide-y divide-paper-line">
            {section.items.map((item) => (
              <li key={item.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr,auto] sm:items-start">
                <div className="min-w-0">
                  <p className="text-sm text-ink">{item.label}</p>
                  <input
                    className="field-sm mt-2"
                    placeholder="Notes / evidence…"
                    value={item.note ?? ""}
                    onChange={(e) => patchItem(section.key, item.id, { note: e.target.value })}
                  />
                </div>
                <RatingSelect
                  value={item.rating}
                  onChange={(rating) => patchItem(section.key, item.id, { rating })}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}

      {/* Overall comments */}
      <section className="card p-5">
        <label className="label">Overall comments</label>
        <textarea
          className="field min-h-[120px]"
          placeholder="Summary judgement, key risks, recommended next step…"
          value={dcas.overallComments}
          onChange={(e) => patchMeta({ overallComments: e.target.value })}
        />
      </section>

      <div className="flex justify-end gap-2">
        <Link href={`/property/${propertyId}`} className="btn-ghost">
          Back to overview
        </Link>
        <button onClick={save} disabled={pending} className="btn-primary disabled:opacity-60">
          {pending ? "Saving…" : "Save now"}
        </button>
      </div>
    </div>
  );
}

function RatingSelect({ value, onChange }: { value: RatingValue; onChange: (v: RatingValue) => void }) {
  return (
    <div className="flex items-center gap-1 sm:justify-end">
      {RATINGS.map((r) => {
        const active = r.value === value;
        const color = ratingColor(r.value);
        return (
          <button
            key={String(r.value)}
            type="button"
            title={r.label}
            onClick={() => onChange(r.value)}
            className="flex h-9 min-w-9 items-center justify-center rounded-md border px-2 text-xs font-semibold transition"
            style={{
              borderColor: active ? color : "#E7E4DE",
              background: active ? color : "#fff",
              color: active ? "#fff" : "#5B6976",
            }}
          >
            {r.short}
          </button>
        );
      })}
    </div>
  );
}

function Pill({ color, label }: { color: string; label: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ background: `${color}14`, color, border: `1px solid ${color}33` }}
    >
      {label}
    </span>
  );
}
