"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Ipad, IpadInputs, IpadUnit } from "@/lib/types";
import { computeIpad, sqmToSqft } from "@/lib/ipadCalc";
import { actionSaveIpad, actionResearchIpad } from "@/app/actions";
import { gbp, num, pct } from "@/lib/format";
import { useAutosave } from "@/lib/useAutosave";
import { IpadProjectCosts } from "./IpadProjectCosts";

type Kind = "money" | "num" | "pct" | "months";
interface FieldDef {
  key: keyof IpadInputs;
  label: string;
  kind: Kind;
}

const PURCHASE: FieldDef[] = [
  { key: "purchasePrice", label: "Purchase price", kind: "money" },
  { key: "solicitors", label: "Solicitors", kind: "money" },
  { key: "stampDuty", label: "Stamp duty", kind: "money" },
  { key: "findersFee", label: "Finder's fee", kind: "money" },
  { key: "managementFee", label: "Management fee", kind: "money" },
];

const CONSTRUCTION_DIRECT: FieldDef[] = [
  { key: "demolition", label: "Demolition", kind: "money" },
  { key: "asbestos", label: "Asbestos removal", kind: "money" },
  { key: "commercialRatePerM2", label: "Commercial build (£/m²)", kind: "num" },
  { key: "industrialRatePerM2", label: "Industrial build (£/m²)", kind: "num" },
  { key: "newBuildRatePerM2", label: "New build / refurb (£/m²)", kind: "num" },
  { key: "landscaping", label: "Landscaping", kind: "money" },
  { key: "otherCosts", label: "Other costs", kind: "money" },
  { key: "contingencyPct", label: "Contingency", kind: "pct" },
  { key: "utilities", label: "Utilities", kind: "money" },
  { key: "accountancy", label: "Accountancy", kind: "money" },
  { key: "vatOnCosts", label: "VAT on costs", kind: "money" },
];

const CONSTRUCTION_FEES: FieldDef[] = [
  { key: "devMgmtPct", label: "Development mgmt", kind: "pct" },
  { key: "planningPct", label: "Planning", kind: "pct" },
  { key: "architect1Pct", label: "Architect (RIBA 1-3)", kind: "pct" },
  { key: "architect2Pct", label: "Architect (RIBA 4-7)", kind: "pct" },
  { key: "structuralPct", label: "Structural engineer", kind: "pct" },
  { key: "contractAdminPct", label: "Contract admin", kind: "pct" },
  { key: "cdmPct", label: "CDM / principal designer", kind: "pct" },
  { key: "partyWall", label: "Party wall", kind: "money" },
  { key: "saps", label: "SAPs / EPC", kind: "money" },
  { key: "emptyRates", label: "Empty rates", kind: "money" },
  { key: "buildingWarranty", label: "Building warranty", kind: "money" },
  { key: "cil106", label: "CIL / s.106", kind: "money" },
  { key: "buildingControl", label: "Building control", kind: "money" },
];

const PURCHASE_FINANCE: FieldDef[] = [
  { key: "privateFinance", label: "Private finance (£)", kind: "money" },
  { key: "privateFinanceMonths", label: "Private term", kind: "months" },
  { key: "privateFinanceRatePerMonth", label: "Private rate / month", kind: "pct" },
  { key: "commBridgeMonths", label: "Comm. bridge term", kind: "months" },
  { key: "commBridgeRatePerMonth", label: "Comm. bridge rate / month", kind: "pct" },
  { key: "commBrokerPct", label: "Broker fee", kind: "pct" },
  { key: "commAdminPct", label: "Admin fee", kind: "pct" },
  { key: "commValuation", label: "Valuation", kind: "money" },
  { key: "commExitPct", label: "Exit fee", kind: "pct" },
];

const DEV_FINANCE: FieldDef[] = [
  { key: "devBridgeMonths", label: "Dev. bridge term", kind: "months" },
  { key: "devBridgeRatePerMonth", label: "Dev. bridge rate / month", kind: "pct" },
  { key: "devBrokerPct", label: "Broker fee", kind: "pct" },
  { key: "devAdminPct", label: "Admin fee", kind: "pct" },
  { key: "devValuation", label: "Valuation", kind: "money" },
  { key: "devExitPct", label: "Exit fee", kind: "pct" },
];

export function IpadForm({ propertyId, initial }: { propertyId: string; initial: Ipad }) {
  const [inp, setInp] = useState<IpadInputs>(initial.inputs);
  const [researching, setResearching] = useState(false);
  const [aiMsg, setAiMsg] = useState<string | null>(null);
  const { status, savedAt, dirty, saveNow } = useAutosave(inp, (v) => actionSaveIpad(propertyId, { inputs: v }));
  const pending = status === "saving";

  async function researchFill() {
    if (!window.confirm("Research this property with AI and fill in empty IPAD inputs (purchase price, build cost, unit mix/GDV)? Findings will be added to the pipeline Notes.")) return;
    setResearching(true);
    setAiMsg(null);
    try {
      const res = await actionResearchIpad(propertyId);
      if (res.ok) {
        setInp((s) => {
          const n = { ...s };
          if (res.purchasePrice != null && !n.purchasePrice) n.purchasePrice = res.purchasePrice;
          if (res.areaM2 != null && !n.areaM2) n.areaM2 = res.areaM2;
          if (res.newBuildRatePerM2 != null && !n.newBuildRatePerM2) n.newBuildRatePerM2 = res.newBuildRatePerM2;
          if (res.commercialRatePerM2 != null && !n.commercialRatePerM2) n.commercialRatePerM2 = res.commercialRatePerM2;
          if (res.contingencyPct != null && !n.contingencyPct) n.contingencyPct = res.contingencyPct;
          if (res.units.length && (!n.units.length || n.units.every((u) => !u.totalGdv))) {
            n.units = res.units.map((u, i) => ({ id: `u${Date.now()}-${i}`, units: u.units || 1, m2: u.m2 || 0, type: u.type || "", totalGdv: u.totalGdv || 0 }));
          }
          return n;
        });
        setAiMsg(`Filled from research${res.notes ? " · findings added to pipeline Notes" : ""}.`);
      } else {
        setAiMsg(res.error || "Research failed.");
      }
    } catch {
      setAiMsg("Research failed — try again.");
    } finally {
      setResearching(false);
    }
  }

  const out = useMemo(() => computeIpad(inp), [inp]);

  function set<K extends keyof IpadInputs>(key: K, value: IpadInputs[K]) {
    setInp((s) => ({ ...s, [key]: value }));
  }
  // Set a fixed £ override for a percentage fee (null clears it → back to %).
  function setOverride(key: string, value: number | null) {
    setInp((s) => {
      const overrides = { ...(s.overrides ?? {}) };
      if (value == null) delete overrides[key];
      else overrides[key] = value;
      return { ...s, overrides };
    });
  }
  function setUnit(id: string, patch: Partial<IpadUnit>) {
    setInp((s) => ({ ...s, units: s.units.map((u) => (u.id === id ? { ...u, ...patch } : u)) }));
  }
  function addUnit() {
    setInp((s) => ({ ...s, units: [...s.units, { id: `u${Date.now()}`, units: 1, m2: 0, type: "", totalGdv: 0 }] }));
  }
  // Duplicate the last unit line (copy its values into a new row).
  function duplicateLastUnit() {
    setInp((s) => {
      const last = s.units[s.units.length - 1];
      const copy = last ? { ...last, id: `u${Date.now()}` } : { id: `u${Date.now()}`, units: 1, m2: 0, type: "", totalGdv: 0 };
      return { ...s, units: [...s.units, copy] };
    });
  }
  function removeUnit(id: string) {
    setInp((s) => ({ ...s, units: s.units.filter((u) => u.id !== id) }));
  }

  const profitColor = out.profitOnGdvPct >= 0.18 ? "#2E7D5B" : out.profitOnGdvPct >= 0 ? "#C2872B" : "#B23A48";

  return (
    <div className="space-y-6">
      {/* Sticky bar */}
      <div className="sticky top-16 z-30 -mx-4 border-b border-paper-line bg-paper-warm/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="text-ink-muted">GDV <strong className="tabular-nums text-ink">{gbp(out.gdv)}</strong></span>
            <span className="text-ink-muted">Net profit <strong className="tabular-nums" style={{ color: out.netProfit >= 0 ? "#2E7D5B" : "#B23A48" }}>{gbp(out.netProfit)}</strong></span>
            <span className="text-ink-muted">on GDV <strong className="tabular-nums" style={{ color: profitColor }}>{pct(out.profitOnGdvPct)}</strong></span>
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
            {aiMsg && <span className="hidden text-xs text-status-go lg:inline">{aiMsg}</span>}
            <button onClick={researchFill} disabled={researching} className="btn-ghost disabled:opacity-60" title="Research the property with AI and fill empty inputs">
              {researching ? "Researching…" : "✨ AI auto-fill"}
            </button>
            <Link href={`/property/${propertyId}/ipad/print`} className="btn-ghost">PDF / Print</Link>
            <button onClick={saveNow} disabled={pending} className="btn-primary disabled:opacity-60">
              {pending ? "Saving…" : "Save now"}
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr,340px]">
        {/* INPUT COLUMN */}
        <div className="space-y-5">
          {/* Appraisal metadata */}
          <section className="card p-5">
            <h2 className="font-serif text-lg text-ink">Appraisal</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="label">Description</span>
                <textarea
                  className="field-sm"
                  rows={2}
                  value={inp.description}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder="Short summary of the scheme / appraisal"
                />
              </label>
              <label className="block">
                <span className="label">Appraisal date</span>
                <input
                  type="date"
                  className="field-sm tabular-nums"
                  value={inp.appraisalDate}
                  onChange={(e) => set("appraisalDate", e.target.value)}
                />
              </label>
            </div>
          </section>

          {/* Scheme */}
          <section className="card p-5">
            <h2 className="font-serif text-lg text-ink">Scheme</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <NumField label="Developable area (m²)" kind="num" value={inp.areaM2} onChange={(v) => set("areaM2", v)} hint={`${num(sqmToSqft(inp.areaM2 || 0))} ft²`} />
              <NumField label="Reference timescale (months)" kind="months" value={inp.refTimescaleMonths} onChange={(v) => set("refTimescaleMonths", v)} />
            </div>

            {/* Units / GDV */}
            <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-bronze-dark">Units & GDV</h3>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-ink-muted">
                    <th className="py-1.5 pr-2 font-medium">No.</th>
                    <th className="py-1.5 pr-2 font-medium">Type</th>
                    <th className="py-1.5 pr-2 font-medium">m² / unit</th>
                    <th className="py-1.5 pr-2 font-medium">Total GDV (£)</th>
                    <th className="py-1.5 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {inp.units.map((u) => (
                    <tr key={u.id} className="border-t border-paper-line">
                      <td className="py-1.5 pr-2"><input type="number" className="field-sm w-16" value={u.units} onChange={(e) => setUnit(u.id, { units: Number(e.target.value) || 0 })} /></td>
                      <td className="py-1.5 pr-2"><input className="field-sm" value={u.type} onChange={(e) => setUnit(u.id, { type: e.target.value })} /></td>
                      <td className="py-1.5 pr-2"><input type="number" className="field-sm w-20" value={u.m2} onChange={(e) => setUnit(u.id, { m2: Number(e.target.value) || 0 })} /></td>
                      <td className="py-1.5 pr-2"><input type="number" className="field-sm w-28" value={u.totalGdv} onChange={(e) => setUnit(u.id, { totalGdv: Number(e.target.value) || 0 })} /></td>
                      <td className="py-1.5"><button onClick={() => removeUnit(u.id)} className="text-ink-muted hover:text-status-stop">✕</button></td>
                    </tr>
                  ))}
                  {inp.units.length === 0 && (
                    <tr><td colSpan={5} className="py-3 text-center text-xs text-ink-muted">No unit lines yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-2 flex gap-2">
              <button onClick={addUnit} className="btn-ghost">+ Add unit line</button>
              <button onClick={duplicateLastUnit} disabled={!inp.units.length} className="btn-ghost disabled:opacity-50">Copy last line</button>
            </div>
          </section>

          <IpadProjectCosts inp={inp} out={out} set={set} setOverride={setOverride} />
        </div>

        {/* OUTPUT COLUMN */}
        <div className="lg:sticky lg:top-32 lg:h-fit">
          <section className="card overflow-hidden">
            <header className="border-b border-paper-line bg-ink px-5 py-3">
              <h2 className="font-serif text-lg text-white">Appraisal result</h2>
              <p className="text-xs text-white/60">Live — mirrors the IPAD residual</p>
            </header>
            <div className="space-y-1 px-5 py-4">
              <Out label="GDV" value={gbp(out.gdv)} strong />
              <Out label="No. units" value={String(out.noUnits)} />
              <div className="my-2 border-t border-paper-line" />
              {out.lines.map((l) => (
                <Out key={l.label} label={l.label} value={gbp(l.value)} sub={l.note} muted={l.label !== "Total Cost of Development"} strong={l.label === "Total Cost of Development"} />
              ))}
              <div className="my-2 border-t border-paper-line" />
              <Out label="Cost / m² (ex finance)" value={gbp(out.costPerSqmExFinance)} muted />
              <Out label="Cost / m² (inc finance)" value={gbp(out.costPerSqmIncFinance)} muted />
              <div className="my-2 border-t border-paper-line" />
              <Out label="Net profit" value={gbp(out.netProfit)} valueColor={out.netProfit >= 0 ? "#2E7D5B" : "#B23A48"} strong />
              <Out label="Profit on GDV" value={pct(out.profitOnGdvPct)} valueColor={profitColor} strong />
              <Out label="Profit on cost" value={pct(out.profitOnCostPct)} muted />
            </div>
          </section>
          <div className="mt-3 flex gap-2">
            <Link href={`/property/${propertyId}`} className="btn-ghost flex-1">Overview</Link>
            <button onClick={saveNow} disabled={pending} className="btn-primary flex-1 disabled:opacity-60">
              {pending ? "Saving…" : "Save now"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Group({
  title,
  fields,
  inp,
  set,
  setOverride,
  feeAmounts,
  note,
}: {
  title: string;
  fields: FieldDef[];
  inp: IpadInputs;
  set: <K extends keyof IpadInputs>(key: K, value: IpadInputs[K]) => void;
  setOverride: (key: string, value: number | null) => void;
  feeAmounts: Record<string, number>;
  note?: string;
}) {
  return (
    <section className="card p-5">
      <h2 className="font-serif text-lg text-ink">{title}</h2>
      {note && <p className="mt-1 text-xs text-ink-muted">{note}</p>}
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map((f) =>
          f.kind === "pct" ? (
            <PctValueField
              key={String(f.key)}
              label={f.label}
              pctValue={inp[f.key] as number}
              override={inp.overrides?.[f.key as string]}
              computed={feeAmounts[f.key as string] ?? 0}
              onPct={(v) => set(f.key, v as IpadInputs[typeof f.key])}
              onOverride={(v) => setOverride(f.key as string, v)}
            />
          ) : (
            <NumField
              key={String(f.key)}
              label={f.label}
              kind={f.kind}
              value={inp[f.key] as number}
              onChange={(v) => set(f.key, v as IpadInputs[typeof f.key])}
            />
          ),
        )}
      </div>
    </section>
  );
}

/** A percentage fee that can be toggled to a fixed £ value (stored as an override). */
function PctValueField({
  label,
  pctValue,
  override,
  computed,
  onPct,
  onOverride,
}: {
  label: string;
  pctValue: number;
  override: number | undefined;
  computed: number;
  onPct: (v: number) => void;
  onOverride: (v: number | null) => void;
}) {
  const isValue = typeof override === "number";
  const toggle = (active: boolean) =>
    `px-1.5 py-0.5 text-[11px] font-semibold transition ${active ? "bg-ink text-white" : "bg-white text-ink-muted hover:text-ink"}`;
  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between gap-2 text-[11px] font-medium uppercase tracking-wide text-ink-muted">
        <span className="truncate">{label}</span>
        <span className="inline-flex shrink-0 overflow-hidden rounded border border-paper-line">
          <button type="button" className={toggle(!isValue)} onClick={() => onOverride(null)} aria-label="Use percentage">
            %
          </button>
          <button type="button" className={toggle(isValue)} onClick={() => onOverride(Math.round(computed))} aria-label="Use fixed amount">
            £
          </button>
        </span>
      </span>
      {isValue ? (
        <input
          type="number"
          step={1}
          className="field-sm tabular-nums"
          value={Number.isFinite(override) ? override : 0}
          onChange={(e) => onOverride(Number(e.target.value) || 0)}
        />
      ) : (
        <input
          type="number"
          step={0.1}
          className="field-sm tabular-nums"
          value={Number.isFinite(pctValue) ? round2(pctValue * 100) : 0}
          onChange={(e) => onPct((Number(e.target.value) || 0) / 100)}
        />
      )}
    </label>
  );
}

function NumField({
  label,
  kind,
  value,
  onChange,
  hint,
}: {
  label: string;
  kind: Kind;
  value: number;
  onChange: (v: number) => void;
  hint?: string;
}) {
  const display = kind === "pct" ? round2(value * 100) : value;
  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between text-[11px] font-medium uppercase tracking-wide text-ink-muted">
        <span>{label}</span>
        {kind === "money" && <span className="text-bronze-dark">£</span>}
        {kind === "pct" && <span className="text-bronze-dark">%</span>}
      </span>
      <input
        type="number"
        className="field-sm tabular-nums"
        value={Number.isFinite(display) ? display : 0}
        step={kind === "pct" ? 0.1 : kind === "months" ? 1 : 1}
        onChange={(e) => {
          const raw = Number(e.target.value);
          const safe = isNaN(raw) ? 0 : raw;
          onChange(kind === "pct" ? safe / 100 : safe);
        }}
      />
      {hint && <span className="mt-0.5 block text-[10px] text-ink-muted">{hint}</span>}
    </label>
  );
}

function Out({
  label,
  value,
  sub,
  strong,
  muted,
  valueColor,
}: {
  label: string;
  value: string;
  sub?: string;
  strong?: boolean;
  muted?: boolean;
  valueColor?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className={`text-[13px] ${muted ? "text-ink-muted" : "text-ink-soft"} ${strong ? "font-semibold text-ink" : ""}`}>
        {label}
        {sub && <span className="ml-1 text-[10px] text-ink-muted">({sub})</span>}
      </span>
      <span
        className={`tabular-nums ${strong ? "text-base font-semibold" : "text-sm"}`}
        style={{ color: valueColor ?? (strong ? "#16202B" : "#33414F") }}
      >
        {value}
      </span>
    </div>
  );
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
