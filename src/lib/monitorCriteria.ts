import type { MonitorCriteria } from "./types";

export const DEFAULT_CRITERIA: MonitorCriteria = {
  propertyTypes: ["Office", "Retail", "Mixed Use", "Light Industrial"],
  maxSqFt: 6458, // ≈ 600 m²
  maxPrice: 1500000,
  includeIfNoPrice: true,
  areas: ["Berkshire", "Hampshire", "Wiltshire", "Surrey", "Oxfordshire"],
  excludeKeywords: ["industrial estate", "business park", "tenants", "fri basis"],
  residentialOutcodes: [],
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
  "Residential",
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
  "east sussex": ["BN", "TN"],
  "west sussex": ["RH", "BN", "PO"],
  "brighton and hove": ["BN"],
  "brighton & hove": ["BN"],
  // Towns, so a listing naming the town still matches on postcode alone.
  swindon: ["SN"],
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
  residential: /\b(residential|houses?|bungalows?|flats?|apartments?|maisonettes?|cottages?|semi[- ]detached|terraced|\d+\s*bed(room)?s?)\b/i,
};

// Ordinary housing is not a development site. Residential listings are only
// admitted when they carry one of these signals — land, a site, something to
// convert, something derelict, a block, or consent already in place.
const DEV_SIGNAL =
  /\b(land|plots?|sites?|development|redevelopment|conversions?|convert(ed|ing)?|barns?|derelict|dilapidated|renovation|refurbishment|modernisation|planning (permission|granted|consent)|consented|auction|block of (flats|apartments)|hmo|investment)\b/i;

// The commercial types, so a residential-looking listing that is really a shop
// with a flat over it isn't judged by the residential rule.
const COMMERCIAL_TYPE_KEYS = [
  "office",
  "retail",
  "mixed use",
  "light industrial",
  "industrial / warehouse",
  "leisure",
  "restaurant / cafe",
];

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
  // Match on word boundaries so "mall" doesn't fire inside "small".
  if (c.excludeKeywords?.length) {
    const hit = c.excludeKeywords.find((k) => {
      const kk = k.trim().toLowerCase();
      if (!kk) return false;
      const esc = kk.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`(^|\\W)${esc}(\\W|$)`, "i").test(text);
    });
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

  // Residential is in scope only as development stock (see DEV_SIGNAL), and can
  // be confined to specific outcodes. Commercial is judged by `areas` alone.
  if (c.propertyTypes.some((t) => t.toLowerCase() === "residential")) {
    const looksResidential = TYPE_KEYWORDS.residential.test(text);
    const looksCommercial = COMMERCIAL_TYPE_KEYS.some((k) => TYPE_KEYWORDS[k]?.test(text));
    if (looksResidential && !looksCommercial) {
      if (!DEV_SIGNAL.test(text)) reasons.push("residential, not a development opportunity");
      const outs = (c.residentialOutcodes ?? []).map((o) => o.toUpperCase().replace(/\s+/g, "")).filter(Boolean);
      if (outs.length) {
        // (?!\d) so SN1 doesn't swallow SN11 and SN2 doesn't swallow SN25.
        const re = new RegExp(`\\b(${outs.join("|")})(?!\\d)`, "i");
        if (!re.test(text)) reasons.push(`residential outside ${outs.join("/")}`);
      }
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
    // Build the set of target postcode-area letters and free-text names.
    const targetOutcodes = new Set<string>();
    const targetNames: string[] = [];
    for (const a of c.areas) {
      const key = a.toLowerCase().trim();
      if (!key) continue;
      targetNames.push(key); // county/town/postcode typed directly
      const outs = COUNTY_OUTCODES[key];
      if (outs) outs.forEach((o) => targetOutcodes.add(o.replace(/\d+$/, "").toUpperCase()));
      else if (/^[a-z]{1,2}$/.test(key)) targetOutcodes.add(key.toUpperCase());
    }

    const nameHit = targetNames.some((n) => n && text.includes(n));
    const outcodeHit = targetOutcodes.size > 0 && new RegExp(`\\b(${[...targetOutcodes].join("|")})\\d`, "i").test(text);
    // Full postcodes present anywhere in the text (road refs like "M4" won't match).
    const fullPostcodeAreas = [...text.toUpperCase().matchAll(/\b([A-Z]{1,2})\d[A-Z\d]?\s*\d[A-Z]{2}\b/g)].map((m) => m[1]);
    const hasOutOfAreaPostcode = fullPostcodeAreas.length > 0 && fullPostcodeAreas.every((o) => !targetOutcodes.has(o));

    if (nameHit || outcodeHit) {
      // clearly in a target area — keep
    } else if (hasOutOfAreaPostcode) {
      reasons.push("area"); // a real postcode, and it's outside the target counties
    }
    // otherwise: no location signal → let it through for manual review
  }

  return { include: reasons.length === 0, reasons };
}
