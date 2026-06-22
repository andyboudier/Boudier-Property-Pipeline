"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ProcedabilityStatus } from "@/lib/types";
import { statusMeta } from "@/lib/procedability";
import { actionDeleteProperty, actionClearPropertyAlert, actionSetStatusOverride } from "@/app/actions";
import { gbp, num, pct } from "@/lib/format";
import type { MarketAlert } from "@/lib/types";

export interface Row {
  id: string;
  name: string;
  marketStatus?: string;
  alert?: MarketAlert;
  town: string;
  lpa: string;
  sizeSqFt: number | null;
  guidePrice: number | null;
  currentUse: string;
  status: ProcedabilityStatus; // displayed status (override if set, else auto)
  autoStatus: ProcedabilityStatus; // computed status (for the "Auto" option)
  overridden?: boolean; // true when status was set manually
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
              <th className="px-4 py-2.5 font-medium"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="group border-b border-paper-line/70 last:border-0 hover:bg-paper-warm/60">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Link href={`/property/${r.id}`} className="font-medium text-ink hover:text-bronze-dark">
                      {r.name}
                    </Link>
                    {r.alert && <AlertChip id={r.id} alert={r.alert} status={r.marketStatus} />}
                  </div>
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
                  <StatusSelect id={r.id} value={r.status} autoStatus={r.autoStatus} overridden={r.overridden} />
                </td>
                <td className="px-4 py-3 text-right">
                  <DeleteButton id={r.id} name={r.name} />
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-sm text-ink-muted">
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

const STATUS_OPTIONS: ProcedabilityStatus[] = ["proceedable", "review", "not-proceedable", "incomplete"];

function StatusSelect({ id, value, autoStatus, overridden }: { id: string; value: ProcedabilityStatus; autoStatus: ProcedabilityStatus; overridden?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const m = statusMeta(value);

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value;
    startTransition(async () => {
      await actionSetStatusOverride(id, v === "auto" ? null : (v as ProcedabilityStatus));
      router.refresh();
    });
  }

  return (
    <span className="inline-flex items-center gap-1">
      <select
        value={overridden ? value : "auto"}
        onChange={onChange}
        disabled={pending}
        title={overridden ? `Set manually — Auto would be “${statusMeta(autoStatus).label}”` : "Auto (from criteria)"}
        className="cursor-pointer rounded-full border px-2 py-1 text-xs font-semibold focus:outline-none disabled:opacity-60"
        style={{ borderColor: `${m.color}55`, background: `${m.color}14`, color: m.color }}
      >
        <option value="auto">Auto · {statusMeta(autoStatus).label}</option>
        {STATUS_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {statusMeta(s).label}
          </option>
        ))}
      </select>
      {overridden && <span title="Manually set" className="text-[10px] text-ink-muted">✎</span>}
    </span>
  );
}

function AlertChip({ id, alert, status }: { id: string; alert: MarketAlert; status?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const back = alert === "back-on-market";
  const color = back ? "#2E7D5B" : "#B23A48";
  const label = back ? "↩ Back on market" : `● ${status || "Sold / under offer"}`;
  return (
    <button
      onClick={() => startTransition(async () => { await actionClearPropertyAlert(id); router.refresh(); })}
      disabled={pending}
      title="Click to dismiss this alert"
      className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
      style={{ background: `${color}1A`, color }}
    >
      {label}
    </button>
  );
}

function DeleteButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onDelete() {
    const ok = window.confirm(
      `Delete "${name}" from the pipeline?\n\nThis permanently removes the site and its DCAS / MAC / IPAD data. This cannot be undone.`,
    );
    if (!ok) return;
    startTransition(async () => {
      await actionDeleteProperty(id);
      router.refresh();
    });
  }

  return (
    <button
      onClick={onDelete}
      disabled={pending}
      title={`Delete ${name}`}
      aria-label={`Delete ${name}`}
      className="rounded p-1.5 text-ink-muted opacity-0 transition hover:bg-status-stop/10 hover:text-status-stop focus:opacity-100 group-hover:opacity-100 disabled:opacity-100"
    >
      {pending ? (
        <span className="text-xs">…</span>
      ) : (
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M3 5h14M8 5V3.5A1.5 1.5 0 0 1 9.5 2h1A1.5 1.5 0 0 1 12 3.5V5m2 0v11a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5M8.5 8.5v6M11.5 8.5v6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
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
