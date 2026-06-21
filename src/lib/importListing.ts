import "server-only";

// ──────────────────────────────────────────────────────────────────────────
// Listing importer — best-effort ingestion of a property listing URL into the
// pipeline's Property fields. Rightmove is parsed from its embedded PAGE_MODEL;
// other sites fall back to schema.org JSON-LD and Open Graph meta tags. Sites
// behind bot protection (e.g. Zoopla / Cloudflare) cannot be fetched
// server-side — callers can pass pasted page source as `html` instead.
// ──────────────────────────────────────────────────────────────────────────

export interface ImportedDraft {
  name?: string;
  town?: string;
  guidePrice?: number | null;
  sizeSqFt?: number | null;
  pricePerSqFt?: number | null;
  currentUse?: string;
  listingSource?: string;
  listingUrl?: string;
  notes?: string;
  imageUrl?: string;
}

export interface ImportResult {
  ok: boolean;
  source: string; // Rightmove | Zoopla | Web | Unknown
  blocked: boolean; // true when the site refused the automated fetch
  warning?: string;
  fields: ImportedDraft;
}

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-GB,en;q=0.9",
};

function sourceFromUrl(url: string): string {
  try {
    const h = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    if (h.includes("rightmove")) return "Rightmove";
    if (h.includes("zoopla")) return "Zoopla";
    if (h.includes("onthemarket")) return "OnTheMarket";
    return h.split(".")[0].replace(/^\w/, (c) => c.toUpperCase());
  } catch {
    return "Web";
  }
}

function looksBlocked(html: string): boolean {
  const s = html.slice(0, 4000).toLowerCase();
  return (
    s.includes("just a moment") ||
    s.includes("pardon our interruption") ||
    s.includes("px-captcha") ||
    s.includes("access denied") ||
    s.includes("enable javascript and cookies to continue") ||
    s.includes("/cdn-cgi/challenge-platform")
  );
}

// ── value helpers ────────────────────────────────────────────────────────────
function parseMoney(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v) : null;
  if (typeof v !== "string") return null;
  // Prefer an explicit £-prefixed amount so we don't glue unrelated numbers
  // together (e.g. "52 bed for sale £7000000" must not become 527000000).
  const pound = v.match(/£\s?([\d,]+(?:\.\d+)?)/);
  let digits: string;
  if (pound) {
    digits = pound[1].replace(/,/g, "");
  } else {
    if (/poa|price on application|offers? in|guide/i.test(v) && !/\d/.test(v)) return null;
    digits = v.replace(/[^\d.]/g, "");
  }
  if (!digits) return null;
  const n = Math.round(parseFloat(digits));
  return Number.isFinite(n) && n > 0 ? n : null;
}

const POSTCODE_TOKEN = /^[A-Z]{1,2}\d[A-Z\d]?(\s*\d[A-Z]{2})?$/i;
const TRAILING_OUTCODE = /\s+[A-Z]{1,2}\d[A-Z\d]?(\s+\d[A-Z]{2})?$/i;

/** Best-effort town from a comma-separated UK address, dropping postcode tokens. */
function deriveTown(displayAddress: string | undefined): string {
  if (!displayAddress) return "";
  const parts = displayAddress
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !POSTCODE_TOKEN.test(s)); // drop standalone "BS9" / "BS9 1RD"
  if (!parts.length) return "";
  // strip a trailing outcode glued onto the town, e.g. "Reading RG2" -> "Reading"
  return parts[parts.length - 1].replace(TRAILING_OUTCODE, "").trim();
}

/** Strip a trailing " - Agent" / " | Site" suffix; reject ref-number-only titles. */
function cleanListingTitle(s: string | undefined): string {
  if (!s) return "";
  const first = s.split(/\s+[|–-]\s+/)[0].trim();
  if (!first || /^[\d\s]+$/.test(first)) return ""; // pure ref number / empty
  return first;
}

// ── Rightmove: materialise the normalised PAGE_MODEL array ────────────────────
function extractAssignedObject(html: string, names: string[]): unknown | null {
  for (const name of names) {
    const idx = html.indexOf(name);
    if (idx === -1) continue;
    const brace = html.indexOf("{", idx);
    if (brace === -1) continue;
    let depth = 0;
    for (let i = brace; i < html.length; i++) {
      const ch = html[i];
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(html.slice(brace, i + 1));
          } catch {
            break;
          }
        }
      }
    }
  }
  return null;
}

/** Resolve Rightmove's index-referenced flat array into a normal object tree. */
function materialiseFlat(arr: unknown[]): any {
  const cache = new Map<number, unknown>();
  const node = (i: unknown): unknown => {
    if (typeof i !== "number") return i;
    if (cache.has(i)) return cache.get(i);
    const v = arr[i];
    if (Array.isArray(v)) {
      const out: unknown[] = [];
      cache.set(i, out);
      for (const e of v) out.push(node(e));
      return out;
    }
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      cache.set(i, out);
      for (const [k, val] of Object.entries(v)) out[k] = node(val);
      return out;
    }
    cache.set(i, v);
    return v;
  };
  return node(0);
}

function parseRightmove(html: string): ImportedDraft | null {
  const obj = extractAssignedObject(html, ["window.__PAGE_MODEL", "window.PAGE_MODEL"]) as any;
  if (!obj) return null;

  let root: any = obj;
  if (!obj.propertyData) {
    const data = obj.data;
    if (typeof data === "string") {
      try {
        root = materialiseFlat(JSON.parse(data));
      } catch {
        return null;
      }
    } else if (Array.isArray(data)) {
      root = materialiseFlat(data);
    }
  }
  const pd = root?.propertyData;
  if (!pd || typeof pd !== "object") return null;

  const guidePrice = parseMoney(pd.prices?.primaryPrice);
  const sqftSizing = Array.isArray(pd.sizings) ? pd.sizings.find((s: any) => s?.unit === "sqft") : null;
  const sizeSqFt = sqftSizing?.minimumSize ? Math.round(sqftSizing.minimumSize) : null;
  const pricePerSqFt = guidePrice && sizeSqFt ? Math.round(guidePrice / sizeSqFt) : parseMoney(pd.prices?.pricePerSqFt);

  const useClasses: string[] = Array.isArray(pd.commercialUseClasses)
    ? pd.commercialUseClasses.map((c: any) => (typeof c === "string" ? c : c?.name)).filter(Boolean)
    : [];
  const currentUse = useClasses.length
    ? `Commercial — ${useClasses.join(", ")}`
    : pd.bedrooms != null || pd.propertySubType
      ? `Residential (C3) — ${[pd.bedrooms ? `${pd.bedrooms} bed` : null, pd.propertySubType].filter(Boolean).join(" ")}`
      : "";

  const desc = typeof pd.text?.description === "string" ? stripHtml(pd.text.description) : "";
  const features: string[] = Array.isArray(pd.keyFeatures) ? pd.keyFeatures.filter((f: any) => typeof f === "string") : [];
  const notes = buildNotes({
    type: pd.propertySubType,
    beds: pd.bedrooms,
    baths: pd.bathrooms,
    tenure: pd.tenure?.tenureType,
    features,
    description: desc,
  });

  const firstImage = Array.isArray(pd.images) ? pd.images[0] : undefined;
  const imageUrl = typeof firstImage === "string" ? firstImage : firstImage?.url || firstImage?.srcUrl || "";

  return {
    name: pd.address?.displayAddress || "",
    town: deriveTown(pd.address?.displayAddress),
    guidePrice,
    sizeSqFt,
    pricePerSqFt,
    currentUse,
    notes,
    imageUrl,
  };
}

// ── Generic: schema.org JSON-LD ──────────────────────────────────────────────
function parseJsonLd(html: string): ImportedDraft | null {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const candidates: any[] = [];
  for (const b of blocks) {
    try {
      const parsed = JSON.parse(b[1].trim());
      collectObjects(parsed, candidates);
    } catch {
      /* ignore malformed block */
    }
  }
  const WANT = /residence|apartment|house|product|offer|realestate|place|singlefamily/i;
  const node = candidates.find((o) => {
    const t = o?.["@type"];
    const types = Array.isArray(t) ? t.join(" ") : String(t ?? "");
    return WANT.test(types) && (o.name || o.offers || o.address);
  });
  if (!node) return null;

  const offers = Array.isArray(node.offers) ? node.offers[0] : node.offers;
  const guidePrice = parseMoney(offers?.price ?? offers?.priceSpecification?.price);
  const addr = node.address;
  const street = typeof addr === "object" ? addr?.streetAddress : typeof addr === "string" ? addr : "";
  const town = typeof addr === "object" ? addr?.addressLocality || addr?.addressRegion || "" : "";
  // node.name on many CMS-driven agent sites is the page title / listing ref —
  // clean it and fall back to the street address.
  const name = (typeof street === "string" && street) || cleanListingTitle(typeof node.name === "string" ? node.name : "");

  return {
    name,
    town: (typeof town === "string" && town) || deriveTown(name),
    guidePrice,
    notes: typeof node.description === "string" ? stripHtml(node.description).slice(0, 600) : "",
  };
}

// ── Generic: Open Graph / meta tags ──────────────────────────────────────────
function metaContent(html: string, key: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]+content=["']([^"']*)["']`,
    "i",
  );
  const m = html.match(re);
  return m ? decodeEntities(m[1]) : null;
}

function parseMeta(html: string): ImportedDraft {
  const title = metaContent(html, "og:title");
  const desc = metaContent(html, "og:description") || metaContent(html, "description");
  const name = cleanListingTitle(title || "");
  return {
    name,
    town: deriveTown(name),
    guidePrice: parseMoney(desc || ""),
    notes: desc ? stripHtml(desc).slice(0, 600) : "",
    imageUrl: metaContent(html, "og:image") || "",
  };
}

// ── shared text utils ────────────────────────────────────────────────────────
function collectObjects(node: any, out: any[]) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((n) => collectObjects(n, out));
    return;
  }
  if (node["@graph"]) collectObjects(node["@graph"], out);
  out.push(node);
  for (const v of Object.values(node)) if (v && typeof v === "object") collectObjects(v, out);
}

function stripHtml(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&rsquo;/g, "'")
    .replace(/&pound;/g, "£")
    .replace(/&#163;/g, "£")
    .replace(/&nbsp;/g, " ");
}

function buildNotes(o: {
  type?: string;
  beds?: number | null;
  baths?: number | null;
  tenure?: string;
  features?: string[];
  description?: string;
}): string {
  const head: string[] = [];
  if (o.type) head.push(o.type);
  if (o.beds != null) head.push(`${o.beds} bed`);
  if (o.baths != null) head.push(`${o.baths} bath`);
  if (o.tenure) head.push(titleCase(o.tenure));
  const lines: string[] = [];
  if (head.length) lines.push(head.join(" · "));
  if (o.features?.length) lines.push("Features: " + o.features.join("; "));
  if (o.description) lines.push("", o.description.slice(0, 800));
  return lines.join("\n").trim();
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function mergeDrafts(...drafts: (ImportedDraft | null)[]): ImportedDraft {
  const out: ImportedDraft = {};
  for (const d of drafts) {
    if (!d) continue;
    for (const [k, v] of Object.entries(d)) {
      const cur = (out as any)[k];
      const empty = cur === undefined || cur === null || cur === "";
      if (empty && v !== undefined && v !== null && v !== "") (out as any)[k] = v;
    }
  }
  return out;
}

// ── PDF particulars ──────────────────────────────────────────────────────────
async function extractPdfText(buf: ArrayBuffer): Promise<string> {
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join(" ") : text || "";
  } catch {
    return "";
  }
}

function titleWords(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function pdfSize(t: string): number | null {
  const toInt = (s: string) => parseInt(s.replace(/,/g, ""), 10);
  // prefer an explicit "A – B sq ft" range (take the larger / total)
  const range = t.match(/([\d,]+)\s*[–-]\s*([\d,]+)\s*sq\.?\s*ft/i);
  if (range) return Math.max(toInt(range[1]), toInt(range[2]));
  const total = t.match(/total\s+([\d,]+)/i);
  if (total) return toInt(total[1]);
  const size = t.match(/size:?\s*([\d,]+)\s*sq\.?\s*ft/i);
  if (size) return toInt(size[1]);
  const first = t.slice(0, 400).match(/([\d,]+)\s*sq\.?\s*ft/i);
  return first ? toInt(first[1]) : null;
}

// A rent UNIT immediately after an amount (per annum / psf / pcm …). Deliberately
// excludes the bare word "rent" so a following figure's label isn't mistaken for
// this amount's unit.
const RENT_UNIT = /\b(per annum|p\.?\s?a\.?\b|pax|per sq\.?\s*ft|psf|per month|pcm|per sq\.?\s*m|per week|pw)\b/i;
const PRICE_CTX = /\b(price|guide|asking|offers?|for sale|premium|freehold|leasehold for sale)\b/i;

/** Pick the sale/guide price from particulars, never a rent or £/sq ft figure. */
function pdfPrice(t: string): number | null {
  const labelled: number[] = [];
  const otherNonRent: number[] = [];
  for (const m of t.matchAll(/£\s?[\d,]+(?:\.\d+)?/gi)) {
    const idx = m.index ?? 0;
    const before = t.slice(Math.max(0, idx - 32), idx); // wide: price context
    const beforeNear = t.slice(Math.max(0, idx - 10), idx); // narrow: this amount's own label
    const after = t.slice(idx + m[0].length, idx + m[0].length + 14);
    const val = parseMoney(m[0]);
    if (val == null) continue;
    if (RENT_UNIT.test(after) || /\brent(al)?\b/i.test(beforeNear)) continue; // a rent / unit rate
    if (PRICE_CTX.test(before)) labelled.push(val);
    else otherNonRent.push(val);
  }
  if (labelled.length) return labelled[0];
  // only fall back to an unlabelled amount if there's a single unambiguous,
  // sale-sized figure — otherwise leave blank rather than guess wrong.
  const big = otherNonRent.filter((n) => n >= 10000);
  return big.length === 1 ? big[0] : null;
}

/** Capture a rent figure (with its unit) for the notes, so it isn't lost. */
function pdfRent(t: string): string {
  const m = t.match(/(?:rent[^£]{0,20})?£\s?[\d,]+(?:\.\d+)?\s*(?:per annum|p\.?\s?a\.?|pax|per sq\.?\s*ft|psf|per month|pcm|per week|pw)/i);
  return m ? m[0].replace(/\s+/g, " ").trim() : "";
}

/** Heuristic extraction from agent particulars (commercial PDFs). */
function parsePdfText(text: string): ImportedDraft {
  const t = text.replace(/\s+/g, " ").trim();

  // address + town from the first UK postcode in the document (top = subject)
  let name = "";
  let town = "";
  const pc = t.match(/\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/);
  if (pc) {
    const postcode = `${pc[1]} ${pc[2]}`;
    const words = t.slice(0, pc.index).replace(/[:|]/g, " ").trim().split(/\s+/).filter(Boolean).slice(-7);
    town = words[words.length - 1] || "";
    const street = words.slice(0, -1).join(" ").trim();
    name = [street, `${town} ${postcode}`].filter(Boolean).join(", ");
  } else {
    name = cleanListingTitle(t.slice(0, 60));
  }

  const sizeSqFt = pdfSize(t);

  const useM = t.match(
    /\b(offices?|retail|industrial|warehouses?|shops?|restaurants?|leisure|showrooms?|units?|trade counter)\b[^.]{0,12}?\b(to let|for sale|to rent)\b/i,
  );
  const currentUse = useM ? `${titleWords(useM[1])} — ${titleWords(useM[2])}` : "";

  const guidePrice = pdfPrice(t);
  const rent = pdfRent(t);

  let desc = "";
  const dm = t.match(
    /description\s+(.*?)\s+(availability|location|terms|specification|viewings?|accommodation|epc\b)/i,
  );
  if (dm) desc = dm[1].trim();

  const source = /hicks\s*baker|hicksbaker/i.test(t) ? "Hicks Baker" : "PDF particulars";

  const notes = [rent ? `Rent: ${rent}` : "", desc || t].filter(Boolean).join("\n").slice(0, 760);

  return {
    name,
    town: deriveTown(name) || town,
    sizeSqFt,
    currentUse,
    guidePrice,
    listingSource: source,
    notes,
  };
}

// ── entry point ──────────────────────────────────────────────────────────────
export async function importListing(input: { url?: string; html?: string }): Promise<ImportResult> {
  const url = input.url?.trim();
  const source = url ? sourceFromUrl(url) : "Web";

  let html = input.html ?? "";
  let blocked = false;

  if (!html) {
    if (!url) return { ok: false, source, blocked: false, warning: "No URL or page source provided.", fields: {} };
    try {
      new URL(url);
    } catch {
      return { ok: false, source, blocked: false, warning: "That doesn't look like a valid URL.", fields: {} };
    }
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 20000);
      const res = await fetch(url, { headers: BROWSER_HEADERS, signal: ctrl.signal, redirect: "follow" });
      clearTimeout(timer);

      // PDF particulars (e.g. agent brochures) — extract text and parse.
      const ctype = res.headers.get("content-type") || "";
      if (/\.pdf($|\?)/i.test(url) || ctype.includes("application/pdf")) {
        const text = await extractPdfText(await res.arrayBuffer());
        if (!text) {
          return {
            ok: false,
            source: "PDF",
            blocked: false,
            warning: "Couldn't read text from that PDF — it may be a scanned image. Enter the details manually.",
            fields: { listingSource: "PDF particulars", listingUrl: url },
          };
        }
        const fields = parsePdfText(text);
        fields.listingUrl = url;
        const got = !!(fields.name || fields.sizeSqFt || fields.guidePrice || fields.notes);
        return {
          ok: got,
          source: fields.listingSource || "PDF",
          blocked: false,
          warning: got ? undefined : "Couldn't find structured details in that PDF.",
          fields,
        };
      }

      html = await res.text();
      if (res.status === 403 || res.status === 429 || looksBlocked(html)) blocked = true;
    } catch {
      return {
        ok: false,
        source,
        blocked: true,
        warning: `Couldn't reach the page automatically. ${source} may block automated access — open the listing, view the page source, and paste it below.`,
        fields: { listingSource: source, listingUrl: url },
      };
    }
  }

  if (blocked) {
    return {
      ok: false,
      source,
      blocked: true,
      warning: `${source} blocked the automated fetch (bot protection). Open the listing in your browser, copy the page source, and paste it below to import.`,
      fields: { listingSource: source, listingUrl: url },
    };
  }

  const fields = mergeDrafts(
    source === "Rightmove" ? parseRightmove(html) : null,
    parseJsonLd(html),
    parseMeta(html),
  );
  fields.listingSource = source;
  if (url) fields.listingUrl = url;

  const gotSomething = !!(fields.name || fields.guidePrice || fields.sizeSqFt || fields.notes);
  return {
    ok: gotSomething,
    source,
    blocked: false,
    warning: gotSomething ? undefined : "Couldn't find structured listing data on that page. Try pasting the page source instead.",
    fields,
  };
}
