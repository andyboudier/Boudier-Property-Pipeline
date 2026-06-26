"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Mac, MacComp, MacSegment, MacSearchParams, MacSearchFilters } from "@/lib/types";
import { MAC_OPTIONS, MAC_RADIUS_OPTIONS, MAC_PROPERTY_TYPES, DEFAULT_SEARCH, emptyComp, emptySegment, segmentStats, pricePerM2, daysOnMarket } from "@/lib/macCalc";
import { actionSaveMac } from "@/app/actions";
import { gbp, num } from "@/lib/format";
import { useAutosave } from "@/lib/useAutosave";
import { MacSummaryView } from "./MacSummaryView";

const RADIUS_OPTS = ["Exact Area Only", "Within 1/4 mile", "Within 1/2 mile", "Within 1 mile", "Within 3 miles"];
const TYPE_FILTERS = ["Flats/Apartments", "Houses", "Bungalows", "Any"];
const FILTER_ROWS: [keyof MacSearchFilters, string][] = [
  ["garden", "Garden"],
  ["parking", "Parking"],
  ["newHome", "New Home"],
  ["retirementHomes", "Retirement Homes"],
  ["shared", "Shared"],
  ["auction", "Auction"],
];

export function MacWorkbench({ propertyId, initial }: { propertyId: string; initial: Mac }) {
  const [mac, setMac] = useState<Mac>(initial);
  const [showSummary, setShowSummary] = useState(false);
  const { status, savedAt, dirty, saveNow } = useAutosave(mac, (v) => actionSaveMac(propertyId, v));
  const pending = status === "saving";

  const touch = () => {}; // edits are picked up by autosave via state change

  function patchMeta(patch: Partial<Mac>) {
    setMac((m) => ({ ...m, ...patch }));
    touch();
  }
  const search = mac.search ?? DEFAULT_SEARCH;
  function patchSearch(patch: Partial<MacSearchParams>) {
    setMac((m) => ({ ...m, search: { ...DEFAULT_SEARCH, ...m.search, ...patch } }));
  }
  function patchFilter(key: keyof MacSearchFilters, value: boolean) {
    setMac((m) => ({
      ...m,
      search: { ...DEFAULT_SEARCH, ...m.search, filters: { ...DEFAULT_SEARCH.filters, ...m.search?.filters, [key]: value } },
    }));
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
            <button onClick={() => setShowSummary(true)} className="btn-ghost">Summary</button>
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

      {/* Market search parameters */}
      <section className="card overflow-hidden">
        <h2 className="border-b border-paper-line bg-paper-warm/70 px-5 py-2.5 text-center font-serif text-lg text-ink">
          Market Search Parameters
        </h2>
        <div className="grid gap-x-8 gap-y-4 p-5 lg:grid-cols-[1.7fr,1fr]">
          {/* Left — search fields */}
          <div className="space-y-2.5">
            <ParamRow label="Search Area">
              <input className="field-sm w-full" value={search.searchArea} onChange={(e) => patchSearch({ searchArea: e.target.value })} />
            </ParamRow>
            <ParamRow label="Radius">
              <select className="field-sm w-full" value={search.radius} onChange={(e) => patchSearch({ radius: e.target.value })}>
                {MAC_RADIUS_OPTIONS.map((o) => <option key={o}>{o}</option>)}
              </select>
            </ParamRow>
            <div className="grid gap-x-8 gap-y-2.5 sm:grid-cols-2">
              <ParamRow label="Price Range (Minimum)">
                <input type="number" placeholder="Min Price" className="field-sm w-full" value={search.minPrice ?? ""} onChange={(e) => patchSearch({ minPrice: toNum(e.target.value) })} />
              </ParamRow>
              <ParamRow label="No. of Properties inc Sold STC">
                <input type="number" className="field-sm w-full" value={search.totalIncSstc ?? ""} onChange={(e) => patchSearch({ totalIncSstc: toNum(e.target.value) })} />
              </ParamRow>
              <ParamRow label="Price Range (Maximum)">
                <input type="number" placeholder="Max Price" className="field-sm w-full" value={search.maxPrice ?? ""} onChange={(e) => patchSearch({ maxPrice: toNum(e.target.value) })} />
              </ParamRow>
              <ParamRow label="No. of Properties exc Sold STC">
                <input type="number" className="field-sm w-full" value={search.totalExcSstc ?? ""} onChange={(e) => patchSearch({ totalExcSstc: toNum(e.target.value) })} />
              </ParamRow>
              <ParamRow label="No. of Bedrooms (Minimum)">
                <input type="number" className="field-sm w-full" value={search.minBeds ?? ""} onChange={(e) => patchSearch({ minBeds: toNum(e.target.value) })} />
              </ParamRow>
              <ParamRow label="No. of Bedrooms (Maximum)">
                <input type="number" className="field-sm w-full" value={search.maxBeds ?? ""} onChange={(e) => patchSearch({ maxBeds: toNum(e.target.value) })} />
              </ParamRow>
            </div>
            <ParamRow label="Type of Property">
              <select className="field-sm w-full" value={search.propertyType} onChange={(e) => patchSearch({ propertyType: e.target.value })}>
                {MAC_PROPERTY_TYPES.map((o) => <option key={o}>{o}</option>)}
              </select>
            </ParamRow>
          </div>

          {/* Right — filters */}
          <div className="sm:max-w-xs">
            <div className="mb-1 flex items-center justify-between border-b border-paper-line pb-1 text-sm font-semibold text-ink">
              <span>Filters</span>
              <span>On?</span>
            </div>
            {FILTER_ROWS.map(([key, label]) => (
              <div key={key} className="flex items-center justify-between border-b border-paper-line/60 py-1.5 text-sm">
                <span className="text-ink-soft">{label}</span>
                <YesNo value={search.filters[key]} onChange={(v) => patchFilter(key, v)} />
              </div>
            ))}
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

      {showSummary && <MacSummaryView mac={mac} onClose={() => setShowSummary(false)} />}
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

function ParamRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-40 shrink-0 text-right text-xs font-medium text-ink-muted sm:text-sm">{label}:</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function YesNo({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="rounded-md border px-3 py-0.5 text-xs font-semibold transition"
      style={{
        borderColor: value ? "#2E7D5B" : "#E7E4DE",
        background: value ? "#2E7D5B14" : "#fff",
        color: value ? "#2E7D5B" : "#8A8F94",
      }}
    >
      {value ? "Yes" : "No"}
    </button>
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
