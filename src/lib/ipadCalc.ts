import type { IpadInputs } from "./types";

const SQM_PER_SQFT = 0.092903;
export const sqftToSqm = (sqft: number) => sqft * SQM_PER_SQFT;
export const sqmToSqft = (sqm: number) => sqm / SQM_PER_SQFT;

/** Today's date as an ISO yyyy-mm-dd string (server timezone). */
export const todayISO = () => new Date().toISOString().slice(0, 10);

// Default assumptions mirror the IPAD "Foundation" sheet (% of construction cost
// or % of GDV as noted). All are editable inputs in the UI.
export function defaultIpadInputs(partial?: Partial<IpadInputs>): IpadInputs {
  return {
    areaM2: 0,
    refTimescaleMonths: 18,

    purchasePrice: 0,
    solicitors: 0,
    stampDuty: 0,
    findersFee: 0,
    managementFee: 0,

    demolition: 0,
    asbestos: 0,
    commercialRatePerM2: 0,
    industrialRatePerM2: 0,
    newBuildRatePerM2: 0,
    landscaping: 0,
    otherCosts: 0,
    contingencyPct: 0.05,
    utilities: 0,
    accountancy: 0,
    vatOnCosts: 0,

    devMgmtPct: 0.1,
    planningPct: 0.01,
    architect1Pct: 0.02,
    architect2Pct: 0.02,
    structuralPct: 0.02,
    contractAdminPct: 0.03,
    cdmPct: 0.01,
    partyWall: 0,
    saps: 0,
    emptyRates: 0,
    buildingWarranty: 0,
    cil106: 0,
    buildingControl: 0,

    privateFinance: 0,
    privateFinanceMonths: 0,
    privateFinanceRatePerMonth: 0,
    commBridgeMonths: 0,
    commBridgeRatePerMonth: 0.01,
    commBrokerPct: 0.005,
    commAdminPct: 0.01,
    commValuation: 0,
    commExitPct: 0.02,

    devBridgeMonths: 0,
    devBridgeRatePerMonth: 0.01,
    devBrokerPct: 0.005,
    devAdminPct: 0.01,
    devValuation: 0,
    devExitPct: 0.02,

    agentSellingPct: 0.015,

    units: [],
    valuationReport: "",

    description: "",
    appraisalDate: todayISO(),
    overrides: {},
    ...partial,
  };
}

export interface IpadOutputs {
  gdv: number;
  noUnits: number;
  totalPurchaseCosts: number;
  constructionBase: number; // G35:G43
  totalConstruction: number; // G46
  totalPurchaseFinance: number; // G61
  totalDevFinance: number; // G70
  totalFinance: number; // G72
  totalDisposal: number; // G75
  costPerSqmExFinance: number; // G77
  costPerSqmIncFinance: number; // G78
  totalCostOfDevelopment: number; // G79
  netProfit: number; // G111
  profitOnGdvPct: number; // K9 / I111
  profitOnCostPct: number;
  // line-level breakdown for display
  lines: { label: string; value: number; note?: string }[];
  // actual £ amount used for each percentage-driven fee, keyed by its pct field
  feeAmounts: Record<string, number>;
}

export function computeIpad(inp: IpadInputs): IpadOutputs {
  const area = inp.areaM2 || 0;
  const ov = inp.overrides ?? {};
  // Use a fixed £ override for a fee when present, otherwise the % calculation.
  const fee = (key: string, computed: number) => (typeof ov[key] === "number" ? ov[key] : computed);

  // ── GDV & units ──
  const gdv = inp.units.reduce((s, u) => s + (u.totalGdv || 0), 0);
  const noUnits = inp.units.reduce((s, u) => s + (u.units || 0), 0);

  // ── Purchase costs & fees (G19) ──
  const totalPurchaseCosts =
    inp.purchasePrice + inp.solicitors + inp.stampDuty + inp.findersFee + inp.managementFee;

  // ── Construction base (G35:G43) ──
  const commercial = area * inp.commercialRatePerM2;
  const industrial = area * inp.industrialRatePerM2;
  const newBuild = area * inp.newBuildRatePerM2;
  const contingency = fee("contingencyPct", (commercial + industrial + newBuild + inp.landscaping + inp.otherCosts) * inp.contingencyPct);
  const constructionBase =
    inp.demolition + inp.asbestos + commercial + industrial + newBuild + inp.landscaping + inp.otherCosts + contingency + inp.utilities;

  // ── Construction fees (% of construction base) ──
  const devMgmt = fee("devMgmtPct", constructionBase * inp.devMgmtPct);
  const planning = fee("planningPct", constructionBase * inp.planningPct);
  const architect1 = fee("architect1Pct", constructionBase * inp.architect1Pct);
  const architect2 = fee("architect2Pct", constructionBase * inp.architect2Pct);
  const structural = fee("structuralPct", constructionBase * inp.structuralPct);
  const contractAdmin = fee("contractAdminPct", constructionBase * inp.contractAdminPct);
  const cdm = fee("cdmPct", constructionBase * inp.cdmPct);

  // ── Total construction/refurb (G46) ──
  const totalConstruction =
    devMgmt + planning + architect1 + architect2 + structural + inp.partyWall + inp.saps + contractAdmin +
    inp.emptyRates + inp.buildingWarranty + cdm + inp.cil106 + inp.buildingControl +
    constructionBase + inp.accountancy + inp.vatOnCosts;

  // ── Finance — purchase ──
  const privateCost = fee("privateFinanceRatePerMonth", inp.privateFinance * inp.privateFinanceRatePerMonth * inp.privateFinanceMonths);
  const commercialFinance = Math.max(totalPurchaseCosts - inp.privateFinance, 0); // G53
  const commBridge = fee("commBridgeRatePerMonth", commercialFinance * inp.commBridgeRatePerMonth * inp.commBridgeMonths);
  const commBroker = fee("commBrokerPct", commercialFinance * inp.commBrokerPct);
  const commAdmin = fee("commAdminPct", commercialFinance * inp.commAdminPct);
  const commExit = fee("commExitPct", commercialFinance * inp.commExitPct);
  const commercialFinanceCost = commBridge + commBroker + commAdmin + inp.commValuation + commExit; // G59
  const totalPurchaseFinance = commercialFinanceCost + privateCost; // G61

  // ── Finance — development ──
  const devLoan = totalConstruction; // G64
  const devBridge = fee("devBridgeRatePerMonth", devLoan * inp.devBridgeRatePerMonth * inp.devBridgeMonths);
  const devBroker = fee("devBrokerPct", devLoan * inp.devBrokerPct);
  const devAdmin = fee("devAdminPct", devLoan * inp.devAdminPct);
  const devExit = fee("devExitPct", devLoan * inp.devExitPct);
  const totalDevFinance = devBridge + devBroker + devAdmin + inp.devValuation + devExit; // G70

  const totalFinance = totalDevFinance + totalPurchaseFinance; // G72

  // ── Disposal ──
  const totalDisposal = fee("agentSellingPct", gdv * inp.agentSellingPct); // G74/G75

  // ── Totals ──
  const totalCostOfDevelopment = totalDisposal + totalFinance + totalConstruction + totalPurchaseCosts; // G79
  const costPerSqmExFinance = area ? totalConstruction / area : 0;
  const costPerSqmIncFinance = area ? (totalConstruction + totalFinance) / area : 0;

  // ── Profit (replicates G111 = GDV - cost + VAT) ──
  const netProfit = gdv - totalCostOfDevelopment + inp.vatOnCosts;
  const profitOnGdvPct = gdv ? netProfit / gdv : 0;
  const profitOnCostPct = totalCostOfDevelopment ? netProfit / totalCostOfDevelopment : 0;

  const lines = [
    { label: "Total Purchase Costs & Fees", value: totalPurchaseCosts },
    { label: "Total Construction / Refurbishment", value: totalConstruction },
    { label: "Total Purchase Finance", value: totalPurchaseFinance },
    { label: "Total Development Finance", value: totalDevFinance },
    { label: "Total Finance Costs", value: totalFinance },
    {
      label: "Total Disposal Costs",
      value: totalDisposal,
      note: typeof ov.agentSellingPct === "number" ? "fixed £" : `${(inp.agentSellingPct * 100).toFixed(1)}% of GDV`,
    },
    { label: "Total Cost of Development", value: totalCostOfDevelopment },
  ];

  const feeAmounts: Record<string, number> = {
    contingencyPct: contingency,
    devMgmtPct: devMgmt,
    planningPct: planning,
    architect1Pct: architect1,
    architect2Pct: architect2,
    structuralPct: structural,
    contractAdminPct: contractAdmin,
    cdmPct: cdm,
    privateFinanceRatePerMonth: privateCost,
    commBridgeRatePerMonth: commBridge,
    commBrokerPct: commBroker,
    commAdminPct: commAdmin,
    commExitPct: commExit,
    devBridgeRatePerMonth: devBridge,
    devBrokerPct: devBroker,
    devAdminPct: devAdmin,
    devExitPct: devExit,
    agentSellingPct: totalDisposal,
  };

  return {
    gdv,
    noUnits,
    totalPurchaseCosts,
    constructionBase,
    totalConstruction,
    totalPurchaseFinance,
    totalDevFinance,
    totalFinance,
    totalDisposal,
    costPerSqmExFinance,
    costPerSqmIncFinance,
    totalCostOfDevelopment,
    netProfit,
    profitOnGdvPct,
    profitOnCostPct,
    lines,
    feeAmounts,
  };
}
