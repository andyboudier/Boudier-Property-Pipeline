import type { MonitorCriteria } from "./types";

export const DEFAULT_CRITERIA: MonitorCriteria = {
  propertyTypes: ["Office", "Retail", "Mixed Use", "Light Industrial"],
  maxSqFt: 6458, // ≈ 600 m²
  maxPrice: 1500000,
  includeIfNoPrice: true,
  areas: ["Berkshire", "Hampshire", "Wiltshire", "Surrey", "Oxfordshire"],
  excludeKeywords: ["industrial estate", "business park", "tenants", "fri basis"],
};

export const PROPERTY_TYPE_OPTIONS = [
  "Office",
  "Retail",
  "Mixed Use",
  "Light Industrial",
  "Industrial / Warehouse",
  "Leisure",
  "Restaurant / Cafe",
  "Land / Development",
  "Other",
];

// Rough county → postcode-area prefixes, so a listing's postcode/town can imply
// the county even when the county name isn't written out.
const COUNTY_OUTCODES: Record<string, string[]> = {
  berkshire: ["RG", "SL"],
  hampshire: ["SO", "PO", "GU", "SP", "RG2"],
  wiltshire: ["SN", "SP", "BA"],
  surrey: ["GU", "KT", "RH", "CR", "SM", "TW"],
  oxfordshire: ["OX"],
};

const TYPE_KEYWORDS: Record<string, RegExp> = {
  office: /\boffices?\b/i,
  retail: /\b(retail|shops?|store|high street|a1\b)/i,
  "mixed use": /\bmixed[ -]?use\b/i,
  "light industrial": /\b(light industrial|industrial unit|workshop|trade counter|business unit)\b/i,
  "industrial / warehouse": /\b(industrial|warehouse|trade counter|storage)\b/i,
  leisure: /\bleisure\b/i,
  "restaurant / cafe": /\b(restaurant|caf[eé]|takeaway|a3\b|food)\b/i,
  "land / development": /\b(land|development|plot|site)\b/i,
};

export interface CriteriaResult {
  include: boolean;
  reasons: string[]; // why it was excluded (empty when included)
}

export function matchesCriteria(
  f: { name?: string; town?: string; currentUse?: string; notes?: string; guidePrice?: number | null; sizeSqFt?: number | null },
  c: MonitorCriteria,
): CriteriaResult {
  const text = [f.name, f.town, f.currentUse, f.notes].filter(Boolean).join(" ").toLowerCase();
  const reasons: string[] = [];

  // Hard exclusions — any matching keyword rejects the listing outright.
  if (c.excludeKeywords?.length) {
    const hit = c.excludeKeywords.find((k) => k.trim() && text.includes(k.toLowerCase().trim()));
    if (hit) reasons.push(`excluded: "${hit}"`);
  }

  if (c.propertyTypes.length) {
    const matchesSelected = c.propertyTypes.some((t) => {
      const re = TYPE_KEYWORDS[t.toLowerCase()];
      return re ? re.test(text) : text.includes(t.toLowerCase());
    });
    // Only exclude on type when the listing clearly states a type we didn't pick.
    // If no type can be read at all, let it through for manual review rather than
    // silently dropping a possibly-good listing.
    if (!matchesSelected) {
      const anyTypeDetected = Object.values(TYPE_KEYWORDS).some((re) => re.test(text));
      if (anyTypeDetected) reasons.push("type");
    }
  }

  if (c.maxSqFt != null && f.sizeSqFt != null && f.sizeSqFt > c.maxSqFt) reasons.push("too large");

  if (c.maxPrice != null) {
    if (f.guidePrice != null) {
      if (f.guidePrice >= c.maxPrice) reasons.push("over budget");
    } else if (!c.includeIfNoPrice) {
      reasons.push("no price");
    }
  }

  if (c.areas.length) {
    const ok = c.areas.some((a) => {
      const key = a.toLowerCase().trim();
      if (!key) return false;
      if (text.includes(key)) return true;
      const outs = COUNTY_OUTCODES[key];
      return outs ? outs.some((o) => new RegExp(`\\b${o}\\d`, "i").test(text)) : false;
    });
    if (!ok) reasons.push("area");
  }

  return { include: reasons.length === 0, reasons };
}
