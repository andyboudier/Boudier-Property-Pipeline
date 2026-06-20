import type {
  Property,
  ProcedabilityCheck,
  ProcedabilityResult,
  ProcedabilitySettings,
} from "./types";
import { dcasStats } from "./dcasSchema";
import { computeIpad } from "./ipadCalc";
import { segmentStats } from "./macCalc";

// Default, configurable thresholds. Override via the Settings page (stored at
// settings/procedability in Firestore) — see lib/db.ts.
export const DEFAULT_SETTINGS: ProcedabilitySettings = {
  minSqFt: 1500,
  maxSqFt: 40000,
  targetProfitOnGdvPct: 0.18,
  reviewProfitOnGdvPct: 0.12,
  maxConcerningForGo: 3,
  minDcasCompletionPct: 0.6,
};

const GBP = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

/**
 * Procedability is a traffic-light derived from every stage of the appraisal:
 *  - Size gate (min/max sq ft)
 *  - DCAS: no "Critical" criterion; "Concerning" within tolerance; enough answered
 *  - IPAD viability: % profit on GDV vs target / review floor
 *  - MAC demand: a soft signal from sales ratio where comps exist
 *
 * Worst outcome wins: any FAIL → not-proceedable; otherwise any WARN → review;
 * if the picture is too thin to judge → incomplete; else proceedable.
 */
export function evaluateProcedability(
  p: Property,
  settings: ProcedabilitySettings = DEFAULT_SETTINGS,
): ProcedabilityResult {
  const checks: ProcedabilityCheck[] = [];

  // 1. SIZE GATE ────────────────────────────────────────────────────────────
  const size = p.sizeSqFt;
  if (size == null) {
    checks.push({ key: "size", label: "Floor area", outcome: "na", detail: "Size (sq ft) not yet captured." });
  } else if (size < settings.minSqFt) {
    checks.push({
      key: "size",
      label: "Floor area",
      outcome: "fail",
      detail: `${size.toLocaleString()} sq ft is below the ${settings.minSqFt.toLocaleString()} sq ft minimum.`,
    });
  } else if (size > settings.maxSqFt) {
    checks.push({
      key: "size",
      label: "Floor area",
      outcome: "warn",
      detail: `${size.toLocaleString()} sq ft exceeds the ${settings.maxSqFt.toLocaleString()} sq ft ceiling — larger scheme, extra scrutiny.`,
    });
  } else {
    checks.push({
      key: "size",
      label: "Floor area",
      outcome: "pass",
      detail: `${size.toLocaleString()} sq ft is within the ${settings.minSqFt.toLocaleString()}–${settings.maxSqFt.toLocaleString()} sq ft band.`,
    });
  }

  // 2. DCAS ──────────────────────────────────────────────────────────────────
  const d = dcasStats(p.dcas);
  if (!p.dcas || d.answered === 0) {
    checks.push({ key: "dcas", label: "DCAS screen", outcome: "na", detail: "DCAS not started." });
  } else {
    if (d.criticals > 0) {
      checks.push({
        key: "dcas",
        label: "DCAS screen",
        outcome: "fail",
        detail: `${d.criticals} criterion(s) rated Critical.`,
      });
    } else if (d.concerning > settings.maxConcerningForGo) {
      checks.push({
        key: "dcas",
        label: "DCAS screen",
        outcome: "warn",
        detail: `${d.concerning} Concerning ratings (tolerance ${settings.maxConcerningForGo}).`,
      });
    } else {
      checks.push({
        key: "dcas",
        label: "DCAS screen",
        outcome: "pass",
        detail: `No Critical ratings; ${d.concerning} Concerning. Avg score ${d.avgRating.toFixed(1)}/5.`,
      });
    }
    // completeness as its own soft check
    if (d.completionPct < settings.minDcasCompletionPct) {
      checks.push({
        key: "dcas_complete",
        label: "DCAS completeness",
        outcome: "warn",
        detail: `${Math.round(d.completionPct * 100)}% answered (target ${Math.round(settings.minDcasCompletionPct * 100)}%).`,
      });
    } else {
      checks.push({
        key: "dcas_complete",
        label: "DCAS completeness",
        outcome: "pass",
        detail: `${Math.round(d.completionPct * 100)}% of criteria answered.`,
      });
    }
  }

  // 3. IPAD VIABILITY ─────────────────────────────────────────────────────────
  if (!p.ipad || p.ipad.inputs.units.length === 0) {
    checks.push({ key: "ipad", label: "IPAD viability", outcome: "na", detail: "IPAD appraisal not yet run." });
  } else {
    const out = computeIpad(p.ipad.inputs);
    if (out.gdv === 0) {
      checks.push({ key: "ipad", label: "IPAD viability", outcome: "na", detail: "No GDV entered in IPAD." });
    } else if (out.profitOnGdvPct >= settings.targetProfitOnGdvPct) {
      checks.push({
        key: "ipad",
        label: "IPAD viability",
        outcome: "pass",
        detail: `${pct(out.profitOnGdvPct)} profit on GDV (target ${pct(settings.targetProfitOnGdvPct)}). Net ${GBP.format(out.netProfit)}.`,
      });
    } else if (out.profitOnGdvPct >= settings.reviewProfitOnGdvPct) {
      checks.push({
        key: "ipad",
        label: "IPAD viability",
        outcome: "warn",
        detail: `${pct(out.profitOnGdvPct)} profit on GDV — below ${pct(settings.targetProfitOnGdvPct)} target but above ${pct(settings.reviewProfitOnGdvPct)} floor.`,
      });
    } else {
      checks.push({
        key: "ipad",
        label: "IPAD viability",
        outcome: "fail",
        detail: `${pct(out.profitOnGdvPct)} profit on GDV — below the ${pct(settings.reviewProfitOnGdvPct)} floor. Net ${GBP.format(out.netProfit)}.`,
      });
    }
  }

  // 4. MAC DEMAND (soft) ──────────────────────────────────────────────────────
  const macSegs = p.mac?.segments ?? [];
  const segWithData = macSegs.find((s) => s.comps.some((c) => c.property.trim() !== ""));
  if (!segWithData) {
    checks.push({ key: "mac", label: "MAC demand", outcome: "na", detail: "No comparable evidence captured." });
  } else {
    const stats = segmentStats(segWithData, p.mac?.date ?? "");
    if (stats.salesRatio >= 0.5) {
      checks.push({
        key: "mac",
        label: "MAC demand",
        outcome: "pass",
        detail: `Sales ratio ${pct(stats.salesRatio)} across ${stats.totalProperties} comps — healthy absorption.`,
      });
    } else {
      checks.push({
        key: "mac",
        label: "MAC demand",
        outcome: "warn",
        detail: `Sales ratio ${pct(stats.salesRatio)} — soft local absorption, verify demand.`,
      });
    }
  }

  // ── Roll-up ────────────────────────────────────────────────────────────────
  const hard = checks.filter((c) => c.key === "size" || c.key === "dcas" || c.key === "ipad");
  const anyFail = checks.some((c) => c.outcome === "fail");
  const anyWarn = checks.some((c) => c.outcome === "warn");
  const startedStages = [p.dcas?.sections?.length && dcasStats(p.dcas).answered > 0, !!p.ipad?.inputs.units.length].filter(Boolean).length;

  let status: ProcedabilityResult["status"];
  let headline: string;
  if (anyFail) {
    status = "not-proceedable";
    headline = "Does not stack on current criteria.";
  } else if (startedStages === 0 && size == null) {
    status = "incomplete";
    headline = "Not enough captured to judge.";
  } else if (anyWarn || hard.some((c) => c.outcome === "na")) {
    status = "review";
    headline = "Promising but needs review / more data.";
  } else {
    status = "proceedable";
    headline = "Clears the criteria — proceedable.";
  }

  // convenience 0–100 score
  const scored = checks.filter((c) => c.outcome !== "na");
  const weight = (o: ProcedabilityCheck["outcome"]) => (o === "pass" ? 1 : o === "warn" ? 0.5 : 0);
  const score = scored.length ? Math.round((scored.reduce((a, c) => a + weight(c.outcome), 0) / scored.length) * 100) : 0;

  return { status, score, checks, headline };
}

export function statusMeta(status: ProcedabilityResult["status"]) {
  switch (status) {
    case "proceedable":
      return { label: "Proceedable", color: "#2E7D5B", token: "go" as const };
    case "review":
      return { label: "Review", color: "#C2872B", token: "review" as const };
    case "not-proceedable":
      return { label: "Not Proceedable", color: "#B23A48", token: "stop" as const };
    default:
      return { label: "Incomplete", color: "#8A8F94", token: "idle" as const };
  }
}
