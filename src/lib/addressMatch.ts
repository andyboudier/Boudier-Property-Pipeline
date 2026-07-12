// Cross-source address matching, so a property already held (in the pipeline or
// as an existing prospect) is not re-added when a different source — a portal
// listing, or a Companies House charge — turns up the same place under a
// different URL. The reliable shared signal is the address itself: postcode +
// house number / building name.

const POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;

// Words that don't identify a specific building — skipped when picking a name
// token so we don't match two different sites that merely share "road" or
// "land" on the same postcode.
const STOP = new Set([
  "the", "of", "and", "at", "on", "to", "in", "a", "part", "all", "that", "known", "as",
  "freehold", "leasehold", "interest", "legal", "mortgage", "charge", "being", "situate",
  "land", "property", "properties", "buildings", "building", "site", "plot", "flat", "unit",
  "apartment", "apartments", "room", "floor", "ground", "first", "second",
  "road", "street", "lane", "avenue", "close", "drive", "way", "court", "place", "terrace",
  "crescent", "grove", "gardens", "hill", "walk", "square", "row", "rise", "green", "park",
  "north", "south", "east", "west", "upper", "lower",
]);

/** Normalise free text to lowercase alphanumeric tokens. */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Compact keys identifying a property. Two addresses refer to the same place
 * when they share any key: postcode+house-number, or postcode+building-name. */
export function addressKeys(text: string): string[] {
  if (!text) return [];
  const pc = text.match(POSTCODE);
  if (!pc) return []; // no postcode → can't match reliably, treat as unique
  const postcode = `${pc[1]}${pc[2]}`.toLowerCase().replace(/\s/g, "");
  const withoutPc = text.replace(POSTCODE, " ");
  const tokens = tokenize(withoutPc);

  const keys: string[] = [];
  // House number: first standalone number (optionally with a letter, e.g. 3a),
  // ignoring ranges by taking the first.
  const num = tokens.find((t) => /^\d+[a-z]?$/.test(t));
  if (num) keys.push(`${postcode}#${num}`);
  // Building / road name: first meaningful word.
  const name = tokens.find((t) => t.length > 1 && !/^\d/.test(t) && !STOP.has(t));
  if (name) keys.push(`${postcode}~${name}`);
  // Fallback so a bare-postcode address still keys on the postcode alone.
  if (keys.length === 0) keys.push(`${postcode}`);
  return keys;
}

/** True if `text` matches any address already represented in `known`. */
export function matchesKnownAddress(text: string, known: Set<string>): boolean {
  return addressKeys(text).some((k) => known.has(k));
}

/** Build the lookup set from a list of address strings. */
export function buildAddressKeySet(addresses: (string | undefined | null)[]): Set<string> {
  const set = new Set<string>();
  for (const a of addresses) {
    if (!a) continue;
    for (const k of addressKeys(a)) set.add(k);
  }
  return set;
}
