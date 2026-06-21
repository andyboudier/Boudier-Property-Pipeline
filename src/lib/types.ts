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

// ── Procedability ──────────────────────────────────────────────────────────
export type ProcedabilityStatus =
  | "proceedable"
  | "review"
  | "not-proceedable"
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

  dcas?: Dcas;
  mac?: Mac;
  ipad?: Ipad;

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

// A registered WebAuthn passkey (e.g. Touch ID on a Mac) used to unlock the app.
export interface PasskeyRecord {
  id: string; // credential ID (base64url)
  publicKey: string; // base64url-encoded public key
  counter: number;
  transports?: string[];
  label: string; // friendly device name
  createdAt: string;
}

export interface ProcedabilitySettings {
  minSqFt: number;
  maxSqFt: number;
  targetProfitOnGdvPct: number; // e.g. 0.18
  reviewProfitOnGdvPct: number; // below target but above this → review
  maxConcerningForGo: number; // count of "Concerning" tolerated for a clean GO
  minDcasCompletionPct: number; // % of DCAS answered before a verdict is trusted
}
