"use client";

import { useEffect, useMemo } from "react";
import type { Mac } from "@/lib/types";
import { macSummary, type MacProfileRow, type SegmentStats } from "@/lib/macCalc";
import { gbp, num, pct } from "@/lib/format";

export function MacSummaryView({ mac, onClose }: { mac: Mac; onClose: () => void }) {
  const data = useMemo(() => macSummary(mac), [mac]);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="my-6 w-full max-w-4xl rounded-xl bg-paper-warm shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title bar */}
        <div className="flex items-center justify-between rounded-t-xl bg-ink px-6 py-4 text-paper">
          <div>
            <h2 className="wordmark font-serif text-lg font-semibold tracking-wide">MAC REPORT SUMMARY</h2>
            <p className="text-xs text-paper/70">
              {[mac.projectName, mac.date && new Date(mac.date).toLocaleDateString("en-GB")].filter(Boolean).join("  ·  ")}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-md px-2 py-1 text-paper/80 hover:bg-white/10 hover:text-white">
            ✕
          </button>
        </div>

        <div className="grid gap-6 p-6 lg:grid-cols-2">
          {/* LEFT — per-segment stats */}
          <div className="space-y-4">
            {data.segments.map((s, i) => (
              <SegmentBlock key={i} label={s.label} st={s.stats} />
            ))}
          </div>

          {/* RIGHT — profiles */}
          <div className="space-y-6">
            <ProfileTable
              title="Profile By Property Type"
              rows={data.byType.rows}
              footer={[data.byType.flats, data.byType.houses, data.byType.all]}
            />
            <ProfileTable title="Profile By No. Of Bedrooms" rows={data.byBeds.rows} footer={[data.byBeds.all]} />
          </div>
        </div>
      </div>
    </div>
  );
}

function SegmentBlock({ label, st }: { label: string; st: SegmentStats }) {
  return (
    <section className="card p-4">
      <h3 className="mb-2 font-serif text-base text-ink">{label}</h3>
      <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
        <Stat label="Average m²" value={st.totalProperties ? `${num(st.averageM2, 1)} m²` : "—"} />
        <Stat label="No. Properties Unsold" value={num(st.unsold)} />
        <Stat label="Largest" value={st.largestM2 ? `${num(st.largestM2, 1)} m²` : "—"} />
        <Stat label="Total No. Properties" value={num(st.totalProperties)} />
        <Stat label="Smallest" value={st.smallestM2 ? `${num(st.smallestM2, 1)} m²` : "—"} />
        <Stat label="Sales Ratio" value={pct(st.salesRatio)} />
        <Stat label="Average £ per m²" value={st.avgPricePerM2 ? gbp(st.avgPricePerM2) : "—"} />
        <Stat label="Avg Days on Market" value={st.avgDaysOnMarket ? num(st.avgDaysOnMarket) : "—"} />
        <Stat label="Avg Asking Price" value={st.avgAskingPrice ? gbp(st.avgAskingPrice) : "—"} />
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-paper-line/70 py-0.5 text-sm">
      <span className="text-ink-muted">{label}</span>
      <span className="tabular-nums font-medium text-ink">{value}</span>
    </div>
  );
}

function ProfileTable({ title, rows, footer }: { title: string; rows: MacProfileRow[]; footer: MacProfileRow[] }) {
  return (
    <section className="card overflow-hidden">
      <h3 className="border-b border-paper-line bg-paper-warm/60 px-4 py-2 font-serif text-base text-ink">{title}</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-ink-muted">
            <th className="px-4 py-1.5 text-left font-medium"></th>
            <th className="px-2 py-1.5 text-right font-medium">Total</th>
            <th className="px-2 py-1.5 text-right font-medium">Unsold</th>
            <th className="px-2 py-1.5 text-right font-medium">Sales Ratio</th>
            <th className="px-4 py-1.5 text-right font-medium">%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <Row key={r.label} r={r} />
          ))}
          {footer.map((r) => (
            <Row key={r.label} r={r} bold />
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Row({ r, bold }: { r: MacProfileRow; bold?: boolean }) {
  return (
    <tr className={`border-t border-paper-line/70 ${bold ? "bg-paper-warm/50 font-semibold text-ink" : "text-ink-soft"}`}>
      <td className="px-4 py-1.5">{r.label}</td>
      <td className="px-2 py-1.5 text-right tabular-nums">{num(r.total)}</td>
      <td className="px-2 py-1.5 text-right tabular-nums">{num(r.unsold)}</td>
      <td className="px-2 py-1.5 text-right tabular-nums">{r.total ? pct(r.salesRatio) : "—"}</td>
      <td className="px-4 py-1.5 text-right tabular-nums">{pct(r.pctOfAll)}</td>
    </tr>
  );
}
