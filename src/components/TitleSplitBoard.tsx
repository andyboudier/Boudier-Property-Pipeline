"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { TitleSplitStage } from "@/lib/types";
import { TITLE_SPLIT_STAGES, LIVE_STAGES, stageMeta } from "@/lib/titleSplit";
import { actionSetTitleSplitStage } from "@/app/actions";

export interface TitleSplitRow {
  id: string;
  name: string;
  town: string;
  stage: TitleSplitStage;
  stageUpdatedAt: string | null;
  letterSentAt: string | null;
  addressCount: number;
  leaseCount: number;
  ownerType: string;
  ownerTypeInferred: boolean;
  companyName: string | null;
  companyNumber: string | null;
  companyAddress: string | null;
  confidence: number;
  inspireId: string;
}

type Filter = TitleSplitStage | "live" | "all";

const daysSince = (iso: string | null) => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)) : null);

function owner(r: TitleSplitRow) {
  if (r.ownerType === "private") return r.ownerTypeInferred ? "Private (inferred)" : "Private";
  return r.companyName ?? (r.ownerType === "overseas" ? "Overseas company" : "Company");
}

/** Mail-merge export: who to write to, where, and about which building. */
function toCsv(rows: TitleSplitRow[]) {
  const cols: Array<[string, (r: TitleSplitRow) => unknown]> = [
    ["property", (r) => r.name],
    ["town", (r) => r.town],
    ["units", (r) => r.addressCount],
    ["owner", owner],
    ["owner_type", (r) => r.ownerType + (r.ownerTypeInferred ? " (inferred)" : "")],
    ["company_number", (r) => r.companyNumber ?? ""],
    ["write_to", (r) => r.companyAddress ?? ""],
    ["stage", (r) => stageMeta(r.stage).label],
    ["letter_sent", (r) => r.letterSentAt?.slice(0, 10) ?? ""],
    ["inspire_id", (r) => r.inspireId],
    ["app_link", (r) => `/property/${r.id}`],
  ];
  const esc = (v: unknown) => {
    const t = String(v ?? "");
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return [cols.map(([h]) => h).join(","), ...rows.map((r) => cols.map(([, fn]) => esc(fn(r))).join(","))].join("\n");
}

function StageSelect({ row }: { row: TitleSplitRow }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const m = stageMeta(row.stage);
  return (
    <select
      value={row.stage}
      disabled={pending}
      onChange={(e) => {
        const v = e.target.value as TitleSplitStage;
        start(async () => {
          await actionSetTitleSplitStage(row.id, v);
          router.refresh();
        });
      }}
      className="rounded-md border px-2 py-1 text-xs font-medium disabled:opacity-60"
      style={{ borderColor: m.color, color: m.color }}
      aria-label={`Stage for ${row.name}`}
    >
      {TITLE_SPLIT_STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
    </select>
  );
}

export function TitleSplitBoard({ rows }: { rows: TitleSplitRow[] }) {
  const [filter, setFilter] = useState<Filter>("live");
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length, live: 0 };
    for (const r of rows) {
      c[r.stage] = (c[r.stage] ?? 0) + 1;
      if (LIVE_STAGES.includes(r.stage)) c.live++;
    }
    return c;
  }, [rows]);
  const shown = rows.filter((r) => (filter === "all" ? true : filter === "live" ? LIVE_STAGES.includes(r.stage) : r.stage === filter));
  const units = shown.reduce((s, r) => s + r.addressCount, 0);

  const download = () => {
    const blob = new Blob([toCsv(shown)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `title-split-${filter}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const chip = (on: boolean) =>
    `rounded-full border px-3 py-1 text-xs font-medium transition ${on ? "border-ink bg-ink text-white" : "border-paper-line bg-white text-ink-soft hover:border-bronze"}`;

  if (rows.length === 0) {
    return (
      <div className="card p-8 text-center">
        <p className="font-serif text-lg text-ink">No title split opportunities yet</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-ink-muted">
          Open the freehold finder, click a building, and choose <span className="font-medium text-ink">Add to Title Split</span>.
          It will appear here at the Identified stage.
        </p>
        <Link href="/freeholds" className="btn-primary mt-4 inline-block">Open the freehold finder</Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <button className={chip(filter === "live")} onClick={() => setFilter("live")}>Live ({counts.live})</button>
        {TITLE_SPLIT_STAGES.map((s) =>
          counts[s.key] ? (
            <button key={s.key} className={chip(filter === s.key)} onClick={() => setFilter(s.key)} title={s.hint}>
              {s.label} ({counts[s.key]})
            </button>
          ) : null,
        )}
        <button className={chip(filter === "all")} onClick={() => setFilter("all")}>All ({counts.all})</button>
        <span className="ml-auto text-xs text-ink-muted">{shown.length} opportunities · {units.toLocaleString("en-GB")} units</span>
        <button onClick={download} className="btn-ghost text-xs" disabled={!shown.length}>Export for mail-merge</button>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-paper-line text-left text-[11px] uppercase tracking-wide text-ink-muted">
              <th className="px-3 py-2">Building</th>
              <th className="px-3 py-2 text-right">Units</th>
              <th className="px-3 py-2">Owner</th>
              <th className="px-3 py-2">Write to</th>
              <th className="px-3 py-2">Stage</th>
              <th className="px-3 py-2 text-right">In stage</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-paper-line">
            {shown.map((r) => {
              const d = daysSince(r.stageUpdatedAt);
              return (
                <tr key={r.id} className="hover:bg-paper-warm/60">
                  <td className="px-3 py-2">
                    <Link href={`/property/${r.id}`} className="font-medium text-ink hover:text-bronze-dark">{r.name}</Link>
                    <span className="block text-[11px] text-ink-muted">{r.town} · {r.leaseCount} registered leases · confidence {Math.round(r.confidence * 100)}%</span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.addressCount}</td>
                  <td className="px-3 py-2">
                    <span className="text-ink">{owner(r)}</span>
                    {r.companyNumber && <span className="block text-[11px] text-ink-muted">Co. {r.companyNumber}</span>}
                  </td>
                  <td className="max-w-[220px] px-3 py-2 text-xs text-ink-soft">
                    {r.companyAddress ?? (r.ownerType === "private" ? <span className="text-ink-muted">Buy title register</span> : "—")}
                  </td>
                  <td className="px-3 py-2"><StageSelect row={r} /></td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums text-ink-muted">{d == null ? "—" : `${d}d`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
