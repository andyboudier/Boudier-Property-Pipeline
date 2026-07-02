"use client";

import type { IpadInputs } from "@/lib/types";
import type { IpadOutputs } from "@/lib/ipadCalc";
import { gbp } from "@/lib/format";

type SetFn = <K extends keyof IpadInputs>(key: K, value: IpadInputs[K]) => void;
type OverrideFn = (key: string, value: number | null) => void;

// Faithful rebuild of the IPAD "Foundation" sheet — PROJECT COSTS, in the same
// order and wording. Item | Cost | Comments. £ rows are entered in Cost; % and
// per-m² rows are entered in Comments with the resulting £ shown in Cost.
export function IpadProjectCosts({ inp, out, set, setOverride }: { inp: IpadInputs; out: IpadOutputs; set: SetFn; setOverride: OverrideFn }) {
  const area = inp.areaM2 || 0;
  const fa = out.feeAmounts;
  const commercialFinance = Math.max(out.totalPurchaseCosts - inp.privateFinance, 0); // G53
  const costOfCommercialFinance = out.totalPurchaseFinance - (fa.privateFinanceRatePerMonth ?? 0); // G59

  return (
    <section className="card overflow-hidden">
      <h2 className="border-b-2 border-ink bg-paper-warm/70 px-5 py-2.5 font-serif text-lg font-semibold tracking-wide text-ink">PROJECT COSTS</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-paper-line text-left text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
              <th className="px-4 py-2">Item</th>
              <th className="w-40 px-3 py-2 text-right">Cost</th>
              <th className="px-4 py-2">Comments</th>
            </tr>
          </thead>
          <tbody>
            {/* ── Purchase Cost & Fees ── */}
            <Sub label="Purchase Cost & Fees" />
            <Money label="Purchase Price" k="purchasePrice" inp={inp} set={set} comment={area ? `${gbp(inp.purchasePrice / area)} per m²` : ""} />
            <Money label="Solicitors and Legal Fees" k="solicitors" inp={inp} set={set} />
            <Money label="Stamp Duty" k="stampDuty" inp={inp} set={set} />
            <Money label="Finder's Fee" k="findersFee" inp={inp} set={set} />
            <Money label="Management Fee" k="managementFee" inp={inp} set={set} />
            <Total label="TOTAL PURCHASE COSTS & FEES" value={out.totalPurchaseCosts} />

            {/* ── Construction/Refurbishment Costs ── */}
            <Sub label="Construction/Refurbishment Costs" />
            <Pct label="Development Management Fee" k="devMgmtPct" inp={inp} out={out} set={set} setOverride={setOverride} of="of Total Construction Cost" />
            <Pct label="Planning Fees" k="planningPct" inp={inp} out={out} set={set} setOverride={setOverride} of="of Total Construction Cost" />
            <Pct label="Architect's First Stage" k="architect1Pct" inp={inp} out={out} set={set} setOverride={setOverride} of="of Total Construction Cost" />
            <Pct label="Architect & Planning Fees - Second Stage" k="architect2Pct" inp={inp} out={out} set={set} setOverride={setOverride} of="of Total Construction Cost" />
            <Pct label="Structural Engineer" k="structuralPct" inp={inp} out={out} set={set} setOverride={setOverride} of="of Total Construction Cost" />
            <Money label="Party Wall Surveyor" k="partyWall" inp={inp} set={set} comment="TBC" />
            <Money label="SAPS (included builder's costs)" k="saps" inp={inp} set={set} comment="TBC" />
            <Pct label="Contract Administration by Project Manager" k="contractAdminPct" inp={inp} out={out} set={set} setOverride={setOverride} of="of Total Construction Cost" />
            <Money label="Empty Building Rates/Council Tax" k="emptyRates" inp={inp} set={set} comment="TBC" />
            <Money label="Building Warranty" k="buildingWarranty" inp={inp} set={set} comment="Circa £1,500/Unit Residential" />
            <Pct label="CDM Co-ordinator" k="cdmPct" inp={inp} out={out} set={set} setOverride={setOverride} of="of Total Construction Cost" />
            <Money label="CIL/106" k="cil106" inp={inp} set={set} comment="TBC" />
            <Money label="Building Control" k="buildingControl" inp={inp} set={set} comment="TBC" />
            <Money label="Demolition Costs" k="demolition" inp={inp} set={set} comment="TBC" />
            <Money label="Asbestos/contaminant removal" k="asbestos" inp={inp} set={set} comment="TBC" />
            <Rate label="Commercial Refurbishment/Construction Cost" k="commercialRatePerM2" inp={inp} area={area} set={set} />
            <Rate label="Industrial Refurbishment/Construction Cost" k="industrialRatePerM2" inp={inp} area={area} set={set} />
            <Rate label="New Build Cost" k="newBuildRatePerM2" inp={inp} area={area} set={set} />
            <Money label="Landscaping/External Works" k="landscaping" inp={inp} set={set} comment="TBC" />
            <Money label="Other Costs" k="otherCosts" inp={inp} set={set} comment="TBC" />
            <Pct label={`Contingency @ ${(inp.contingencyPct * 100).toFixed(0)}%`} k="contingencyPct" inp={inp} out={out} set={set} setOverride={setOverride} of="of build + landscaping + other" />
            <Money label="Utilities" k="utilities" inp={inp} set={set} comment="Circa £1,000/service/unit" />
            <Money label="Accountancy, Book-keeping etc. for SPV" k="accountancy" inp={inp} set={set} comment="TBC" />
            <Money label="VAT on costs" k="vatOnCosts" inp={inp} set={set} comment="TBC (New build 0%, Refurb 5%, Accountant to advise)" />
            <Total label="TOTAL CONSTRUCTION/REFURBISHMENT COSTS" value={out.totalConstruction} />

            {/* ── Finance Costs - Purchase ── */}
            <Sub label="Finance Costs - Purchase" />
            <Money label="Private Finance" k="privateFinance" inp={inp} set={set} />
            <Bridge label="Purchase Private Finance Cost" monthsK="privateFinanceMonths" rateK="privateFinanceRatePerMonth" inp={inp} value={fa.privateFinanceRatePerMonth ?? 0} set={set} setOverride={setOverride} />
            <Computed label="Cost of Private Finance" value={fa.privateFinanceRatePerMonth ?? 0} />
            <Computed label="Commercial Finance" value={commercialFinance} comment="Commercial Finance" />
            <Bridge label="Purchase Bridging Cost" monthsK="commBridgeMonths" rateK="commBridgeRatePerMonth" inp={inp} value={fa.commBridgeRatePerMonth ?? 0} set={set} setOverride={setOverride} />
            <Pct label="Broker Fee" k="commBrokerPct" inp={inp} out={out} set={set} setOverride={setOverride} of="of Commercial Finance" />
            <Pct label="Lender Admin Fee" k="commAdminPct" inp={inp} out={out} set={set} setOverride={setOverride} of="of Commercial Finance" />
            <Money label="Lender Valuation Fee" k="commValuation" inp={inp} set={set} comment="TBC" />
            <Pct label="Lender Exit Fee" k="commExitPct" inp={inp} out={out} set={set} setOverride={setOverride} of="of Commercial Finance" />
            <Computed label="Cost of Commercial Finance" value={costOfCommercialFinance} />
            <Total label="Total Purchase Financing Costs" value={out.totalPurchaseFinance} />

            {/* ── Finance Costs - Development ── */}
            <Sub label="Finance Costs - Development" />
            <Computed label="Development Loan" value={out.totalConstruction} comment="Commercial Finance" />
            <Bridge label="Development Bridging Cost" monthsK="devBridgeMonths" rateK="devBridgeRatePerMonth" inp={inp} value={fa.devBridgeRatePerMonth ?? 0} set={set} setOverride={setOverride} />
            <Pct label="Broker Fee" k="devBrokerPct" inp={inp} out={out} set={set} setOverride={setOverride} of="of Development Loan" />
            <Pct label="Lender Admin Fee" k="devAdminPct" inp={inp} out={out} set={set} setOverride={setOverride} of="of Development Loan" />
            <Money label="Lender Valuation Fee" k="devValuation" inp={inp} set={set} comment="TBC" />
            <Pct label="Lender Exit Fee" k="devExitPct" inp={inp} out={out} set={set} setOverride={setOverride} of="of Development Loan" />
            <Total label="Total Development Financing Costs" value={out.totalDevFinance} />

            <Total label="TOTAL FINANCE COSTS" value={out.totalFinance} bold />

            {/* ── Disposal ── */}
            <Sub label="Disposal" />
            <Pct label="Agent's Selling Fees including legals" k="agentSellingPct" inp={inp} out={out} set={set} setOverride={setOverride} of="of GDV" />
            <Total label="TOTAL DISPOSAL COSTS" value={out.totalDisposal} />

            {/* ── Summary ── */}
            <Computed label="Cost per sqm (excluding finance)" value={out.costPerSqmExFinance} />
            <Computed label="Cost per sqm (including finance)" value={out.costPerSqmIncFinance} />
            <Total label="Total Cost of Development" value={out.totalCostOfDevelopment} bold />
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ── Row renderers ────────────────────────────────────────────────────────────
function Sub({ label }: { label: string }) {
  return (
    <tr className="bg-paper-warm/50">
      <td colSpan={3} className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-bronze-dark">{label}</td>
    </tr>
  );
}

function Money({ label, k, inp, set, comment }: { label: string; k: keyof IpadInputs; inp: IpadInputs; set: SetFn; comment?: string }) {
  return (
    <tr className="border-t border-paper-line/70">
      <Td>{label}</Td>
      <td className="px-3 py-1.5 text-right">
        <input
          type="number"
          className="field-sm w-32 text-right tabular-nums"
          value={(inp[k] as number) || 0}
          onChange={(e) => set(k, (Number(e.target.value) || 0) as IpadInputs[typeof k])}
        />
      </td>
      <Td muted>{comment}</Td>
    </tr>
  );
}

function Rate({ label, k, inp, area, set }: { label: string; k: keyof IpadInputs; inp: IpadInputs; area: number; set: SetFn }) {
  const rate = (inp[k] as number) || 0;
  return (
    <tr className="border-t border-paper-line/70">
      <Td>{label}</Td>
      <CostCell value={area * rate} />
      <td className="px-4 py-1.5">
        <span className="inline-flex items-center gap-1.5">
          <input type="number" className="field-sm w-24 tabular-nums" value={rate} onChange={(e) => set(k, (Number(e.target.value) || 0) as IpadInputs[typeof k])} />
          <span className="text-xs text-ink-muted">per m²</span>
        </span>
      </td>
    </tr>
  );
}

function Pct({ label, k, inp, out, set, setOverride, of }: { label: string; k: keyof IpadInputs; inp: IpadInputs; out: IpadOutputs; set: SetFn; setOverride: OverrideFn; of: string }) {
  const override = inp.overrides?.[k as string];
  const isFixed = typeof override === "number";
  const computed = out.feeAmounts[k as string] ?? 0;
  const pctVal = (inp[k] as number) || 0;
  const tBtn = (active: boolean) => `px-2 py-1 text-[11px] font-bold transition ${active ? "bg-ink text-white" : "bg-paper-line text-ink hover:bg-bronze/30"}`;
  return (
    <tr className="border-t border-paper-line/70">
      <Td>{label}</Td>
      <CostCell value={isFixed ? (override as number) : computed} />
      <td className="px-4 py-1.5">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-flex overflow-hidden rounded border border-paper-line">
            <button type="button" className={tBtn(!isFixed)} onClick={() => setOverride(k as string, null)} title="Calculate as a percentage">%</button>
            <button type="button" className={tBtn(isFixed)} onClick={() => setOverride(k as string, computed)} title="Enter a fixed £ amount instead">£</button>
          </span>
          {isFixed ? (
            <input type="number" className="field-sm w-28 tabular-nums" value={override as number} onChange={(e) => setOverride(k as string, Number(e.target.value) || 0)} />
          ) : (
            <>
              <input
                type="number"
                step="0.1"
                className="field-sm w-16 tabular-nums"
                value={+(pctVal * 100).toFixed(3)}
                onChange={(e) => set(k, ((Number(e.target.value) || 0) / 100) as IpadInputs[typeof k])}
              />
              <span className="text-xs text-ink-muted">% {of}</span>
            </>
          )}
        </span>
      </td>
    </tr>
  );
}

function Bridge({ label, monthsK, rateK, inp, value, set, setOverride }: { label: string; monthsK: keyof IpadInputs; rateK: keyof IpadInputs; inp: IpadInputs; value: number; set: SetFn; setOverride: OverrideFn }) {
  const months = (inp[monthsK] as number) || 0;
  const rate = (inp[rateK] as number) || 0;
  const override = inp.overrides?.[rateK as string];
  const isFixed = typeof override === "number";
  const tBtn = (active: boolean) => `px-2 py-1 text-[11px] font-bold transition ${active ? "bg-ink text-white" : "bg-paper-line text-ink hover:bg-bronze/30"}`;
  return (
    <tr className="border-t border-paper-line/70">
      <Td>{isFixed ? `${label} (fixed £)` : `${label} for ${months} months @ ${+(rate * 100).toFixed(3)}% per month`}</Td>
      <CostCell value={value} />
      <td className="px-4 py-1.5">
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <span className="inline-flex overflow-hidden rounded border border-paper-line">
            <button type="button" className={tBtn(!isFixed)} onClick={() => setOverride(rateK as string, null)} title="Calculate as a percentage">%</button>
            <button type="button" className={tBtn(isFixed)} onClick={() => setOverride(rateK as string, value)} title="Enter a fixed £ amount instead">£</button>
          </span>
          {isFixed ? (
            <input type="number" className="field-sm w-28 tabular-nums" value={override as number} onChange={(e) => setOverride(rateK as string, Number(e.target.value) || 0)} />
          ) : (
            <>
              <input type="number" className="field-sm w-16 tabular-nums" value={months} onChange={(e) => set(monthsK, (Number(e.target.value) || 0) as IpadInputs[typeof monthsK])} />
              <span className="text-xs text-ink-muted">months @</span>
              <input type="number" step="0.1" className="field-sm w-16 tabular-nums" value={+(rate * 100).toFixed(3)} onChange={(e) => set(rateK, ((Number(e.target.value) || 0) / 100) as IpadInputs[typeof rateK])} />
              <span className="text-xs text-ink-muted">% interest</span>
            </>
          )}
        </span>
      </td>
    </tr>
  );
}

function Computed({ label, value, comment }: { label: string; value: number; comment?: string }) {
  return (
    <tr className="border-t border-paper-line/70 text-ink-soft">
      <Td>{label}</Td>
      <CostCell value={value} />
      <Td muted>{comment}</Td>
    </tr>
  );
}

function Total({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <tr className={`border-t border-paper-line ${bold ? "bg-ink/5" : "bg-paper-warm/40"}`}>
      <td className="px-4 py-2 text-sm font-semibold text-ink">{label}</td>
      <td className="px-3 py-2 text-right text-sm font-semibold tabular-nums text-ink">{gbp(value)}</td>
      <td />
    </tr>
  );
}

function Td({ children, muted }: { children?: React.ReactNode; muted?: boolean }) {
  return <td className={`px-4 py-1.5 ${muted ? "text-xs text-ink-muted" : "text-ink"}`}>{children}</td>;
}
function CostCell({ value }: { value: number }) {
  return <td className="px-3 py-1.5 text-right tabular-nums text-ink-soft">{gbp(value)}</td>;
}
