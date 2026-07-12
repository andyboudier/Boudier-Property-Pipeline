import "server-only";
import { getMonitorCriteria, addLead, leadExistsForUrl, ignoredUrlSet, getInsolvencyCursor, saveInsolvencyCursor, listProperties, listLeads } from "./db";
import { matchesCriteria } from "./monitorCriteria";
import { buildAddressKeySet, matchesKnownAddress } from "./addressMatch";

// Companies House insolvency sourcing: find companies in liquidation with
// property-sector SIC codes near the target areas, then read each company's
// charges register — the particulars usually name the secured property — and
// turn in-area properties into prospects. Official free API; inert without
// COMPANIES_HOUSE_API_KEY.

const CH_API = "https://api.company-information.service.gov.uk";
const CH_WEB = "https://find-and-update.company-information.service.gov.uk";

// Property / development SIC codes.
const SIC_CODES = ["68100", "68209", "68320", "41100", "41202"];

// Only ~3% of liquidation companies carry a parseable property charge, so we
// must check them all, not a shallow slice. CH allows 600 requests / 5 min;
// fetch charges concurrently within a time budget.
const COMPANY_CAP = 500;
const CONCURRENCY = 10;
const TIME_BUDGET_MS = 45_000;

/** Run async work over items with a fixed worker pool. */
async function pool<T, R>(items: T[], workers: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(workers, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

export const isCompaniesHouseConfigured = () => !!process.env.COMPANIES_HOUSE_API_KEY;

function chFetch(path: string): Promise<Response> {
  const key = process.env.COMPANIES_HOUSE_API_KEY!;
  return fetch(`${CH_API}${path}`, {
    headers: { Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}` },
    cache: "no-store",
  });
}

interface ChCompany {
  number: string;
  name: string;
  status: string;
  officePostcode: string;
}

async function searchLiquidationCompanies(areas: string[]): Promise<ChCompany[]> {
  const seen = new Map<string, ChCompany>();
  for (const area of areas) {
    const params = new URLSearchParams({ company_status: "liquidation", location: area, size: "50" });
    for (const sic of SIC_CODES) params.append("sic_codes", sic);
    try {
      const res = await chFetch(`/advanced-search/companies?${params}`);
      if (!res.ok) continue;
      const j = await res.json();
      for (const it of j.items ?? []) {
        const num = it.company_number;
        if (!num || seen.has(num)) continue;
        seen.set(num, {
          number: num,
          name: it.company_name ?? num,
          status: it.company_status ?? "liquidation",
          officePostcode: it.registered_office_address?.postal_code ?? "",
        });
      }
    } catch {
      /* skip this area */
    }
  }
  return [...seen.values()];
}

const SIC_PARAM = SIC_CODES.map((s) => `&sic_codes=${s}`).join("");

/** UK-wide (area-ignoring) search: page through liquidation property companies
 * from `startIndex`, returning up to `count` and the national total. */
async function searchLiquidationNational(startIndex: number, count: number): Promise<{ companies: ChCompany[]; total: number }> {
  const companies: ChCompany[] = [];
  let total = 0;
  const PAGE = 100;
  for (let idx = startIndex; companies.length < count; idx += PAGE) {
    const size = Math.min(PAGE, count - companies.length);
    try {
      const res = await chFetch(`/advanced-search/companies?company_status=liquidation${SIC_PARAM}&size=${size}&start_index=${idx}`);
      if (!res.ok) break;
      const j = await res.json();
      total = j.hits ?? total;
      const items = j.items ?? [];
      if (items.length === 0) break; // ran past the end
      for (const it of items) {
        if (!it.company_number) continue;
        companies.push({
          number: it.company_number,
          name: it.company_name ?? it.company_number,
          status: it.company_status ?? "liquidation",
          officePostcode: it.registered_office_address?.postal_code ?? "",
        });
      }
    } catch {
      break;
    }
  }
  return { companies, total };
}

interface ChCharge {
  code: string;
  status: string;
  entitled: string[];
  description: string;
}

async function getCharges(companyNumber: string): Promise<ChCharge[]> {
  try {
    const res = await chFetch(`/company/${companyNumber}/charges`);
    if (!res.ok) return [];
    const j = await res.json();
    return (j.items ?? [])
      .filter((c: any) => c.status === "outstanding" || c.status === "part-satisfied")
      .map((c: any) => ({
        code: c.charge_code ?? c.charge_number?.toString() ?? "",
        status: c.status ?? "",
        entitled: (c.persons_entitled ?? []).map((p: any) => p.name).filter(Boolean),
        description: c.particulars?.description ?? "",
      }))
      .filter((c: ChCharge) => c.description);
  } catch {
    return [];
  }
}

const POSTCODE_RE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;

/** Clean a charge's particulars into an address + postcode + title number. */
function extractProperty(desc: string): { address: string; postcode: string; title: string } | null {
  let text = desc.replace(/\s+/g, " ").trim();
  const title = text.match(/title (?:number|no\.?)?\s*:?\s*([A-Z]{1,3}\d{3,})/i)?.[1] ?? "";
  // Cut boilerplate: "… registered at (the/HM) Land Registry …" and after.
  text = text.split(/,?\s*(?:being\s+)?registered (?:at|with|under)\b/i)[0].trim().replace(/[.,;\s]+$/, "");
  const pc = text.match(POSTCODE_RE);
  if (!pc) return null; // no postcode → can't area-match reliably
  // Title-case the address for display.
  const address = text
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
    .replace(new RegExp(pc[0].replace(/\s+/g, "\\s*"), "i"), `${pc[1].toUpperCase()} ${pc[2].toUpperCase()}`);
  return { address, postcode: `${pc[1].toUpperCase()} ${pc[2].toUpperCase()}`, title };
}

export interface InsolvencyScanResult {
  ok: boolean;
  error?: string;
  mode: "areas" | "national";
  companiesFound: number;
  companiesChecked: number;
  propertiesSeen: number;
  created: number;
  skipped: { property: string; company: string; reasons: string[] }[];
  leads: { property: string; company: string }[];
  // National sweep progress (undefined for the areas mode).
  windowStart?: number;
  windowEnd?: number;
  totalNational?: number;
}

export async function scanInsolvency(opts: { national?: boolean } = {}): Promise<InsolvencyScanResult> {
  const mode = opts.national ? "national" : "areas";
  const empty: InsolvencyScanResult = { ok: false, mode, companiesFound: 0, companiesChecked: 0, propertiesSeen: 0, created: 0, skipped: [], leads: [] };
  if (!isCompaniesHouseConfigured()) {
    return { ...empty, error: "COMPANIES_HOUSE_API_KEY not configured" };
  }
  const t0 = Date.now();
  const [criteria, ignored, properties, leads] = await Promise.all([
    getMonitorCriteria(),
    ignoredUrlSet(),
    listProperties(),
    listLeads(),
  ]);
  // Addresses already held anywhere — pipeline sites (e.g. Express House) and
  // existing prospects — so we never re-add a property under its CH URL.
  const knownAddresses = buildAddressKeySet([
    ...properties.map((p) => p.name),
    ...leads.map((l) => l.name),
  ]);

  // In national mode we ignore the geographic filter entirely — search the
  // whole UK from a rolling cursor, and match on type/keywords only (blank the
  // areas so matchesCriteria skips its area check). Otherwise: the targeted,
  // area-scoped search.
  let companies: ChCompany[];
  let windowStart = 0;
  let windowEnd = 0;
  let totalNational = 0;
  const matchCriteria = opts.national ? { ...criteria, areas: [] } : criteria;

  if (opts.national) {
    windowStart = await getInsolvencyCursor();
    const { companies: found, total } = await searchLiquidationNational(windowStart, COMPANY_CAP);
    companies = found;
    totalNational = total;
    // Advance the cursor, wrapping at the end so it keeps recirculating.
    windowEnd = windowStart + companies.length;
    const next = total > 0 && windowEnd >= total ? 0 : windowEnd;
    await saveInsolvencyCursor(next);
  } else {
    companies = await searchLiquidationCompanies(criteria.areas);
  }

  let created = 0;
  let propertiesSeen = 0;
  let checked = 0;
  const skipped: InsolvencyScanResult["skipped"] = [];
  const leads: InsolvencyScanResult["leads"] = [];

  // Fetch every company's charges concurrently (respecting the time budget),
  // since so few carry a property that a shallow sequential scan finds nothing.
  const targets = companies.slice(0, COMPANY_CAP);
  const withCharges = await pool(targets, CONCURRENCY, async (co) => {
    if (Date.now() - t0 > TIME_BUDGET_MS) return { co, charges: [] as ChCharge[] };
    checked++;
    return { co, charges: await getCharges(co.number) };
  });

  for (const { co, charges } of withCharges) {
    const seenAddresses = new Set<string>(); // duplicate charges on the same property
    for (const ch of charges) {
      const prop = extractProperty(ch.description);
      if (!prop || seenAddresses.has(prop.postcode + prop.address)) continue;
      seenAddresses.add(prop.postcode + prop.address);
      propertiesSeen++;

      const url = `${CH_WEB}/company/${co.number}/charges#${encodeURIComponent(prop.postcode)}`;
      if (ignored.has(url) || (await leadExistsForUrl(url).catch(() => false))) continue;
      // Already in the pipeline or the prospect list under another source? Skip.
      if (matchesKnownAddress(prop.address, knownAddresses)) continue;

      const verdict = matchesCriteria({ name: prop.address, town: "", currentUse: "", notes: "" }, matchCriteria);
      if (!verdict.include) {
        skipped.push({ property: prop.address, company: co.name, reasons: verdict.reasons });
        continue;
      }

      const townPart = prop.address.split(",").map((s) => s.trim()).filter((s) => !POSTCODE_RE.test(s)).pop() ?? "";
      await addLead({
        status: "new",
        source: "Insolvency (Companies House)",
        url,
        name: prop.address,
        town: townPart,
        guidePrice: null,
        sizeSqFt: null,
        pricePerSqFt: null,
        currentUse: "",
        notes: [
          `⚠ Company in ${co.status.toUpperCase()}: ${co.name} (${co.number}).`,
          `Property identified from the charges register${prop.title ? ` — Land Registry title ${prop.title}` : ""}.`,
          ch.entitled.length ? `Charge holder: ${ch.entitled.join(", ")} (${ch.status}).` : "",
          `Not publicly listed — approach via the company's insolvency practitioner (see the Insolvency tab on Companies House).`,
        ].filter(Boolean).join("\n"),
        imageUrl: "",
        marketStatus: "",
        statusCheckedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      });
      created++;
      leads.push({ property: prop.address, company: co.name });
    }
  }

  return {
    ok: true,
    mode,
    companiesFound: companies.length,
    companiesChecked: checked,
    propertiesSeen,
    created,
    skipped: skipped.slice(0, 20),
    leads,
    ...(opts.national ? { windowStart, windowEnd, totalNational } : {}),
  };
}
