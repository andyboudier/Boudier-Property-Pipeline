"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { IpadInputs, IpadUnit } from "@/lib/types";
import { computeIpad, sqmToSqft } from "@/lib/ipadCalc";
import { actionSaveIpad } from "@/app/actions";
import { useAutosave } from "@/lib/useAutosave";
import { NumberInput } from "./NumberInput";
import { PrintButton } from "./PrintButton";
import { gbp, num, pct } from "@/lib/format";

/**
 * Editable table view — the IPAD laid out exactly like the "IPAD Foundation"
 * sheet in the source Excel workbook. Cells that are inputs in the sheet are
 * editable here; cells that are formulas (totals, £ amounts driven by a %)
 * recalculate live and stay read-only, exactly as in Excel. Autosaves.
 */
export function IpadTable({
  propertyId,
  initial,
  projectAddress,
}: {
  propertyId: string;
  initial: IpadInputs;
  projectAddress: string;
}) {
  const [inp, setInp] = useState<IpadInputs>(initial);
  const { status, savedAt, dirty, saveNow } = useAutosave(inp, (v) => actionSaveIpad(propertyId, { inputs: v }));
  const out = useMemo(() => computeIpad(inp), [inp]);

  const area = inp.areaM2 || 0;
  const fa = out.feeAmounts;
  const ov = inp.overrides ?? {};
  const fixed = (k: string) => typeof ov[k] === "number";
  const commercialFinance = Math.max(out.totalPurchaseCosts - inp.privateFinance, 0); // G53
  const costOfCommercialFinance = out.totalPurchaseFinance - (fa.privateFinanceRatePerMonth ?? 0); // G59
  const units = inp.units ?? [];
  const blankUnitRows = Math.max(0, 18 - units.length); // the sheet has 18 slots (rows 84–101)

  function set<K extends keyof IpadInputs>(key: K, value: IpadInputs[K]) {
    setInp((s) => ({ ...s, [key]: value }));
  }
  function setUnit(id: string, patch: Partial<IpadUnit>) {
    setInp((s) => ({ ...s, units: s.units.map((u) => (u.id === id ? { ...u, ...patch } : u)) }));
  }
  function addUnit() {
    setInp((s) => ({ ...s, units: [...s.units, { id: `u${Date.now()}`, units: 1, m2: 0, type: "", totalGdv: 0 }] }));
  }
  function removeUnit(id: string) {
    setInp((s) => ({ ...s, units: s.units.filter((u) => u.id !== id) }));
  }

  // ── cell editors (plain functions, NOT components — a component defined in
  // render would remount each keystroke and steal focus) ──
  const money = (k: keyof IpadInputs) => (
    <NumberInput className={NUM} value={(inp[k] as number) || 0} onChange={(n) => set(k, n as IpadInputs[typeof k])} />
  );
  const percent = (k: keyof IpadInputs) =>
    fixed(k as string) ? (
      <span className="text-ink-muted">fixed £</span>
    ) : (
      <span className="flex items-center justify-end">
        <NumberInput
          className={`${NUM} w-9`}
          value={+(((inp[k] as number) || 0) * 100).toFixed(3)}
          onChange={(n) => set(k, (n / 100) as IpadInputs[typeof k])}
        />
        <span className="pr-0.5">%</span>
      </span>
    );
  const rate = (k: keyof IpadInputs) => (
    <span className="flex items-center justify-end">
      <span>£</span>
      <NumberInput className={NUM} value={(inp[k] as number) || 0} onChange={(n) => set(k, n as IpadInputs[typeof k])} />
    </span>
  );
  const months = (k: keyof IpadInputs) => (
    <NumberInput className={NUM} value={(inp[k] as number) || 0} onChange={(n) => set(k, n as IpadInputs[typeof k])} />
  );

  return (
    <div className="space-y-3">
      {/* Toolbar (screen only) */}
      <div className="no-print sticky top-16 z-30 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-paper-line bg-paper-warm/90 px-4 py-2.5 backdrop-blur">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className="text-ink-muted">GDV <strong className="tabular-nums text-ink">{gbp(out.gdv)}</strong></span>
          <span className="text-ink-muted">
            Net profit{" "}
            <strong className="tabular-nums" style={{ color: out.netProfit >= 0 ? "#2E7D5B" : "#B23A48" }}>{gbp(out.netProfit)}</strong>
          </span>
          <span className="text-ink-muted">on GDV <strong className="tabular-nums text-ink">{pct(out.profitOnGdvPct)}</strong></span>
          {status === "saving" ? (
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
          <Link href={`/property/${propertyId}/ipad`} className="btn-ghost">Form view</Link>
          <PrintButton label="Download table as PDF" />
          <button onClick={saveNow} disabled={status === "saving"} className="btn-primary disabled:opacity-60">
            {status === "saving" ? "Saving…" : "Save now"}
          </button>
        </div>
      </div>

      <div className="print-page overflow-x-auto rounded-lg border border-paper-line bg-white p-4 shadow-sm print:border-0 print:p-0 print:shadow-none">
        <table className="min-w-[1000px] border-collapse text-[12px] leading-tight text-ink">
          <colgroup>
            <col style={{ width: 80 }} />
            <col style={{ width: 62 }} />
            <col style={{ width: 62 }} />
            <col style={{ width: 62 }} />
            <col style={{ width: 62 }} />
            <col style={{ width: 300 }} />
            <col style={{ width: 104 }} />
            <col style={{ width: 62 }} />
            <col style={{ width: 84 }} />
            <col style={{ width: 92 }} />
            <col style={{ width: 150 }} />
          </colgroup>
          <tbody>
            {/* ── Title & header block (rows 2–9) ── */}
            <tr>
              <Cell span={11} className="bg-[#2F4B2C] px-2 py-1.5 text-[13px] font-bold text-white">
                Initial Project Appraisal Document (IPAD)
              </Cell>
            </tr>
            <tr>
              <Cell span={11} className="px-2 py-0.5 text-[11px] text-ink-muted">v4.3 Rev 10/19</Cell>
            </tr>
            <tr>
              <Cell span={4} bold>Project Address:</Cell>
              <Cell span={7} bold>{projectAddress}</Cell>
            </tr>
            <tr>
              <Cell span={4} bold>Description:</Cell>
              <Cell span={5}>
                <input className={TXT} value={inp.description} onChange={(e) => set("description", e.target.value)} placeholder="Scheme description" />
              </Cell>
              <Cell bold>Ref:</Cell>
              <Cell />
            </tr>
            <tr>
              <Cell span={4} bold>Appraisal Date:</Cell>
              <Cell span={2}>
                <input type="date" className={`${TXT} tabular-nums`} value={inp.appraisalDate} onChange={(e) => set("appraisalDate", e.target.value)} />
              </Cell>
              <Cell span={5} />
            </tr>
            <tr>
              <Cell span={4} bold>Area:</Cell>
              <Cell>{money("areaM2")}</Cell>
              <Cell bold>m2</Cell>
              <Cell bold>GDV:</Cell>
              <Cell span={2} bold money>{gbp(out.gdv)}</Cell>
              <Cell bold>Profit:</Cell>
              <Cell bold money>{gbp(out.netProfit)}</Cell>
            </tr>
            <tr>
              <Cell span={4} bold>Project Timescales:</Cell>
              <Cell>{money("refTimescaleMonths")}</Cell>
              <Cell bold>Months</Cell>
              <Cell bold>No. Units</Cell>
              <Cell span={2} bold money>{num(out.noUnits)}</Cell>
              <Cell bold>GDV:</Cell>
              <Cell bold money>{gbp(out.gdv)}</Cell>
            </tr>
            <tr>
              <Cell span={9} />
              <Cell bold nowrap>% Profit on GDV</Cell>
              <Cell bold money>{pct(out.profitOnGdvPct, 1)}</Cell>
            </tr>

            <Spacer />

            {/* ── PROJECT COSTS (rows 11–19) ── */}
            <tr>
              <Cell span={11} className="px-2 py-1 text-[13px] font-bold">PROJECT COSTS</Cell>
            </tr>
            <tr className="bg-paper-warm/70">
              <Cell span={6} bold>Item</Cell>
              <Cell bold right>Cost</Cell>
              <Cell span={4} bold>Comments</Cell>
            </tr>

            <Section>Purchase Cost &amp; Fees</Section>
            <Row label="Purchase Price" cost={money("purchasePrice")} h={area ? gbp(inp.purchasePrice / area) : ""} i={area ? "per m2" : ""} />
            <Row label="Solicitors and Legal Fees" cost={money("solicitors")} />
            <Row label="Stamp Duty" cost={money("stampDuty")} />
            <Row label="Finder's Fee" cost={money("findersFee")} />
            <Row label="Management Fee" cost={money("managementFee")} />
            <Total label="TOTAL PURCHASE COSTS & FEES" value={out.totalPurchaseCosts} />

            <Spacer />

            {/* ── Construction / refurbishment (rows 21–46) ── */}
            <Section>Construction/Refurbishment Costs</Section>
            <Row label="Development Management Fee" cost={gbp(fa.devMgmtPct ?? 0)} h={percent("devMgmtPct")} i="of Total Construction Cost" />
            <Row label="Planning Fees" cost={gbp(fa.planningPct ?? 0)} h={percent("planningPct")} i="of Total Construction Cost" />
            <Row label="Architect's First Stage" cost={gbp(fa.architect1Pct ?? 0)} h={percent("architect1Pct")} i="of Total Construction Cost" />
            <Row label="Architect & Planning Fees - Second Stage" cost={gbp(fa.architect2Pct ?? 0)} h={percent("architect2Pct")} i="of Total Construction Cost" />
            <Row label="Structural Engineer" cost={gbp(fa.structuralPct ?? 0)} h={percent("structuralPct")} i="of Total Construction Cost" />
            <Row label="Party Wall Surveyor" cost={money("partyWall")} h="TBC" />
            <Row label="SAPS (included builder's costs)" cost={money("saps")} h="TBC" />
            <Row label="Contract Administration by Project Manager" cost={gbp(fa.contractAdminPct ?? 0)} h={percent("contractAdminPct")} i="of Total Construction Cost" />
            <Row label="Empty Building Rates/Council Tax" cost={money("emptyRates")} h="TBC" />
            <Row label="Building Warranty" cost={money("buildingWarranty")} h="Circa £1,500/Unit Residential" hSpan={4} />
            <Row label="CDM Co-ordinator" cost={gbp(fa.cdmPct ?? 0)} h={percent("cdmPct")} i="of Total Construction Cost" />
            <Row label="CIL/106" cost={money("cil106")} h="TBC" />
            <Row label="Building Control" cost={money("buildingControl")} h="TBC" />
            <Row label="Demolition Costs" cost={money("demolition")} h="TBC" />
            <Row label="Asbestos/contaminant removal" cost={money("asbestos")} h="TBC" />
            <Row label="Commercial Refurbishment/Construction Cost" cost={gbp(area * inp.commercialRatePerM2)} h={rate("commercialRatePerM2")} i="per m2" j=") These rates are for xxx" />
            <Row label="Industrial Refurbishment/Construction Cost" cost={gbp(area * inp.industrialRatePerM2)} h={rate("industrialRatePerM2")} i="per m2" j=") postcode" />
            <Row label="New Build Cost" cost={gbp(area * inp.newBuildRatePerM2)} h={rate("newBuildRatePerM2")} i="per m2" j=") specifically" />
            <Row label="Landscaping/External Works" cost={money("landscaping")} h="TBC" />
            <Row label="Other Costs" cost={money("otherCosts")} h="TBC" />
            <Row label={`Contingency  @${+(inp.contingencyPct * 100).toFixed(1)}%`} cost={gbp(fa.contingencyPct ?? 0)} h={percent("contingencyPct")} />
            <Row label="Utilities" cost={money("utilities")} h="Circa £1,000/service/unit" hSpan={4} />
            <Row label="Accountancy, Book-keeping etc. for SPV" cost={money("accountancy")} h="TBC" />
            <Row label="VAT on costs" cost={money("vatOnCosts")} h="TBC (New build 0%, Refurb 5%, Accountant to advise)" hSpan={4} />
            <Total label="TOTAL CONSTRUCTION/REFURBISHMENT COSTS" value={out.totalConstruction} />

            <Spacer />

            {/* ── Finance — purchase (rows 48–61) ── */}
            <Section>Finance Costs - Purchase</Section>
            <Row label="Private Finance" labelBold cost={money("privateFinance")} />
            <Row
              label={`Purchase Private Finance Cost for ${num(inp.privateFinanceMonths)} months @ ${+(inp.privateFinanceRatePerMonth * 100).toFixed(2)}% per month`}
              cost={gbp(fa.privateFinanceRatePerMonth ?? 0)}
              h={months("privateFinanceMonths")}
              i="Months @"
              j={percent("privateFinanceRatePerMonth")}
              k="interest"
            />
            <Row label="Cost of Private Finance" labelBold cost={gbp(fa.privateFinanceRatePerMonth ?? 0)} />
            <Spacer />
            <Row label="Commercial Finance" labelBold cost={gbp(commercialFinance)} h="Commercial Finance" hSpan={4} />
            <Row
              label={`Purchase Bridging Cost for ${num(inp.commBridgeMonths)} months @ ${+(inp.commBridgeRatePerMonth * 100).toFixed(2)}% per month`}
              cost={gbp(fa.commBridgeRatePerMonth ?? 0)}
              h={months("commBridgeMonths")}
              i="Months @"
              j={percent("commBridgeRatePerMonth")}
              k="interest"
            />
            <Row label={`Broker Fee  @${+(inp.commBrokerPct * 100).toFixed(1)}%`} cost={gbp(fa.commBrokerPct ?? 0)} h={percent("commBrokerPct")} />
            <Row label={`Lender Admin Fee ${+(inp.commAdminPct * 100).toFixed(1)}%`} cost={gbp(fa.commAdminPct ?? 0)} h={percent("commAdminPct")} />
            <Row label="Lender Valuation Fee" cost={money("commValuation")} h="TBC" />
            <Row label={`Lender Exit Fee ${+(inp.commExitPct * 100).toFixed(1)}%`} cost={gbp(fa.commExitPct ?? 0)} h={percent("commExitPct")} />
            <Row label="Cost of Commercial Finance" labelBold bold cost={gbp(costOfCommercialFinance)} />
            <Spacer />
            <Total label="Total Purchase Financing Costs" value={out.totalPurchaseFinance} />

            <Spacer />

            {/* ── Finance — development (rows 63–72) ── */}
            <Section>Finance Costs - Development</Section>
            <Row label="Development Loan" labelBold cost={gbp(out.totalConstruction)} h="Commercial Finance" hSpan={4} />
            <Row
              label={`Development Bridging Cost for ${num(inp.devBridgeMonths)} months @ ${+(inp.devBridgeRatePerMonth * 100).toFixed(2)}% per month`}
              cost={gbp(fa.devBridgeRatePerMonth ?? 0)}
              h={months("devBridgeMonths")}
              i="Months @"
              j={percent("devBridgeRatePerMonth")}
              k="interest"
            />
            <Row label={`Broker Fee (${+(inp.devBrokerPct * 100).toFixed(1)}%)`} cost={gbp(fa.devBrokerPct ?? 0)} h={percent("devBrokerPct")} />
            <Row label={`Lender Admin Fee ${+(inp.devAdminPct * 100).toFixed(1)}%`} cost={gbp(fa.devAdminPct ?? 0)} h={percent("devAdminPct")} />
            <Row label="Lender Valuation Fee" cost={money("devValuation")} h="TBC" />
            <Row label={`Lender Exit Fee ${+(inp.devExitPct * 100).toFixed(1)}%`} cost={gbp(fa.devExitPct ?? 0)} h={percent("devExitPct")} />
            <Total label="Total Development Financing Costs" value={out.totalDevFinance} />

            <Spacer />
            <Total label="TOTAL FINANCE COSTS" value={out.totalFinance} />
            <Spacer />

            {/* ── Disposal (rows 74–79) ── */}
            <Row label="Agent's Selling Fees including legals" cost={gbp(fa.agentSellingPct ?? 0)} h={percent("agentSellingPct")} i="of GDV" />
            <Total label="TOTAL DISPOSAL COSTS" value={out.totalDisposal} />
            <Spacer />
            <Row label="Cost per sqm (excluding finance)" cost={gbp(out.costPerSqmExFinance, 2)} />
            <Row label="Cost per sqm (including finance)" cost={gbp(out.costPerSqmIncFinance, 2)} />
            <Total label="Total Cost of Development" value={out.totalCostOfDevelopment} />

            <Spacer />
            <Spacer />

            {/* ── SALES PROJECTIONS (rows 82–103) ── */}
            <tr>
              <Cell span={11} className="px-2 py-1 text-[13px] font-bold">SALES PROJECTIONS</Cell>
            </tr>
            <tr className="bg-paper-warm/70">
              <Cell bold>No. Units</Cell>
              <Cell bold right>m2</Cell>
              <Cell bold right>ft2</Cell>
              <Cell span={3} bold>Type</Cell>
              <Cell bold right>Total GDV</Cell>
              <Cell span={4} bold>£/m2</Cell>
            </tr>
            {units.map((u) => (
              <tr key={u.id} className="group">
                <Cell>
                  <NumberInput className={NUM} value={u.units} onChange={(n) => setUnit(u.id, { units: n })} />
                </Cell>
                <Cell>
                  <NumberInput className={NUM} value={u.m2} onChange={(n) => setUnit(u.id, { m2: n })} />
                </Cell>
                <Cell right>{u.m2 ? num(sqmToSqft(u.m2)) : ""}</Cell>
                <Cell span={3}>
                  <span className="flex items-center gap-1">
                    <input className={TXT} value={u.type} onChange={(e) => setUnit(u.id, { type: e.target.value })} placeholder="e.g. 2 Bed" />
                    <button
                      onClick={() => removeUnit(u.id)}
                      className="no-print shrink-0 px-1 text-ink-muted opacity-0 transition group-hover:opacity-100 hover:text-status-stop"
                      title="Remove this unit line"
                    >
                      ✕
                    </button>
                  </span>
                </Cell>
                <Cell>
                  <NumberInput className={NUM} value={u.totalGdv} onChange={(n) => setUnit(u.id, { totalGdv: n })} />
                </Cell>
                <Cell span={4} right>{u.totalGdv && u.m2 ? gbp(u.totalGdv / u.m2) : ""}</Cell>
              </tr>
            ))}
            {Array.from({ length: blankUnitRows }).map((_, i) => (
              <tr key={`blank-${i}`}>
                <Cell />
                <Cell />
                <Cell />
                <Cell span={3}>
                  {i === 0 && (
                    <button onClick={addUnit} className="no-print text-[11px] font-medium text-bronze-dark hover:underline">
                      + Add unit line
                    </button>
                  )}
                </Cell>
                <Cell />
                <Cell span={4} />
              </tr>
            ))}
            <Total label="Total Development Projected Sale Value (GDV)" value={out.gdv} />
            <tr>
              <Cell span={6}>Valuation Report:</Cell>
              <Cell span={5}>
                <input className={TXT} value={inp.valuationReport} onChange={(e) => set("valuationReport", e.target.value)} />
              </Cell>
            </tr>

            <Spacer />
            <Spacer />

            {/* ── Total Development Profit (rows 106–111) ── */}
            <tr>
              <Cell span={11} className="px-2 py-1 text-[13px] font-bold">Total Development Profit</Cell>
            </tr>
            <Spacer />
            <Row label="Total Projected Sale Value" cost={gbp(out.gdv)} />
            <Row label="Total Cost of Development" cost={gbp(-out.totalCostOfDevelopment)} />
            <Row label="VAT" cost={gbp(inp.vatOnCosts)} />
            <tr className="font-bold">
              <Cell span={6} bold>Net Profit</Cell>
              <Cell money className="border border-[#DDDBD6] bg-[#FFFF00] px-2 py-1 text-right font-bold tabular-nums">{gbp(out.netProfit)}</Cell>
              <Cell />
              <Cell className="border border-[#DDDBD6] bg-[#FFFF00] px-2 py-1 text-right font-bold tabular-nums">{pct(out.profitOnGdvPct, 1)}</Cell>
              <Cell span={2} bold nowrap>% Profit on GDV</Cell>
            </tr>

            <Spacer />
            <Spacer />

            {/* ── Sign-off (rows 116–118) ── */}
            <tr>
              <Cell span={4} bold>Submitted &amp; Reviewed By:</Cell>
              <Cell span={2} className="border-b border-ink/40" />
              <Cell bold>Signed:</Cell>
              <Cell span={4} className="border-b border-ink/40" />
            </tr>
            <Spacer />
            <tr>
              <Cell bold>Date:</Cell>
              <Cell span={2} className="border-b border-ink/40" />
              <Cell span={8} />
            </tr>
          </tbody>
        </table>
      </div>
      <p className="no-print text-[11px] text-ink-muted">
        Editable — white cells are inputs, shaded totals and £ amounts driven by a % recalculate live (as in the
        spreadsheet). Changes autosave and appear on the IPAD form too.
      </p>
    </div>
  );
}

/* ── styles ─────────────────────────────────────────────────────────────── */
const NUM = "w-full min-w-0 bg-transparent px-0.5 text-right tabular-nums outline-none rounded-sm focus:bg-bronze/15 focus:ring-1 focus:ring-bronze/50";
const TXT = "w-full min-w-0 bg-transparent px-0.5 outline-none rounded-sm focus:bg-bronze/15 focus:ring-1 focus:ring-bronze/50";

/* ── cell helpers ───────────────────────────────────────────────────────── */

function Cell({
  children,
  span = 1,
  bold,
  right,
  money,
  nowrap,
  className,
}: {
  children?: React.ReactNode;
  span?: number;
  bold?: boolean;
  right?: boolean;
  money?: boolean;
  nowrap?: boolean;
  className?: string;
}) {
  const base = className ?? "px-2 py-1";
  return (
    <td
      colSpan={span}
      className={`${className ? "" : "border border-[#DDDBD6]"} ${base} ${bold ? "font-semibold" : ""} ${
        right || money ? "text-right tabular-nums whitespace-nowrap" : ""
      } ${nowrap ? "whitespace-nowrap" : ""}`}
    >
      {children}
    </td>
  );
}

function Spacer() {
  return (
    <tr>
      <td colSpan={11} className="h-2 border-0" />
    </tr>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <tr>
      <Cell span={11} className="border border-[#DDDBD6] bg-paper-warm px-2 py-1 font-bold">{children}</Cell>
    </tr>
  );
}

// A cost line: label (A–F) · cost (G) · comment (H) · unit (I) · notes (J, K).
function Row({
  label,
  cost,
  h,
  hSpan,
  i,
  j,
  k,
  bold,
  labelBold,
}: {
  label: string;
  cost: React.ReactNode;
  h?: React.ReactNode;
  hSpan?: number;
  i?: React.ReactNode;
  j?: React.ReactNode;
  k?: React.ReactNode;
  bold?: boolean;
  labelBold?: boolean;
}) {
  return (
    <tr className={bold ? "font-semibold" : ""}>
      <Cell span={6} bold={labelBold || bold}>{label}</Cell>
      <Cell money bold={bold}>{cost}</Cell>
      {hSpan ? (
        <Cell span={hSpan}>{h}</Cell>
      ) : (
        <>
          <Cell right>{h}</Cell>
          {!j && !k ? (
            <Cell span={3} nowrap>{i}</Cell>
          ) : (
            <>
              <Cell nowrap>{i}</Cell>
              <Cell span={2} nowrap>
                <span className="flex items-center gap-1">
                  {j}
                  {k ? <span>{k}</span> : null}
                </span>
              </Cell>
            </>
          )}
        </>
      )}
    </tr>
  );
}

function Total({ label, value }: { label: string; value: number }) {
  return (
    <tr className="font-bold">
      <Cell span={6} bold>{label}</Cell>
      <Cell money bold className="border border-[#DDDBD6] border-t-2 border-t-ink px-2 py-1 text-right tabular-nums font-bold">
        {gbp(value)}
      </Cell>
      <Cell span={4} />
    </tr>
  );
}
