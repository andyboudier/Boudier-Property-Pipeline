// ──────────────────────────────────────────────────────────────────────────
// Domain model — Boudier Property Site Appraisal
// One Firestore document per property holds the pipeline data plus the three
// nested assessments (DCAS → MAC → IPAD). Kept in a single doc for atomic reads.
// ──────────────────────────────────────────────────────────────────────────

export type RatingValue = 1 | 2 | 3 | 4 | 5 | null; // null === "Unknown"

export interface DcasItem {
  id: string;
  label: string;
  rating: RatingValue;
  note?: string;
}

export interface DcasSection {
  key: string;
  title: string;
  items: DcasItem[];
}

export interface Dcas {
  opportunity: string;
  description: string;
  date: string; // ISO yyyy-mm-dd
  sections: DcasSection[];
  overallComments: string;
  updatedAt?: string;
}

// ── MAC ────────────────────────────────────────────────────────────────────
export interface MacComp {
  id: string;
  property: string;
  area: string;
  askingPrice: number | null;
  beds: number | null;
  propertyType: string;
  condition: string;
  kerbAppeal: string;
  proximity: string;
  similarity: string;
  totalM2: number | null;
  m2Source: string;
  agent: string;
  onMarketSince: string; // ISO date
  status: string; // For Sale / Sold / Under Offer ...
  comments: string;
  link: string;
}

export interface MacSegment {
  key: string; // e.g. "1-bed"
  label: string; // "1 Bed Flats"
  searchArea: string;
  radius: string;
  minPrice: number | null;
  maxPrice: number | null;
  minBeds: number | null;
  maxBeds: number | null;
  propertyTypeFilter: string;
  totalIncSstc: number | null; // H11 — total properties (inc Sold STC)
  totalExcSstc: number | null; // H12 — unsold (exc Sold STC)
  comps: MacComp[];
}

export interface Mac {
  projectName: string;
  description: string;
  date: string;
  segments: MacSegment[];
  updatedAt?: string;
}

// ── IPAD ───────────────────────────────────────────────────────────────────
export interface IpadUnit {
  id: string;
  units: number; // No. units on this line
  m2: number; // size per unit
  type: string; // unit type label
  totalGdv: number; // total sale value for the line
}

export interface IpadInputs {
  areaM2: number;
  refTimescaleMonths: number;

  // Purchase costs & fees
  purchasePrice: number;
  solicitors: number;
  stampDuty: number;
  findersFee: number;
  managementFee: number;

  // Construction — direct cost inputs
  demolition: number;
  asbestos: number;
  commercialRatePerM2: number;
  industrialRatePerM2: number;
  newBuildRatePerM2: number;
  landscaping: number;
  otherCosts: number;
  contingencyPct: number; // of (commercial+industrial+newbuild+landscaping+other)
  utilities: number;
  accountancy: number;
  vatOnCosts: number;

  // Construction — % of construction base (G35:G43)
  devMgmtPct: number;
  planningPct: number;
  architect1Pct: number;
  architect2Pct: number;
  structuralPct: number;
  contractAdminPct: number;
  cdmPct: number;
  partyWall: number;
  saps: number;
  emptyRates: number;
  buildingWarranty: number;
  cil106: number;
  buildingControl: number;

  // Finance — purchase
  privateFinance: number;
  privateFinanceMonths: number;
  privateFinanceRatePerMonth: number;
  commBridgeMonths: number;
  commBridgeRatePerMonth: number;
  commBrokerPct: number;
  commAdminPct: number;
  commValuation: number;
  commExitPct: number;

  // Finance — development
  devBridgeMonths: number;
  devBridgeRatePerMonth: number;
  devBrokerPct: number;
  devAdminPct: number;
  devValuation: number;
  devExitPct: number;

  // Disposal
  agentSellingPct: number; // of GDV

  units: IpadUnit[];
  valuationReport: string;

  // Appraisal metadata
  description: string;
  appraisalDate: string; // ISO yyyy-mm-dd — defaults to today on a fresh IPAD

  // Per-fee absolute (£) overrides keyed by the percentage field name. When a
  // key is present, computeIpad uses the fixed £ amount instead of the % calc.
  overrides?: Record<string, number>;
}

export interface Ipad {
  inputs: IpadInputs;
  updatedAt?: string;
}

// ── Investor terms (drives the investor presentation) ────────────────────────
export interface InvestorTerms {
  investmentSought: number | null; // total raise (£)
  minInvestment: number | null; // minimum ticket (£)
  termMonths: number | null; // investment term
  interestRatePct: number | null; // fixed rate p.a. (decimal, e.g. 0.10)
  profitSharePct: number | null; // share of net profit (decimal)
  targetRoiPct: number | null; // total ROI over term (decimal)
  security: string; // e.g. "First legal charge"
  highlights: string; // free-text selling points (one per line)
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  updatedAt?: string;
}

// ── Procedability ──────────────────────────────────────────────────────────
export type ProcedabilityStatus =
  | "proceedable"
  | "review"
  | "not-proceedable"
  | "sold"
  | "incomplete";

export interface ProcedabilityCheck {
  key: string;
  label: string;
  outcome: "pass" | "warn" | "fail" | "na";
  detail: string;
}

export interface ProcedabilityResult {
  status: ProcedabilityStatus;
  score: number; // 0–100 convenience score
  checks: ProcedabilityCheck[];
  headline: string;
}

// ── Property (top-level doc) ─────────────────────────────────────────────────
export interface Property {
  id: string;
  // Pipeline-sourced (also auto-populates DCAS / IPAD)
  name: string; // Site / Address
  town: string;
  lpa: string;
  guidePrice: number | null;
  sizeSqFt: number | null;
  pricePerSqFt: number | null;
  currentUse: string;
  heritage: string;
  pdRoute: string;
  fullPlanningRoute: string;
  keyConstraints: string;
  planningPrinciple: string;
  likelyOutcome: string;
  priorityNextStep: string;
  listingSource?: string;
  listingUrl?: string;
  notes?: string; // free-text — e.g. listing description/features captured on import
  documentsUrl?: string; // link to this site's OneDrive documents folder
  imageUrl?: string; // hero image (e.g. from the listing) used on the investor cover
  marketStatus?: string; // "For Sale" | "Under Offer" | "Sold" | "Withdrawn" | "" (from the listing)
  alert?: MarketAlert; // raised when the listing's market status changes
  statusCheckedAt?: string; // last time the listing was re-checked for availability
  statusOverride?: ProcedabilityStatus | null; // manual pipeline status; null/undefined = auto

  dcas?: Dcas;
  mac?: Mac;
  ipad?: Ipad;
  investor?: InvestorTerms;

  createdAt?: string;
  updatedAt?: string;
}

// A point-in-time copy of a property, captured before deletion so it can be
// restored from the recovery (recycle bin) view.
export interface PropertySnapshot {
  id: string;
  propertyId: string;
  name: string;
  reason: string; // e.g. "delete"
  takenAt: string; // ISO timestamp
  data: Omit<Property, "id">;
}

// A potential property in the pre-pipeline ("prospects"), scraped/AI-extracted
// from a listing before it's promoted to a full pipeline Property.
export interface Lead {
  id: string;
  status: "new" | "reviewing" | "promoted" | "rejected";
  source: string; // Rightmove / Zoopla / agent / Web
  url: string;
  name: string;
  town: string;
  guidePrice: number | null;
  sizeSqFt: number | null;
  pricePerSqFt: number | null;
  currentUse: string;
  notes: string;
  imageUrl: string;
  promotedPropertyId?: string;
  marketStatus?: string; // "For Sale" | "Under Offer" | "Sold" | "Withdrawn" | "" (from the listing)
  alert?: MarketAlert; // raised when the market status changes (sold / back on market)
  statusCheckedAt?: string; // last time the listing's market status was re-checked
  createdAt: string;
  updatedAt?: string;
}

// A flag raised when a listing we're tracking changes availability.
export type MarketAlert = "sold" | "back-on-market" | null;

// Editable filter applied to auto-monitored listings before they become prospects.
export interface MonitorCriteria {
  propertyTypes: string[]; // e.g. Office, Retail, Mixed Use, Light Industrial
  maxSqFt: number | null; // upper size limit in ft²
  maxPrice: number | null; // upper guide price in £
  includeIfNoPrice: boolean; // keep listings with no price quoted
  areas: string[]; // counties / towns / postcode areas to include
  excludeKeywords: string[]; // reject if any of these appear in the listing text
}

// An agent search/results page to scan periodically for new listings.
export interface WatchSource {
  id: string;
  label: string;
  url: string;
  createdAt: string;
  lastScanAt?: string;
  lastResult?: WatchResult; // outcome of the most recent scan of this source
}

// What the last scan of a single watched source produced.
export interface WatchResult {
  scannedAt: string;
  reachable: boolean; // false when the page couldn't be read
  found: number; // listing links seen on the page
  fresh: number; // of those, not already held/ignored
  added: number; // prospects created from this source this run
  skipped: number; // examined but filtered out by criteria
  samples: { name: string; url: string; ok: boolean; reasons: string[] }[]; // listings examined this run
}

export interface ProcedabilitySettings {
  minSqFt: number;
  maxSqFt: number;
  targetProfitOnGdvPct: number; // e.g. 0.18
  reviewProfitOnGdvPct: number; // below target but above this → review
  maxConcerningForGo: number; // count of "Concerning" tolerated for a clean GO
  minDcasCompletionPct: number; // % of DCAS answered before a verdict is trusted
}
