import { TYPE_KEYWORDS, COMMERCIAL_TYPE_KEYS } from "./monitorCriteria";

/** Which prospect area a listing belongs to. */
export type ProspectKind = "commercial" | "residential";

/**
 * Classify a listing from its text. Anything with a commercial use is
 * commercial — including genuinely mixed listings such as a shop with a flat
 * over, which are commercial opportunities that happen to contain residential.
 * Only listings that read as purely residential go to the residential area.
 */
export function classifyKind(
  f: { name?: string; town?: string; currentUse?: string; notes?: string } | string,
): ProspectKind {
  const raw = typeof f === "string" ? f : [f.name, f.town, f.currentUse, f.notes].filter(Boolean).join(" ");
  // "Oxford House", "Lindors Country House", "Express House" — commercial
  // property is full of buildings named House. Drop those before looking for a
  // dwelling, or every one of them reads as residential. A bare "House" (as in
  // a currentUse of "House, freehold") has no name in front and survives.
  const text = raw
    .replace(/\b[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?\s+House\b/g, (m) =>
      // ...unless the words in front describe a dwelling ("4 Bedroom Detached
      // House"), in which case it is exactly what we are looking for.
      /\b(bed|bedroom|detached|semi|terrace|terraced|end|mid|town|family|period|link)\b/i.test(m) ? m : " ",
    )
    .toLowerCase();
  const commercial = COMMERCIAL_TYPE_KEYS.some((k) => TYPE_KEYWORDS[k]?.test(text));
  if (commercial) return "commercial";
  return TYPE_KEYWORDS.residential.test(text) ? "residential" : "commercial";
}
