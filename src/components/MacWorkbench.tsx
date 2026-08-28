"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Mac, MacComp, MacSegment, MacSearchParams, MacSearchFilters } from "@/lib/types";
import { MAC_OPTIONS, MAC_RADIUS_OPTIONS, MAC_PROPERTY_TYPES, DEFAULT_SEARCH, emptyComp, emptySegment, segmentStats, pricePerM2, daysOnMarket, isFilledComp, TYPE_ROWS, segTypeRow } from "@/lib/macCalc";
import { actionSaveMac, actionResearchMac } from "@/app/actions";
import { gbp, num } from "@/lib/format";
import { useAutosave } from "@/lib/useAutosave";
import { MacSummaryView } from "./MacSummaryView";

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
  const [paramsOpen, setParamsOpen] = useState(true);
  const [activeSeg, setActiveSeg] = useState(0);
  const [researching, setResearching] = useState(false);
  const [aiMsg, setAiMsg] = useState<string | null>(null);
  const { status, savedAt, dirty, saveNow } = useAutosave(mac, (v) => actionSaveMac(propertyId, v));
  const pending = status === "saving";

  async function researchFill() {
    if (!window.confirm("Research the local market with AI and add comparable properties to the first segment? Findings will be added to the pipeline Notes.")) return;
    setResearching(true);
    setAiMsg(null);
    try {
      const res = await actionResearchMac(propertyId);
      if (res.ok) {
        setMac((m) => {
          const next = { ...m };
          next.search = {
            ...DEFAULT_SEARCH,
            ...m.search,
            searchArea: m.search?.searchArea || res.searchArea,
            propertyType: m.search?.propertyType || res.propertyType || DEFAULT_SEARCH.propertyType,
          };
          if (res.comps.length && next.segments.length) {
            const newComps = res.comps.map((c, i) => ({
              ...emptyComp(`ai-${Date.now()}-${i}`),
              property: c.property,
              area: c.area,
              askingPrice: c.askingPrice,
              beds: c.beds,
              propertyType: c.propertyType,
              totalM2: c.totalM2,
              status: c.status,
              agent: c.agent,
              onMarketSince: c.onMarketSince,
              link: c.link,
              comments: c.comments,
            }));
            const filled = next.segments[0].comps.filter(isFilledComp);
            next.segments = next.segments.map((s, idx) => (idx !== 0 ? s : { ...s, comps: filled.length ? [...filled, ...newComps] : newComps }));
          }
          return next;
        });
        setAiMsg(`Added ${res.comps.length} comparable${res.comps.length === 1 ? "" : "s"}${res.notes ? " · findings added to pipeline Notes" : ""}.`);
      } else {
        setAiMsg(res.error || "Research failed.");
      }
    } catch {
      setAiMsg("Research failed — try again.");
    } finally {
      setResearching(false);
    }
  }

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
  function duplicateComp(segKey: string, compId: string) {
    setMac((m) => ({
      ...m,
      segments: m.segments.map((s) => {
        if (s.key !== segKey) return s;
        const i = s.comps.findIndex((c) => c.id === compId);
        if (i === -1) return s;
        const copy = { ...s.comps[i], id: `${segKey}-${Date.now()}` };
        const comps = [...s.comps];
        comps.splice(i + 1, 0, copy); // insert directly below the row copied
        return { ...s, comps };
      }),
    }));
  }
  function addSegment() {
    setMac((m) => {
      const used = new Set(m.segments.map((s) => segTypeRow(s)).filter(Boolean) as string[]);
      // Offer the next summary type that isn't represented yet (3-bed Flat
      // onwards, since 1- and 2-bed are the standard first two segments).
      const label = TYPE_ROWS.slice(3).find((r) => !used.has(r)) ?? TYPE_ROWS.find((r) => !used.has(r)) ?? "Bungalow";
      return { ...m, segments: [...m.segments, emptySegment(`seg-${Date.now()}`, label, null, null)] };
    });
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
            {aiMsg && <span className="hidden text-xs text-status-go lg:inline">{aiMsg}</span>}
            <button onClick={researchFill} disabled={researching} className="btn-ghost disabled:opacity-60" title="Research the local market with AI and add comparables">
              {researching ? "Researching…" : "✨ AI auto-fill"}
            </button>
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
        <button
          onClick={() => setParamsOpen((o) => !o)}
          aria-expanded={paramsOpen}
          className="flex w-full items-center justify-between gap-3 border-b border-paper-line bg-paper-warm/70 px-5 py-2.5 text-left transition hover:bg-paper-warm"
        >
          <span className="font-serif text-lg text-ink">Market Search Parameters</span>
          <span className="flex items-center gap-3">
            {!paramsOpen && (
              <span className="hidden truncate text-xs text-ink-muted sm:inline">
                {[search.searchArea, search.radius, search.propertyType].filter(Boolean).join(" · ")}
              </span>
            )}
            <span className="text-xs text-ink-muted">{paramsOpen ? "Hide ▲" : "Show ▼"}</span>
          </span>
        </button>
        <div className={`${paramsOpen ? "grid" : "hidden"} gap-x-8 gap-y-4 p-5 lg:grid-cols-[1.7fr,1fr]`}>
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

      {/* Segment tabs — one table at a time (1 bed / 2 bed / …) */}
      <div className="flex flex-wrap items-center gap-1 border-b border-paper-line">
        {mac.segments.map((seg, i) => {
          const active = i === Math.min(activeSeg, mac.segments.length - 1);
          return (
            <button
              key={seg.key}
              onClick={() => setActiveSeg(i)}
              className="-mb-px rounded-t-lg border border-b-0 px-4 py-2 text-sm font-medium transition"
              style={{
                borderColor: active ? "#E7E4DE" : "transparent",
                background: active ? "#fff" : "transparent",
                color: active ? "#16202B" : "#5B6976",
              }}
            >
              {seg.label || `Segment ${i + 1}`}
              <span className="ml-2 text-xs text-ink-muted">{seg.comps.filter(isFilledComp).length}</span>
            </button>
          );
        })}
        <button onClick={addSegment} className="ml-2 px-3 py-2 text-sm text-bronze-dark hover:underline">
          + Add segment
        </button>
      </div>

      {mac.segments[Math.min(activeSeg, mac.segments.length - 1)] && (
        (() => {
          const idx = Math.min(activeSeg, mac.segments.length - 1);
          const seg = mac.segments[idx];
          return (
            <SegmentBlock
              key={seg.key}
              seg={seg}
              refDate={mac.date}
              onMeta={(patch) => patchSegment(seg.key, patch)}
              onComp={(compId, patch) => patchComp(seg.key, compId, patch)}
              onAddComp={() => addComp(seg.key)}
              onRemoveComp={(compId) => removeComp(seg.key, compId)}
              onDuplicateComp={(compId) => duplicateComp(seg.key, compId)}
              onRemoveSegment={
                mac.segments.length > 1
                  ? () => {
                      removeSegment(seg.key);
                      setActiveSeg(0);
                    }
                  : undefined
              }
            />
          );
        })()
      )}

      <div className="flex items-center justify-end">
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

// Column definitions mirroring the MAC comparables sheet. `req` marks the
// fields the sheet flags with a red asterisk; `calc` columns are computed.
const COLS: { key: string; label: string; req?: boolean; calc?: boolean; tint?: "sage" | "tan"; w: number }[] = [
  { key: "property", label: "Property", tint: "sage", w: 150 },
  { key: "area", label: "Area", tint: "sage", w: 120 },
  { key: "askingPrice", label: "Asking Price", req: true, w: 110 },
  { key: "beds", label: "No. of Beds", req: true, w: 90 },
  { key: "condition", label: "Condition", tint: "sage", w: 120 },
  { key: "kerbAppeal", label: "Kerb Appeal", tint: "sage", w: 120 },
  { key: "proximity", label: "Proximity to Project", tint: "sage", w: 150 },
  { key: "similarity", label: "Similarity To Your Project", tint: "sage", w: 160 },
  { key: "totalM2", label: "Total m2", req: true, w: 90 },
  { key: "m2Source", label: "m2 Source", tint: "sage", w: 110 },
  { key: "pricePerM2", label: "£ Per m2", calc: true, w: 100 },
  { key: "agent", label: "Agent's Name", tint: "sage", w: 130 },
  { key: "onMarketSince", label: "On Market Since", req: true, w: 130 },
  { key: "daysOnMarket", label: "Days on Market", calc: true, w: 110 },
  { key: "status", label: "Status", tint: "tan", w: 110 },
  { key: "comments", label: "Comments", tint: "sage", w: 200 },
  { key: "link", label: "Link", tint: "sage", w: 120 },
];

function headStyle(c: (typeof COLS)[number]): React.CSSProperties {
  if (c.req) return { background: "#fff", color: "#C00000" };
  if (c.calc) return { background: "#fff", color: "#16202B" };
  if (c.tint === "tan") return { background: "#DED8C8", color: "#16202B" };
  return { background: "#EAEEE3", color: "#16202B" };
}

function SegmentBlock({
  seg,
  refDate,
  onMeta,
  onComp,
  onAddComp,
  onRemoveComp,
  onDuplicateComp,
  onRemoveSegment,
}: {
  seg: MacSegment;
  refDate: string;
  onMeta: (patch: Partial<MacSegment>) => void;
  onComp: (compId: string, patch: Partial<MacComp>) => void;
  onAddComp: () => void;
  onRemoveComp: (compId: string) => void;
  onDuplicateComp: (compId: string) => void;
  onRemoveSegment?: () => void;
}) {
  const stats = useMemo(() => segmentStats(seg, refDate), [seg, refDate]);
  const cell = "w-full min-w-0 bg-transparent px-1 py-1 text-[12px] outline-none focus:bg-bronze/10 rounded-sm";

  return (
    <section className="card overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-paper-line bg-paper-warm/40 px-5 py-3">
        <label className="flex items-center gap-2">
          <select
            className="rounded-md border border-paper-line bg-white px-2 py-1 font-serif text-lg text-ink outline-none focus:border-bronze"
            value={segTypeRow(seg) ?? ""}
            onChange={(e) => onMeta({ label: e.target.value })}
            title="Which summary row this segment counts towards"
          >
            {!segTypeRow(seg) && <option value="">{seg.label || "Choose a type…"}</option>}
            {TYPE_ROWS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <span className="text-[11px] text-ink-muted">counts in the summary as this type</span>
        </label>
        <div className="flex flex-wrap items-center gap-3">
          {/* Market totals from the portal search — these drive the sales ratio. */}
          <label className="flex items-center gap-1.5 text-xs text-ink-muted">
            Total inc SSTC
            <input
              type="number"
              className="field-sm w-20"
              value={seg.totalIncSstc ?? ""}
              onChange={(e) => onMeta({ totalIncSstc: toNum(e.target.value) })}
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-ink-muted">
            Unsold exc SSTC
            <input
              type="number"
              className="field-sm w-20"
              value={seg.totalExcSstc ?? ""}
              onChange={(e) => onMeta({ totalExcSstc: toNum(e.target.value) })}
            />
          </label>
          {onRemoveSegment && (
            <button onClick={onRemoveSegment} className="text-xs text-ink-muted hover:text-status-stop">
              Remove segment
            </button>
          )}
        </div>
      </header>

      {/* Comparables table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12px]">
          <colgroup>
            <col style={{ width: 34 }} />
            {COLS.map((c) => <col key={c.key} style={{ width: c.w }} />)}
            <col style={{ width: 70 }} />
          </colgroup>
          <thead>
            <tr>
              <th className="border border-[#C9C6BF] bg-[#EAEEE3] px-1 py-1.5 text-[11px] font-semibold" />
              {COLS.map((c) => (
                <th
                  key={c.key}
                  className="border border-[#C9C6BF] px-1.5 py-1.5 text-center text-[11px] font-semibold leading-tight"
                  style={headStyle(c)}
                  title={c.calc ? "Calculated automatically" : c.req ? "Required" : undefined}
                >
                  {c.label}
                  {c.req && " *"}
                </th>
              ))}
              <th className="border border-[#C9C6BF] bg-[#EAEEE3] px-1 py-1.5 text-[11px] font-semibold">Row</th>
            </tr>
          </thead>
          <tbody>
            {seg.comps.map((comp, i) => {
              const ppm2 = pricePerM2(comp);
              const dom = daysOnMarket(comp);
              return (
                <tr key={comp.id} className="hover:bg-paper-warm/40">
                  <td className="border border-[#DDDBD6] px-1 text-center text-[11px] tabular-nums text-ink-muted">{i + 1}</td>
                  <td className="border border-[#DDDBD6]"><input className={cell} value={comp.property} onChange={(e) => onComp(comp.id, { property: e.target.value })} /></td>
                  <td className="border border-[#DDDBD6]"><input className={cell} value={comp.area} onChange={(e) => onComp(comp.id, { area: e.target.value })} /></td>
                  <td className="border border-[#DDDBD6]"><input type="number" className={`${cell} text-right tabular-nums`} value={comp.askingPrice ?? ""} onChange={(e) => onComp(comp.id, { askingPrice: toNum(e.target.value) })} /></td>
                  <td className="border border-[#DDDBD6]"><input type="number" className={`${cell} text-right tabular-nums`} value={comp.beds ?? ""} onChange={(e) => onComp(comp.id, { beds: toNum(e.target.value) })} /></td>
                  <td className="border border-[#DDDBD6]">
                    <select className={cell} value={comp.condition} onChange={(e) => onComp(comp.id, { condition: e.target.value })}>
                      <option value="">—</option>
                      {MAC_OPTIONS.condition.map((o) => <option key={o}>{o}</option>)}
                    </select>
                  </td>
                  <td className="border border-[#DDDBD6]">
                    <select className={cell} value={comp.kerbAppeal} onChange={(e) => onComp(comp.id, { kerbAppeal: e.target.value })}>
                      <option value="">—</option>
                      {MAC_OPTIONS.kerbAppeal.map((o) => <option key={o}>{o}</option>)}
                    </select>
                  </td>
                  <td className="border border-[#DDDBD6]">
                    <select className={cell} value={comp.proximity} onChange={(e) => onComp(comp.id, { proximity: e.target.value })}>
                      <option value="">—</option>
                      {MAC_OPTIONS.proximity.map((o) => <option key={o}>{o}</option>)}
                    </select>
                  </td>
                  <td className="border border-[#DDDBD6]">
                    <select className={cell} value={comp.similarity} onChange={(e) => onComp(comp.id, { similarity: e.target.value })}>
                      <option value="">—</option>
                      {MAC_OPTIONS.similarity.map((o) => <option key={o}>{o}</option>)}
                    </select>
                  </td>
                  <td className="border border-[#DDDBD6]"><input type="number" className={`${cell} text-right tabular-nums`} value={comp.totalM2 ?? ""} onChange={(e) => onComp(comp.id, { totalM2: toNum(e.target.value) })} /></td>
                  <td className="border border-[#DDDBD6]">
                    <select className={cell} value={comp.m2Source} onChange={(e) => onComp(comp.id, { m2Source: e.target.value })}>
                      <option value="">—</option>
                      {MAC_OPTIONS.m2Source.map((o) => <option key={o}>{o}</option>)}
                    </select>
                  </td>
                  <td className="border border-[#DDDBD6] bg-paper-warm/50 px-1.5 text-right tabular-nums text-ink-soft">{ppm2 ? gbp(ppm2) : "—"}</td>
                  <td className="border border-[#DDDBD6]"><input className={cell} value={comp.agent} onChange={(e) => onComp(comp.id, { agent: e.target.value })} /></td>
                  <td className="border border-[#DDDBD6]"><input type="date" className={`${cell} tabular-nums`} value={comp.onMarketSince} onChange={(e) => onComp(comp.id, { onMarketSince: e.target.value })} /></td>
                  <td className="border border-[#DDDBD6] bg-paper-warm/50 px-1.5 text-right tabular-nums text-ink-soft">{dom ?? "—"}</td>
                  <td className="border border-[#DDDBD6]">
                    <select className={cell} value={comp.status} onChange={(e) => onComp(comp.id, { status: e.target.value })}>
                      <option value="">—</option>
                      {MAC_OPTIONS.status.map((o) => <option key={o}>{o}</option>)}
                    </select>
                  </td>
                  <td className="border border-[#DDDBD6]"><input className={cell} value={comp.comments} onChange={(e) => onComp(comp.id, { comments: e.target.value })} /></td>
                  <td className="border border-[#DDDBD6]">
                    <span className="flex items-center gap-1">
                      <input className={cell} value={comp.link} onChange={(e) => onComp(comp.id, { link: e.target.value })} placeholder="https://" />
                      {comp.link && (
                        <a href={comp.link} target="_blank" rel="noreferrer" title="Open listing" className="shrink-0 pr-1 text-bronze-dark">↗</a>
                      )}
                    </span>
                  </td>
                  <td className="border border-[#DDDBD6] px-1">
                    <span className="flex items-center justify-center gap-1.5">
                      <button onClick={() => onDuplicateComp(comp.id)} title="Copy this row" className="text-ink-muted hover:text-bronze-dark">⧉</button>
                      <button onClick={() => onRemoveComp(comp.id)} title="Remove this row" className="text-ink-muted hover:text-status-stop">✕</button>
                    </span>
                  </td>
                </tr>
              );
            })}
            {seg.comps.length === 0 && (
              <tr>
                <td colSpan={COLS.length + 2} className="border border-[#DDDBD6] px-3 py-6 text-center text-ink-muted">
                  No comparables yet — add a row below.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2 px-5 py-3">
        <button onClick={onAddComp} className="btn-ghost px-3 py-1.5 text-xs">+ Add row</button>
        <span className="text-[11px] text-ink-muted">⧉ copies a row · ✕ removes it · £ Per m2 and Days on Market calculate themselves</span>
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
