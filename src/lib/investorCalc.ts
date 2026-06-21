import type { InvestorTerms } from "./types";

export function defaultInvestorTerms(partial?: Partial<InvestorTerms>): InvestorTerms {
  return {
    investmentSought: null,
    minInvestment: null,
    termMonths: null,
    interestRatePct: null,
    profitSharePct: null,
    targetRoiPct: null,
    security: "",
    highlights: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    ...partial,
  };
}

export interface InvestorOutputs {
  principal: number;
  termMonths: number;
  interest: number; // from fixed rate over the term
  profitShare: number; // share of net project profit
  roiReturn: number; // from an explicit target ROI
  totalReturn: number; // headline investor profit
  endValue: number; // principal + totalReturn
  roiPct: number; // totalReturn / principal
  annualisedPct: number; // roiPct annualised over the term
}

/**
 * Compute investor return figures. `netProfit` is the project's net profit
 * (from the IPAD) used for the profit-share calculation.
 */
export function computeInvestor(terms: InvestorTerms, netProfit = 0): InvestorOutputs {
  const principal = terms.investmentSought ?? 0;
  const termMonths = terms.termMonths ?? 0;

  const interest = terms.interestRatePct && termMonths ? principal * terms.interestRatePct * (termMonths / 12) : 0;
  const profitShare = terms.profitSharePct ? Math.max(netProfit, 0) * terms.profitSharePct : 0;
  const roiReturn = terms.targetRoiPct ? principal * terms.targetRoiPct : 0;

  // An explicit target ROI takes precedence; otherwise sum the rate + profit share.
  const totalReturn = terms.targetRoiPct ? roiReturn : interest + profitShare;
  const endValue = principal + totalReturn;
  const roiPct = principal ? totalReturn / principal : 0;
  const annualisedPct = principal && termMonths ? roiPct / (termMonths / 12) : 0;

  return { principal, termMonths, interest, profitShare, roiReturn, totalReturn, endValue, roiPct, annualisedPct };
}
