"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Mac, MacComp, MacSegment } from "@/lib/types";
import { MAC_OPTIONS, emptyComp, emptySegment, segmentStats, pricePerM2, daysOnMarket } from "@/lib/macCalc";
import { actionSaveMac } from "@/app/actions";
import { gbp, num } from "@/lib/format";
import { useAutosave } from "@/lib/useAutosave";

const RADIUS_OPTS = ["Exact Area Only", "Within 1/4 mile", "Within 1/2 mile", "Within 1 mile", "Within 3 miles"];
const TYPE_FILTERS = ["Flats/Apartments", "Houses", "Bungalows", "Any"];

export function MacWorkbench({ propertyId, initial }: { propertyId: string; initial: Mac }) {
  const [mac, setMac] = useState<Mac>(initial);
  const { status, savedAt, dirty, saveNow } = useAutosave(mac, (v) => actionSaveMac(propertyId, v));
  const pending = status === "saving";

  const touch = () => {}; // edits are picked up by autosave via state change

  function patchMeta(patch: Partial<Mac>) {
    setMac((m) => ({ ...m, ...patch }));
    touch();
  }
  function patchSegment(key: string, patch: Partial<MacSegment>) {
    setMac((m) => ({ ...m, segments: m.segments.map((s) => (s.key === key ? { ...s, ...patch } : s)) }));
    touch();
  }
  function patchComp(segKey: string, compId: string, patch: Partial<MacComp>) {
    setMac((m) => ({
      ...m,
      segments: m.segments.map((s) =>
        s.key !== segKey ? s : { ...s, comps: s.comps.map((c) => (c.id === compId ? { ...c, ...patch } : c)) },
      ),
    }));
    touch();
  }
  function addComp(segKey: string) {
    setMac((m) => ({
      ...m,
      segments: m.segments.map((s) =>
        s.key !== segKey ? s : { ...s, comps: [...s.comps, emptyComp(`${segKey}-${Date.now()}`)] },
      ),
    }));
    touch();
  }
  function removeComp(segKey: string, compId: string) {
    setMac((m) => ({
      ...m,
      segments: m.segments.map((s) =>
        s.key !== segKey ? s : { ...s, comps: s.comps.filter((c) => c.id !== compId) },
      ),
    }));
    touch();
  }
  function addSegment() {
    const idx = mac.segments.length + 1;
    setMac((m) => ({ ...m, segments: [...m.segments, emptySegment(`seg-${Date.now()}`, `Segment ${idx}`, null, null)] }));
    touch();
  }
  function removeSegment(key: string) {
    setMac((m) => ({ ...m, segments: m.segments.filter((s) => s.key !== key) }));
    touch();
  }

  return (
    <div className="space-y-6">
      {/* Sticky bar */}
      <div className="sticky top-16 z-30 -mx-4 border-b border-paper-line bg-paper-warm/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-ink-muted">
            {mac.segments.length} segment{mac.segments.length === 1 ? "" : "s"}
            {pending ? (
              <span className="ml-3 text-bronze-dark">Saving…</span>
            ) : dirty ? (
              <span className="ml-3 text-ink-muted">Editing…</span>
            ) : savedAt ? (
              <span className="ml-3 text-status-go">Saved · {savedAt}</span>
            ) : (
              <span className="ml-3 text-ink-muted">Autosaves as you go</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/property/${propertyId}/mac/print`} className="btn-ghost">PDF / Print</Link>
            <button onClick={saveNow} disabled={pending} className="btn-primary disabled:opacity-60">
              {pending ? "Saving…" : "Save now"}
            </button>
          </div>
        </div>
      </div>

      {/* Header */}
      <section className="card p-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label">Project name</label>
            <input className="field" value={mac.projectName} onChange={(e) => patchMeta({ projectName: e.target.value })} />
          </div>
          <div>
            <label className="label">Date</label>
            <input type="date" className="field" value={mac.date} onChange={(e) => patchMeta({ date: e.target.value })} />
          </div>
          <div>
            <label className="label">Description</label>
            <input className="field" value={mac.description} onChange={(e) => patchMeta({ description: e.target.value })} />
          </div>
        </div>
      </section>

      {/* Segments */}
      {mac.segments.map((seg) => (
        <SegmentBlock
          key={seg.key}
          seg={seg}
          refDate={mac.date}
          onMeta={(patch) => patchSegment(seg.key, patch)}
          onComp={(compId, patch) => patchComp(seg.key, compId, patch)}
          onAddComp={() => addComp(seg.key)}
          onRemoveComp={(compId) => removeComp(seg.key, compId)}
          onRemoveSegment={mac.segments.length > 1 ? () => removeSegment(seg.key) : undefined}
        />
      ))}

      <div className="flex items-center justify-between">
        <button onClick={addSegment} className="btn-ghost">+ Add segment</button>
        <div className="flex gap-2">
          <Link href={`/property/${propertyId}`} className="btn-ghost">Back to overview</Link>
          <button onClick={saveNow} disabled={pending} className="btn-primary disabled:opacity-60">
            {pending ? "Saving…" : "Save now"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SegmentBlock({
  seg,
  refDate,
  onMeta,
  onComp,
  onAddComp,
  onRemoveComp,
  onRemoveSegment,
}: {
  seg: MacSegment;
  refDate: string;
  onMeta: (patch: Partial<MacSegment>) => void;
  onComp: (compId: string, patch: Partial<MacComp>) => void;
  onAddComp: () => void;
  onRemoveComp: (compId: string) => void;
  onRemoveSegment?: () => void;
}) {
  const stats = useMemo(() => segmentStats(seg, refDate), [seg, refDate]);

  return (
    <section className="card overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-paper-line bg-paper-warm/40 px-5 py-3">
        <input
          className="bg-transparent font-serif text-lg text-ink outline-none focus:underline"
          value={seg.label}
          onChange={(e) => onMeta({ label: e.target.value })}
        />
        {onRemoveSegment && (
          <button onClick={onRemoveSegment} className="text-xs text-ink-muted hover:text-status-stop">
            Remove segment
          </button>
        )}
      </header>

      {/* Search parameters */}
      <div className="grid gap-3 border-b border-paper-line px-5 py-4 sm:grid-cols-3 lg:grid-cols-6">
        <Labeled label="Search area">
          <input className="field-sm" value={seg.searchArea} onChange={(e) => onMeta({ searchArea: e.target.value })} />
        </Labeled>
        <Labeled label="Radius">
          <select className="field-sm" value={seg.radius} onChange={(e) => onMeta({ radius: e.target.value })}>
            {RADIUS_OPTS.map((o) => <option key={o}>{o}</option>)}
          </select>
        </Labeled>
        <Labeled label="Type filter">
          <select className="field-sm" value={seg.propertyTypeFilter} onChange={(e) => onMeta({ propertyTypeFilter: e.target.value })}>
            {TYPE_FILTERS.map((o) => <option key={o}>{o}</option>)}
          </select>
        </Labeled>
        <Labeled label="Min / Max beds">
          <div className="flex gap-1">
            <input type="number" className="field-sm" value={seg.minBeds ?? ""} onChange={(e) => onMeta({ minBeds: toNum(e.target.value) })} />
            <input type="number" className="field-sm" value={seg.maxBeds ?? ""} onChange={(e) => onMeta({ maxBeds: toNum(e.target.value) })} />
          </div>
        </Labeled>
        <Labeled label="Total (inc SSTC)">
          <input type="number" className="field-sm" value={seg.totalIncSstc ?? ""} onChange={(e) => onMeta({ totalIncSstc: toNum(e.target.value) })} />
        </Labeled>
        <Labeled label="Unsold (exc SSTC)">
          <input type="number" className="field-sm" value={seg.totalExcSstc ?? ""} onChange={(e) => onMeta({ totalExcSstc: toNum(e.target.value) })} />
        </Labeled>
      </div>

      {/* Comps */}
      <div className="space-y-3 px-5 py-4">
        {seg.comps.map((comp, i) => {
          const ppm2 = pricePerM2(comp);
          const dom = daysOnMarket(comp, refDate);
          return (
            <div key={comp.id} className="rounded-lg border border-paper-line p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-bronze-dark">Comp {i + 1}</span>
                <div className="flex items-center gap-2 text-xs">
                  <span className="rounded bg-paper-warm px-2 py-0.5 tabular-nums text-ink-soft">
                    £/m²: <strong>{ppm2 ? num(ppm2) : "—"}</strong>
                  </span>
                  <span className="rounded bg-paper-warm px-2 py-0.5 tabular-nums text-ink-soft">
                    DoM: <strong>{dom ?? "—"}</strong>
                  </span>
                  {seg.comps.length > 1 && (
                    <button onClick={() => onRemoveComp(comp.id)} className="text-ink-muted hover:text-status-stop">✕</button>
                  )}
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <Labeled label="Property"><input className="field-sm" value={comp.property} onChange={(e) => onComp(comp.id, { property: e.target.value })} /></Labeled>
                <Labeled label="Area"><input className="field-sm" value={comp.area} onChange={(e) => onComp(comp.id, { area: e.target.value })} /></Labeled>
                <Labeled label="Type">
                  <select className="field-sm" value={comp.propertyType} onChange={(e) => onComp(comp.id, { propertyType: e.target.value })}>
                    <option value="">—</option>
                    {MAC_OPTIONS.propertyType.map((o) => <option key={o}>{o}</option>)}
                  </select>
                </Labeled>
                <Labeled label="Beds"><input type="number" className="field-sm" value={comp.beds ?? ""} onChange={(e) => onComp(comp.id, { beds: toNum(e.target.value) })} /></Labeled>
                <Labeled label="Asking price (£)"><input type="number" className="field-sm" value={comp.askingPrice ?? ""} onChange={(e) => onComp(comp.id, { askingPrice: toNum(e.target.value) })} /></Labeled>
                <Labeled label="Total m²"><input type="number" className="field-sm" value={comp.totalM2 ?? ""} onChange={(e) => onComp(comp.id, { totalM2: toNum(e.target.value) })} /></Labeled>
                <Labeled label="m² source">
                  <select className="field-sm" value={comp.m2Source} onChange={(e) => onComp(comp.id, { m2Source: e.target.value })}>
                    <option value="">—</option>
                    {MAC_OPTIONS.m2Source.map((o) => <option key={o}>{o}</option>)}
                  </select>
                </Labeled>
                <Labeled label="Status">
                  <select className="field-sm" value={comp.status} onChange={(e) => onComp(comp.id, { status: e.target.value })}>
                    <option value="">—</option>
                    {MAC_OPTIONS.status.map((o) => <option key={o}>{o}</option>)}
                  </select>
                </Labeled>
                <Labeled label="Condition">
                  <select className="field-sm" value={comp.condition} onChange={(e) => onComp(comp.id, { condition: e.target.value })}>
                    <option value="">—</option>
                    {MAC_OPTIONS.condition.map((o) => <option key={o}>{o}</option>)}
                  </select>
                </Labeled>
                <Labeled label="Kerb appeal">
                  <select className="field-sm" value={comp.kerbAppeal} onChange={(e) => onComp(comp.id, { kerbAppeal: e.target.value })}>
                    <option value="">—</option>
                    {MAC_OPTIONS.kerbAppeal.map((o) => <option key={o}>{o}</option>)}
                  </select>
                </Labeled>
                <Labeled label="Proximity">
                  <select className="field-sm" value={comp.proximity} onChange={(e) => onComp(comp.id, { proximity: e.target.value })}>
                    <option value="">—</option>
                    {MAC_OPTIONS.proximity.map((o) => <option key={o}>{o}</option>)}
                  </select>
                </Labeled>
                <Labeled label="Similarity">
                  <select className="field-sm" value={comp.similarity} onChange={(e) => onComp(comp.id, { similarity: e.target.value })}>
                    <option value="">—</option>
                    {MAC_OPTIONS.similarity.map((o) => <option key={o}>{o}</option>)}
                  </select>
                </Labeled>
                <Labeled label="Agent"><input className="field-sm" value={comp.agent} onChange={(e) => onComp(comp.id, { agent: e.target.value })} /></Labeled>
                <Labeled label="On market since"><input type="date" className="field-sm" value={comp.onMarketSince} onChange={(e) => onComp(comp.id, { onMarketSince: e.target.value })} /></Labeled>
                <Labeled label="Listing link"><input className="field-sm" value={comp.link} onChange={(e) => onComp(comp.id, { link: e.target.value })} /></Labeled>
                <Labeled label="Comments" full><input className="field-sm" value={comp.comments} onChange={(e) => onComp(comp.id, { comments: e.target.value })} /></Labeled>
              </div>
            </div>
          );
        })}
        <button onClick={onAddComp} className="btn-ghost w-full">+ Add comparable</button>
      </div>

      {/* Segment summary */}
      <div className="grid grid-cols-2 gap-px border-t border-paper-line bg-paper-line sm:grid-cols-4 lg:grid-cols-7">
        <StatCell label="Comps" value={String(stats.count)} />
        <StatCell label="Avg m²" value={stats.averageM2 ? num(stats.averageM2) : "—"} />
        <StatCell label="Largest / smallest" value={stats.largestM2 ? `${num(stats.largestM2)} / ${num(stats.smallestM2)}` : "—"} />
        <StatCell label="Avg £/m²" value={stats.avgPricePerM2 ? num(stats.avgPricePerM2) : "—"} />
        <StatCell label="Avg asking" value={stats.avgAskingPrice ? gbp(stats.avgAskingPrice) : "—"} />
        <StatCell label="Avg days on mkt" value={stats.avgDaysOnMarket ? num(stats.avgDaysOnMarket) : "—"} />
        <StatCell
          label="Sales ratio"
          value={`${Math.round(stats.salesRatio * 100)}%`}
          color={stats.salesRatio >= 0.5 ? "#2E7D5B" : "#C2872B"}
        />
      </div>
    </section>
  );
}

function Labeled({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={`block ${full ? "sm:col-span-2 lg:col-span-4" : ""}`}>
      <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-ink-muted">{label}</span>
      {children}
    </label>
  );
}

function StatCell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-white px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wide text-ink-muted">{label}</div>
      <div className="mt-0.5 text-sm font-semibold tabular-nums" style={{ color: color ?? "#16202B" }}>{value}</div>
    </div>
  );
}

function toNum(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}
