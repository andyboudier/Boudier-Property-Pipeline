import type { Mac, MacComp, MacSegment, MacSearchParams } from "./types";

export const MAC_RADIUS_OPTIONS = ["Exact Area Only", "Within 1/4 mile", "Within 1/2 mile", "Within 1 mile", "Within 3 miles", "Within 5 miles"];
export const MAC_PROPERTY_TYPES = ["Flats/Apartments", "Houses", "Bungalows", "Land", "Commercial Property", "Other", "Any"];

export const DEFAULT_SEARCH: MacSearchParams = {
  searchArea: "",
  radius: "Exact Area Only",
  minPrice: null,
  maxPrice: null,
  totalIncSstc: null,
  totalExcSstc: null,
  minBeds: 2,
  maxBeds: 2,
  propertyType: "Flats/Apartments",
  filters: { garden: false, parking: false, newHome: false, retirementHomes: true, shared: true, auction: false },
};

// Dropdown options sourced from the MAC "Drivers" sheet.
export const MAC_OPTIONS = {
  propertyType: [
    "Flat (purpose-built)",
    "Flat (conversion)",
    "Terraced House",
    "Semi-detached House",
    "Detached House",
    "Detached Bungalow",
    "Attached Bungalow",
    "Maisonette",
    "Duplex",
  ],
  condition: ["Excellent", "Good", "Average", "Poor", "Very Poor"],
  kerbAppeal: ["Excellent", "Good", "Average", "Poor", "Very Poor"],
  proximity: [
    "Same street",
    "Connected street",
    "Within 1/4 mile",
    "Within 1/2 mile",
    "Within 1 mile",
    "Outside 1 mile",
  ],
  similarity: ["Very similar", "Similar", "Some similarities", "Not many similarities", "Not alike"],
  m2Source: ["Agent", "EPC", "Other"],
  status: ["For Sale", "Sold", "Under Offer", "To rent", "Leased"],
};

export const SOLD_STATUSES = ["Sold", "Under Offer"];

export function emptyComp(id: string): MacComp {
  return {
    id,
    property: "",
    area: "",
    askingPrice: null,
    beds: null,
    propertyType: "",
    condition: "",
    kerbAppeal: "",
    proximity: "",
    similarity: "",
    totalM2: null,
    m2Source: "",
    agent: "",
    onMarketSince: "",
    status: "",
    comments: "",
    link: "",
  };
}

export function emptySegment(key: string, label: string, minBeds: number | null, maxBeds: number | null): MacSegment {
  return {
    key,
    label,
    searchArea: "",
    radius: "Exact Area Only",
    minPrice: null,
    maxPrice: null,
    minBeds,
    maxBeds,
    propertyTypeFilter: "Flats/Apartments",
    totalIncSstc: null,
    totalExcSstc: null,
    comps: [emptyComp(`${key}-1`)],
  };
}

export function emptyMac(projectName = "", description = ""): Mac {
  return {
    projectName,
    description,
    date: new Date().toISOString().slice(0, 10),
    search: { ...DEFAULT_SEARCH, filters: { ...DEFAULT_SEARCH.filters } },
    segments: [emptySegment("1-bed", "1 Bed Flats", 1, 1), emptySegment("2-bed", "2 Bed Flats", 2, 2)],
  };
}

export interface SegmentStats {
  count: number;
  averageM2: number;
  largestM2: number;
  smallestM2: number;
  avgPricePerM2: number;
  avgAskingPrice: number;
  avgDaysOnMarket: number;
  totalProperties: number;
  unsold: number;
  salesRatio: number;
}

function daysOnMarket(comp: MacComp, refDate: string): number | null {
  if (!comp.onMarketSince) return null;
  const start = new Date(comp.onMarketSince).getTime();
  const ref = refDate ? new Date(refDate).getTime() : Date.now();
  if (isNaN(start)) return null;
  return Math.max(0, Math.round((ref - start) / 86_400_000));
}

export function pricePerM2(comp: MacComp): number | null {
  if (!comp.askingPrice || !comp.totalM2) return null;
  return comp.askingPrice / comp.totalM2;
}

function avg(nums: number[]): number {
  const v = nums.filter((n) => typeof n === "number" && !isNaN(n));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
}

export function segmentStats(seg: MacSegment, refDate: string): SegmentStats {
  const filled = seg.comps.filter((c) => c.property.trim() !== "");
  const m2s = filled.map((c) => c.totalM2).filter((n): n is number => typeof n === "number" && n > 0);
  const ppm2 = filled.map(pricePerM2).filter((n): n is number => n !== null);
  const prices = filled.map((c) => c.askingPrice).filter((n): n is number => typeof n === "number");
  const doms = filled.map((c) => daysOnMarket(c, refDate)).filter((n): n is number => n !== null);

  const totalProperties = seg.totalIncSstc ?? filled.length;
  const unsold = seg.totalExcSstc ?? filled.filter((c) => !SOLD_STATUSES.includes(c.status)).length;
  const salesRatio = totalProperties > 0 ? (totalProperties - unsold) / totalProperties : 0;

  return {
    count: filled.length,
    averageM2: avg(m2s),
    largestM2: m2s.length ? Math.max(...m2s) : 0,
    smallestM2: m2s.length ? Math.min(...m2s) : 0,
    avgPricePerM2: avg(ppm2),
    avgAskingPrice: avg(prices),
    avgDaysOnMarket: avg(doms),
    totalProperties,
    unsold,
    salesRatio,
  };
}

export { daysOnMarket };

// ── Report summary (mirrors the Excel "Summary" sheet) ───────────────────────
export interface MacProfileRow {
  label: string;
  total: number;
  unsold: number;
  salesRatio: number; // 1 - unsold/total
  pctOfAll: number; // total / all-total
}
export interface MacSummaryData {
  projectName: string;
  date: string;
  segments: { label: string; stats: SegmentStats }[];
  byType: { rows: MacProfileRow[]; flats: MacProfileRow; houses: MacProfileRow; all: MacProfileRow };
  byBeds: { rows: MacProfileRow[]; all: MacProfileRow };
}

const FLAT_TYPES = ["Flat (purpose-built)", "Flat (conversion)", "Maisonette", "Duplex"];
const BUNGALOW_TYPES = ["Detached Bungalow", "Attached Bungalow"];
const TYPE_ROWS = ["Studio", "1-bed Flat", "2-bed Flat", "3-bed Flat", "Bungalow", "Terraced", "Semi", "Detached"];
const BED_ROWS = ["1-bed", "2-bed", "3-bed", "4-bed", "5-bed", "6+-bed"];

function typeBucket(c: MacComp): string | null {
  const t = c.propertyType;
  if (FLAT_TYPES.includes(t)) {
    if (c.beds === 0) return "Studio";
    if (c.beds === 1) return "1-bed Flat";
    if (c.beds === 2) return "2-bed Flat";
    if (typeof c.beds === "number" && c.beds >= 3) return "3-bed Flat";
    return null; // flat with unknown beds — can't place
  }
  if (BUNGALOW_TYPES.includes(t)) return "Bungalow";
  if (t === "Terraced House") return "Terraced";
  if (t === "Semi-detached House") return "Semi";
  if (t === "Detached House") return "Detached";
  return null;
}
function bedBucket(c: MacComp): string | null {
  if (typeof c.beds !== "number" || c.beds < 1) return null;
  if (c.beds >= 6) return "6+-bed";
  return `${c.beds}-bed`;
}

function profileRow(label: string, comps: MacComp[], allTotal: number): MacProfileRow {
  const total = comps.length;
  const unsold = comps.filter((c) => !SOLD_STATUSES.includes(c.status)).length;
  return {
    label,
    total,
    unsold,
    salesRatio: total > 0 ? (total - unsold) / total : 0,
    pctOfAll: allTotal > 0 ? total / allTotal : 0,
  };
}

export function macSummary(mac: Mac): MacSummaryData {
  const allComps = mac.segments.flatMap((s) => s.comps.filter((c) => c.property.trim() !== ""));

  // Profile by property type
  const typeOf = new Map<string, MacComp[]>(TYPE_ROWS.map((r) => [r, []]));
  for (const c of allComps) {
    const b = typeBucket(c);
    if (b) typeOf.get(b)!.push(c);
  }
  const typeTotal = TYPE_ROWS.reduce((n, r) => n + typeOf.get(r)!.length, 0);
  const typeRows = TYPE_ROWS.map((r) => profileRow(r, typeOf.get(r)!, typeTotal));
  const flatsComps = TYPE_ROWS.slice(0, 4).flatMap((r) => typeOf.get(r)!);
  const housesComps = TYPE_ROWS.slice(4).flatMap((r) => typeOf.get(r)!);

  // Profile by number of bedrooms
  const bedOf = new Map<string, MacComp[]>(BED_ROWS.map((r) => [r, []]));
  for (const c of allComps) {
    const b = bedBucket(c);
    if (b) bedOf.get(b)!.push(c);
  }
  const bedTotal = BED_ROWS.reduce((n, r) => n + bedOf.get(r)!.length, 0);
  const bedRows = BED_ROWS.map((r) => profileRow(r, bedOf.get(r)!, bedTotal));

  return {
    projectName: mac.projectName,
    date: mac.date,
    segments: mac.segments.map((s) => ({ label: s.label, stats: segmentStats(s, mac.date) })),
    byType: {
      rows: typeRows,
      flats: profileRow("Flats", flatsComps, typeTotal),
      houses: profileRow("Houses", housesComps, typeTotal),
      all: profileRow("All", [...flatsComps, ...housesComps], typeTotal),
    },
    byBeds: {
      rows: bedRows,
      all: profileRow("All", BED_ROWS.flatMap((r) => bedOf.get(r)!), bedTotal),
    },
  };
}
