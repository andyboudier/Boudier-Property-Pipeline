"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ProcedabilityStatus } from "@/lib/types";
import { statusMeta } from "@/lib/procedability";
import { StatusBadge } from "./Procedability";
import { gbp, num, pct } from "@/lib/format";

export interface Row {
  id: string;
  name: string;
  town: string;
  lpa: string;
  sizeSqFt: number | null;
  guidePrice: number | null;
  currentUse: string;
  status: ProcedabilityStatus;
  headline: string;
  score: number;
  dcasPct: number;
  dcasStarted: boolean;
  macStarted: boolean;
  ipadStarted: boolean;
  profitOnGdv: number | null;
}

const FILTERS: { key: ProcedabilityStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "proceedable", label: "Proceedable" },
  { key: "review", label: "Review" },
  { key: "not-proceedable", label: "Not proceedable" },
  { key: "incomplete", label: "Incomplete" },
];

export function SearchTable({ rows }: { rows: Row[] }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<ProcedabilityStatus | "all">("all");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== "all" && r.status !== filter) return false;
      if (!needle) return true;
      return [r.name, r.town, r.lpa, r.currentUse].join(" ").toLowerCase().includes(needle);
    });
  }, [rows, q, filter]);

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-paper-line p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search address, town or LPA…"
            className="field pl-9"
          />
          <svg className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-ink-muted" viewBox="0 0 20 20" fill="none">
            <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.6" />
            <path d="m14 14 3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => {
            const active = filter === f.key;
            const color = f.key === "all" ? "#16202B" : statusMeta(f.key as ProcedabilityStatus).color;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className="rounded-full border px-3 py-1 text-xs font-medium transition"
                style={{
                  borderColor: active ? color : "#E7E4DE",
                  background: active ? `${color}12` : "#fff",
                  color: active ? color : "#5B6976",
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead>
            <tr className="border-b border-paper-line text-[11px] uppercase tracking-wide text-ink-muted">
              <th className="px-4 py-2.5 font-medium">Property</th>
              <th className="px-4 py-2.5 font-medium">Area (Town &amp; LPA)</th>
              <th className="px-4 py-2.5 font-medium">Size</th>
              <th className="px-4 py-2.5 font-medium">Guide</th>
              <th className="px-4 py-2.5 font-medium">Profit/GDV</th>
              <th className="px-4 py-2.5 font-medium">Stages</th>
              <th className="px-4 py-2.5 font-medium">Procedable</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="group border-b border-paper-line/70 last:border-0 hover:bg-paper-warm/60">
                <td className="px-4 py-3">
                  <Link href={`/property/${r.id}`} className="font-medium text-ink hover:text-bronze-dark">
                    {r.name}
                  </Link>
                  <div className="max-w-[260px] truncate text-xs text-ink-muted">{r.currentUse}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="text-ink">{r.town}</div>
                  <div className="text-xs text-ink-muted">{r.lpa}</div>
                </td>
                <td className="px-4 py-3 tabular-nums text-ink-soft">
                  {r.sizeSqFt != null ? `${num(r.sizeSqFt)} ft²` : "—"}
                </td>
                <td className="px-4 py-3 tabular-nums text-ink-soft">{gbp(r.guidePrice)}</td>
                <td className="px-4 py-3 tabular-nums">
                  {r.profitOnGdv == null ? (
                    <span className="text-ink-muted">—</span>
                  ) : (
                    <span style={{ color: r.profitOnGdv >= 0.18 ? "#2E7D5B" : r.profitOnGdv >= 0 ? "#C2872B" : "#B23A48" }}>
                      {pct(r.profitOnGdv)}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <StageDots dcas={r.dcasStarted} mac={r.macStarted} ipad={r.ipadStarted} />
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={r.status} size="sm" />
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-ink-muted">
                  No sites match your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function StageDots({ dcas, mac, ipad }: { dcas: boolean; mac: boolean; ipad: boolean }) {
  const items = [
    { k: "D", on: dcas },
    { k: "M", on: mac },
    { k: "I", on: ipad },
  ];
  return (
    <div className="flex gap-1">
      {items.map((i) => (
        <span
          key={i.k}
          title={i.on ? "Started" : "Not started"}
          className="flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold"
          style={{
            background: i.on ? "#16202B" : "#F0EEE9",
            color: i.on ? "#fff" : "#A7ABA8",
          }}
        >
          {i.k}
        </span>
      ))}
    </div>
  );
}
