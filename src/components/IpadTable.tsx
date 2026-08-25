import type { IpadInputs } from "@/lib/types";
import type { IpadOutputs } from "@/lib/ipadCalc";
import { sqmToSqft } from "@/lib/ipadCalc";
import { gbp, num, pct } from "@/lib/format";

/**
 * Table view — the IPAD laid out exactly like the "IPAD Foundation" sheet in
 * the source Excel workbook: same row order, wording, columns (A–K), section
 * headers, totals and the yellow Net Profit line.
 */
export function IpadTable({
  inp,
  out,
  projectAddress,
  areaSqFt,
}: {
  inp: IpadInputs;
  out: IpadOutputs;
  projectAddress: string;
  areaSqFt: number;
}) {
  const area = inp.areaM2 || 0;
  const fa = out.feeAmounts;
  const ov = inp.overrides ?? {};
  const fixed = (k: string) => typeof ov[k] === "number";
  // Percentage cell: the % when calculated, "fixed £" when overridden.
  const pctCell = (k: string, v: number) => (fixed(k) ? "fixed £" : pct(v, 1));
  const commercialFinance = Math.max(out.totalPurchaseCosts - inp.privateFinance, 0); // G53
  const costOfCommercialFinance = out.totalPurchaseFinance - (fa.privateFinanceRatePerMonth ?? 0); // G59
  const dateStr = inp.appraisalDate
    ? new Date(inp.appraisalDate).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit" })
    : "";
  const units = inp.units ?? [];
  const blankUnitRows = Math.max(0, 18 - units.length); // the sheet has 18 slots (rows 84–101)

  return (
    <div className="print-page overflow-x-auto rounded-lg border border-paper-line bg-white p-4 shadow-sm print:border-0 print:p-0 print:shadow-none">
      <table className="ipad-sheet min-w-[1000px] border-collapse text-[12px] leading-tight text-ink">
        <colgroup>
          <col style={{ width: 80 }} />
          <col style={{ width: 62 }} />
          <col style={{ width: 62 }} />
          <col style={{ width: 62 }} />
          <col style={{ width: 62 }} />
          <col style={{ width: 300 }} />
          <col style={{ width: 104 }} />
          <col style={{ width: 52 }} />
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
            <Cell span={5} bold>{inp.description}</Cell>
            <Cell bold>Ref:</Cell>
            <Cell />
          </tr>
          <tr>
            <Cell span={4} bold>Appraisal Date:</Cell>
            <Cell span={2} bold>{dateStr}</Cell>
            <Cell span={5} />
          </tr>
          <tr>
            <Cell span={4} bold>Area:</Cell>
            <Cell bold right>{area ? num(area) : ""}</Cell>
            <Cell bold>m2</Cell>
            <Cell bold>GDV:</Cell>
            <Cell span={2} bold money>{gbp(out.gdv)}</Cell>
            <Cell bold>Profit:</Cell>
            <Cell bold money>{gbp(out.netProfit)}</Cell>
          </tr>
          <tr>
            <Cell span={4} bold>Project Timescales:</Cell>
            <Cell bold right>{inp.refTimescaleMonths ? num(inp.refTimescaleMonths) : ""}</Cell>
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
          <Line label="Purchase Price" cost={inp.purchasePrice} h={area ? gbp(inp.purchasePrice / area) : ""} i={area ? "per m2" : ""} />
          <Line label="Solicitors and Legal Fees" cost={inp.solicitors} />
          <Line label="Stamp Duty" cost={inp.stampDuty} />
          <Line label="Finder's Fee" cost={inp.findersFee} />
          <Line label="Management Fee" cost={inp.managementFee} />
          <Total label="TOTAL PURCHASE COSTS & FEES" value={out.totalPurchaseCosts} />

          <Spacer />

          {/* ── Construction / refurbishment (rows 21–46) ── */}
          <Section>Construction/Refurbishment Costs</Section>
          <Line label="Development Management Fee" cost={fa.devMgmtPct ?? 0} h={pctCell("devMgmtPct", inp.devMgmtPct)} i="of Total Construction Cost" />
          <Line label="Planning Fees" cost={fa.planningPct ?? 0} h={pctCell("planningPct", inp.planningPct)} i="of Total Construction Cost" />
          <Line label="Architect's First Stage" cost={fa.architect1Pct ?? 0} h={pctCell("architect1Pct", inp.architect1Pct)} i="of Total Construction Cost" />
          <Line label="Architect & Planning Fees - Second Stage" cost={fa.architect2Pct ?? 0} h={pctCell("architect2Pct", inp.architect2Pct)} i="of Total Construction Cost" />
          <Line label="Structural Engineer" cost={fa.structuralPct ?? 0} h={pctCell("structuralPct", inp.structuralPct)} i="of Total Construction Cost" />
          <Line label="Party Wall Surveyor" cost={inp.partyWall} h="TBC" />
          <Line label="SAPS (included builder's costs)" cost={inp.saps} h="TBC" />
          <Line label="Contract Administration by Project Manager" cost={fa.contractAdminPct ?? 0} h={pctCell("contractAdminPct", inp.contractAdminPct)} i="of Total Construction Cost" />
          <Line label="Empty Building Rates/Council Tax" cost={inp.emptyRates} h="TBC" />
          <Line label="Building Warranty" cost={inp.buildingWarranty} h="Circa £1,500/Unit Residential" hSpan={4} />
          <Line label="CDM Co-ordinator" cost={fa.cdmPct ?? 0} h={pctCell("cdmPct", inp.cdmPct)} i="of Total Construction Cost" />
          <Line label="CIL/106" cost={inp.cil106} h="TBC" />
          <Line label="Building Control" cost={inp.buildingControl} h="TBC" />
          <Line label="Demolition Costs" cost={inp.demolition} h="TBC" />
          <Line label="Asbestos/contaminant removal" cost={inp.asbestos} h="TBC" />
          <Line label="Commercial Refurbishment/Construction Cost" cost={area * inp.commercialRatePerM2} h={gbp(inp.commercialRatePerM2)} i="per m2" j=") These rates are for xxx" />
          <Line label="Industrial Refurbishment/Construction Cost" cost={area * inp.industrialRatePerM2} h={gbp(inp.industrialRatePerM2)} i="per m2" j=") postcode" />
          <Line label="New Build Cost" cost={area * inp.newBuildRatePerM2} h={gbp(inp.newBuildRatePerM2)} i="per m2" j=") specifically" />
          <Line label="Landscaping/External Works" cost={inp.landscaping} h="TBC" />
          <Line label="Other Costs" cost={inp.otherCosts} h="TBC" />
          <Line label={`Contingency  @${+(inp.contingencyPct * 100).toFixed(1)}%`} cost={fa.contingencyPct ?? 0} h={pctCell("contingencyPct", inp.contingencyPct)} />
          <Line label="Utilities" cost={inp.utilities} h="Circa £1,000/service/unit" hSpan={4} />
          <Line label="Accountancy, Book-keeping etc. for SPV" cost={inp.accountancy} h="TBC" />
          <Line label="VAT on costs" cost={inp.vatOnCosts} h="TBC (New build 0%, Refurb 5%, Accountant to advise)" hSpan={4} />
          <Total label="TOTAL CONSTRUCTION/REFURBISHMENT COSTS" value={out.totalConstruction} />

          <Spacer />

          {/* ── Finance — purchase (rows 48–61) ── */}
          <Section>Finance Costs - Purchase</Section>
          <Line label="Private Finance" labelBold cost={inp.privateFinance} />
          <Line
            label={`Purchase Private Finance Cost for ${num(inp.privateFinanceMonths)} months @ ${+(inp.privateFinanceRatePerMonth * 100).toFixed(2)}% per month`}
            cost={fa.privateFinanceRatePerMonth ?? 0}
            h={num(inp.privateFinanceMonths)}
            i="Months @"
            j={pct(inp.privateFinanceRatePerMonth, 1)}
            k="interest"
          />
          <Line label="Cost of Private Finance" labelBold cost={fa.privateFinanceRatePerMonth ?? 0} />
          <Spacer />
          <Line label="Commercial Finance" labelBold cost={commercialFinance} h="Commercial Finance" hSpan={4} />
          <Line
            label={`Purchase Bridging Cost for ${num(inp.commBridgeMonths)} months @ ${+(inp.commBridgeRatePerMonth * 100).toFixed(2)}% per month`}
            cost={fa.commBridgeRatePerMonth ?? 0}
            h={num(inp.commBridgeMonths)}
            i="Months @"
            j={pct(inp.commBridgeRatePerMonth, 1)}
            k="interest"
          />
          <Line label={`Broker Fee  @${+(inp.commBrokerPct * 100).toFixed(1)}%`} cost={fa.commBrokerPct ?? 0} h={pctCell("commBrokerPct", inp.commBrokerPct)} />
          <Line label={`Lender Admin Fee ${+(inp.commAdminPct * 100).toFixed(1)}%`} cost={fa.commAdminPct ?? 0} h={pctCell("commAdminPct", inp.commAdminPct)} />
          <Line label="Lender Valuation Fee" cost={inp.commValuation} h="TBC" />
          <Line label={`Lender Exit Fee ${+(inp.commExitPct * 100).toFixed(1)}%`} cost={fa.commExitPct ?? 0} h={pctCell("commExitPct", inp.commExitPct)} />
          <Line label="Cost of Commercial Finance" labelBold cost={costOfCommercialFinance} bold />
          <Spacer />
          <Total label="Total Purchase Financing Costs" value={out.totalPurchaseFinance} />

          <Spacer />

          {/* ── Finance — development (rows 63–72) ── */}
          <Section>Finance Costs - Development</Section>
          <Line label="Development Loan" labelBold cost={out.totalConstruction} h="Commercial Finance" hSpan={4} />
          <Line
            label={`Development Bridging Cost for ${num(inp.devBridgeMonths)} months @ ${+(inp.devBridgeRatePerMonth * 100).toFixed(2)}% per month`}
            cost={fa.devBridgeRatePerMonth ?? 0}
            h={num(inp.devBridgeMonths)}
            i="Months @"
            j={pct(inp.devBridgeRatePerMonth, 1)}
            k="interest"
          />
          <Line label={`Broker Fee (${+(inp.devBrokerPct * 100).toFixed(1)}%)`} cost={fa.devBrokerPct ?? 0} h={pctCell("devBrokerPct", inp.devBrokerPct)} />
          <Line label={`Lender Admin Fee ${+(inp.devAdminPct * 100).toFixed(1)}%`} cost={fa.devAdminPct ?? 0} h={pctCell("devAdminPct", inp.devAdminPct)} />
          <Line label="Lender Valuation Fee" cost={inp.devValuation} h="TBC" />
          <Line label={`Lender Exit Fee ${+(inp.devExitPct * 100).toFixed(1)}%`} cost={fa.devExitPct ?? 0} h={pctCell("devExitPct", inp.devExitPct)} />
          <Total label="Total Development Financing Costs" value={out.totalDevFinance} />

          <Spacer />
          <Total label="TOTAL FINANCE COSTS" value={out.totalFinance} />
          <Spacer />

          {/* ── Disposal (rows 74–79) ── */}
          <Line label="Agent's Selling Fees including legals" cost={fa.agentSellingPct ?? 0} h={pctCell("agentSellingPct", inp.agentSellingPct)} i="of GDV" />
          <Total label="TOTAL DISPOSAL COSTS" value={out.totalDisposal} />
          <Spacer />
          <Line label="Cost per sqm (excluding finance)" cost={out.costPerSqmExFinance} dp={2} />
          <Line label="Cost per sqm (including finance)" cost={out.costPerSqmIncFinance} dp={2} />
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
            <tr key={u.id}>
              <Cell right>{u.units || ""}</Cell>
              <Cell right>{u.m2 || ""}</Cell>
              <Cell right>{u.m2 ? num(sqmToSqft(u.m2)) : ""}</Cell>
              <Cell span={3}>{u.type}</Cell>
              <Cell money>{u.totalGdv ? gbp(u.totalGdv) : ""}</Cell>
              <Cell span={4} right>{u.totalGdv && u.m2 ? gbp(u.totalGdv / u.m2) : ""}</Cell>
            </tr>
          ))}
          {Array.from({ length: blankUnitRows }).map((_, i) => (
            <tr key={`blank-${i}`}>
              <Cell />
              <Cell />
              <Cell />
              <Cell span={3} />
              <Cell />
              <Cell span={4} />
            </tr>
          ))}
          <Total label="Total Development Projected Sale Value (GDV)" value={out.gdv} />
          <tr>
            <Cell span={6}>Valuation Report:</Cell>
            <Cell span={5}>{inp.valuationReport}</Cell>
          </tr>

          <Spacer />
          <Spacer />

          {/* ── Total Development Profit (rows 106–111) ── */}
          <tr>
            <Cell span={11} className="px-2 py-1 text-[13px] font-bold">Total Development Profit</Cell>
          </tr>
          <Spacer />
          <Line label="Total Projected Sale Value" cost={out.gdv} />
          <Line label="Total Cost of Development" cost={-out.totalCostOfDevelopment} />
          <Line label="VAT" cost={inp.vatOnCosts} />
          <tr className="font-bold">
            <Cell span={6} bold>Net Profit</Cell>
            <Cell money className="bg-[#FFFF00] px-2 py-1 font-bold">{gbp(out.netProfit)}</Cell>
            <Cell />
            <Cell right className="bg-[#FFFF00] px-2 py-1 font-bold">{pct(out.profitOnGdvPct, 1)}</Cell>
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
            <Cell span={1} bold>Date:</Cell>
            <Cell span={2} className="border-b border-ink/40" />
            <Cell span={8} />
          </tr>
        </tbody>
      </table>
      <p className="no-print mt-3 text-[11px] text-ink-muted">
        Read-only view — matches the IPAD Foundation worksheet. Edit the figures on the IPAD form.
      </p>
    </div>
  );
}

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
      className={`border border-[#DDDBD6] ${base} ${bold ? "font-semibold" : ""} ${
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
      <Cell span={11} className="bg-paper-warm px-2 py-1 font-bold">{children}</Cell>
    </tr>
  );
}

// A cost line: label (A–F) · cost (G) · comment (H) · unit (I) · notes (J, K).
function Line({
  label,
  cost,
  h,
  hSpan,
  i,
  j,
  k,
  dp = 0,
  bold,
  labelBold,
}: {
  label: string;
  cost: number;
  h?: string;
  hSpan?: number;
  i?: string;
  j?: string;
  k?: string;
  dp?: number;
  bold?: boolean;
  labelBold?: boolean;
}) {
  return (
    <tr className={bold ? "font-semibold" : ""}>
      <Cell span={6} bold={labelBold || bold}>
        {label}
      </Cell>
      <Cell money bold={bold}>{gbp(cost, dp)}</Cell>
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
              <Cell span={2} nowrap>{j}{k ? ` ${k}` : ""}</Cell>
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
      <Cell span={6} bold>
        {label}
      </Cell>
      <Cell money bold className="border-t-2 border-ink px-2 py-1">{gbp(value)}</Cell>
      <Cell span={4} />
    </tr>
  );
}
