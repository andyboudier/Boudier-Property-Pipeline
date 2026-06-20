import type { Mac, MacComp, MacSegment } from "./types";

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
