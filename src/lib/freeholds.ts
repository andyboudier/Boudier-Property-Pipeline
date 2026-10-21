import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Band as EpcBand } from "./epc";
import type { FreeholdSort } from "./freeholdSorts";

export { FREEHOLD_SORTS, type FreeholdSort } from "./freeholdSorts";

// ──────────────────────────────────────────────────────────────────────────
// Unbroken Freehold Finder — data access (plan §4, §6).
//
// Land data lives in Supabase Postgres + PostGIS, not Firestore, because the
// ETL does spatial joins and the map queries polygons. Firestore still owns the
// deals: "Add to Pipeline" writes a property there and records the link here.
//
// Stays inert until SUPABASE_URL / SUPABASE_SERVICE_KEY are set, so the app
// runs exactly as before while the module is being built out.
// ──────────────────────────────────────────────────────────────────────────

export type OwnerType = "private" | "company" | "overseas" | "public" | "unknown";

/** Release-1 authorities (plan §7): name for the pipeline record, LPA label. */
export const LA_NAMES: Record<string, { town: string; lpa: string }> = {
  E06000038: { town: "Reading", lpa: "Reading Borough Council" },
  E06000037: { town: "Newbury", lpa: "West Berkshire Council" },
  E06000041: { town: "Wokingham", lpa: "Wokingham Borough Council" },
  E06000036: { town: "Bracknell", lpa: "Bracknell Forest Council" },
  E06000040: { town: "Maidenhead", lpa: "Royal Borough of Windsor and Maidenhead" },
  E06000039: { town: "Slough", lpa: "Slough Borough Council" },
};

/** The filters from plan §2. F1 (freehold) is implicit — INSPIRE is freehold-only. */
export interface FreeholdFilters {
  laCodes?: string[];
  minAddresses?: number; // F2, default 2
  maxAddresses?: number; // F2, default 20
  maxLeases?: number; // F3, default 0 ("unbroken")
  ownerTypes?: OwnerType[]; // F4
  useClasses?: string[]; // F5
  minEpcUprns?: number | null; // F6, null = filter off
  minConfidence?: number; // 0–1
  withGeometry?: boolean; // include the polygon (GeoJSON) for the map
  // Possible conversions (migration 0012): several OS addresses, almost none
  // corroborated. F2 then counts OS UPRNs; F5, F6 and confidence don't apply.
  conversions?: boolean;
  sort?: FreeholdSort;
  limit?: number;
}

export interface FreeholdCandidate {
  id: number;
  inspireId: string;
  titleNumber: string | null;
  laCode: string;
  centroid: { lat: number; lng: number } | null;
  geometry?: Record<string, unknown> | null; // GeoJSON MultiPolygon, when requested
  addressCount: number;
  leaseCount: number;
  epcUprnCount: number;
  epcCertCount: number;
  ownerType: OwnerType;
  ownerTypeInferred: boolean;
  companyName: string | null;
  companyNumber: string | null;
  companyAddress: string | null;
  useClasses: string[];
  sampleAddresses: string[];
  lastSaleDate: string | null;
  lastSalePrice: number | null;
  lastSaleTenure: string | null; // F | L
  lastSaleType: string | null; // Price Paid property type: D S T F O
  lastSaleSource: "price-paid" | "ccod" | null; // HMLR Price Paid, or what the owning company paid (CCOD)
  epcBands: Partial<Record<EpcBand, number>>; // units per band, latest certificate each
  epcBandTypical: EpcBand | null; // median across the building
  epcBandWorst: EpcBand | null;
  // A certificate is valid for ten years from lodgement (migration 0013).
  epcFirstExpiry: string | null; // soonest a unit's certificate expires, or expired
  epcLastExpiry: string | null;
  epcExpiredCount: number | null;
  epcUnits: { address: string | null; band: EpcBand | null; lodged: string; expires: string }[]; // soonest expiry first
  uprnCount: number | null; // every OS UPRN inside, corroborated or not
  possibleConversion: boolean;
  nearAddress: string | null; // nearest certified address, for a conversion with none of its own
  confidence: number;
  pipelinePropertyId: string | null;
  refreshedAt: string;
}

export const DEFAULT_FILTERS = {
  minAddresses: 2,
  maxAddresses: 20,
  maxLeases: 0,
  minEpcUprns: 2, // F6 default: "epc_count > 2" — more than two, so >= 3
  minConfidence: 0,
};

function creds() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return { url, key };
}

export function isFreeholdsConfigured() {
  return creds() !== null;
}

let client: SupabaseClient | null = null;
async function getClient(): Promise<SupabaseClient | null> {
  const c = creds();
  if (!c) return null;
  if (!client) {
    const { createClient } = await import("@supabase/supabase-js");
    // Service key — server-side only. Never expose this to the browser.
    client = createClient(c.url, c.key, { auth: { persistSession: false } });
  }
  return client;
}

type Row = Record<string, unknown>;

const COLUMNS =
  "id,inspire_id,title_number,la_code,centroid,address_count,lease_count,epc_uprn_count,epc_cert_count," +
  "owner_type,owner_type_inferred,company_name,company_number,company_address,use_classes,sample_addresses," +
  "last_sale_date,last_sale_price,last_sale_tenure,last_sale_type,last_sale_source," +
  "epc_bands,epc_band_typical,epc_band_worst,epc_first_expiry,epc_last_expiry,epc_expired_count,epc_units," +
  "uprn_count,possible_conversion,near_address," +
  "confidence,pipeline_property_id,refreshed_at";

/** PostGIS geometry comes back as GeoJSON with a legacy `crs` member; drop it. */
function cleanGeo(g: unknown): Record<string, unknown> | null {
  if (!g || typeof g !== "object") return null;
  const { crs: _crs, ...rest } = g as Record<string, unknown>;
  return rest;
}

function toCandidate(r: Row): FreeholdCandidate {
  const n = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v !== "" ? Number(v) : 0);
  const s = (v: unknown) => (typeof v === "string" ? v : null);
  const centroid = r.centroid as { coordinates?: [number, number] } | null;
  return {
    id: n(r.id),
    inspireId: String(r.inspire_id ?? ""),
    titleNumber: s(r.title_number),
    laCode: String(r.la_code ?? ""),
    centroid: centroid?.coordinates ? { lng: centroid.coordinates[0], lat: centroid.coordinates[1] } : null,
    geometry: "geom" in r ? cleanGeo(r.geom) : undefined,
    addressCount: n(r.address_count),
    leaseCount: n(r.lease_count),
    epcUprnCount: n(r.epc_uprn_count),
    epcCertCount: n(r.epc_cert_count),
    ownerType: (s(r.owner_type) as OwnerType) ?? "unknown",
    ownerTypeInferred: r.owner_type_inferred === true,
    companyName: s(r.company_name),
    companyNumber: s(r.company_number),
    companyAddress: s(r.company_address),
    useClasses: Array.isArray(r.use_classes) ? (r.use_classes as string[]) : [],
    sampleAddresses: Array.isArray(r.sample_addresses) ? (r.sample_addresses as string[]) : [],
    lastSaleDate: s(r.last_sale_date),
    lastSalePrice: r.last_sale_price == null ? null : n(r.last_sale_price),
    lastSaleTenure: s(r.last_sale_tenure),
    lastSaleType: s(r.last_sale_type),
    lastSaleSource: (s(r.last_sale_source) as FreeholdCandidate["lastSaleSource"]) ?? null,
    epcBands: r.epc_bands && typeof r.epc_bands === "object" ? (r.epc_bands as FreeholdCandidate["epcBands"]) : {},
    epcBandTypical: (s(r.epc_band_typical) as EpcBand | null) ?? null,
    epcBandWorst: (s(r.epc_band_worst) as EpcBand | null) ?? null,
    epcFirstExpiry: s(r.epc_first_expiry),
    epcLastExpiry: s(r.epc_last_expiry),
    epcExpiredCount: r.epc_expired_count == null ? null : n(r.epc_expired_count),
    epcUnits: Array.isArray(r.epc_units) ? (r.epc_units as FreeholdCandidate["epcUnits"]) : [],
    uprnCount: r.uprn_count == null ? null : n(r.uprn_count),
    possibleConversion: r.possible_conversion === true,
    nearAddress: s(r.near_address),
    confidence: n(r.confidence),
    pipelinePropertyId: s(r.pipeline_property_id),
    refreshedAt: String(r.refreshed_at ?? ""),
  };
}

/**
 * Run the F1–F6 filter set. Returns an empty list (not an error) while Supabase
 * is unconfigured, so the map renders and says so rather than breaking.
 */
export async function searchFreeholds(f: FreeholdFilters): Promise<{ rows: FreeholdCandidate[]; configured: boolean }> {
  const db = await getClient();
  if (!db) return { rows: [], configured: false };

  const minAddresses = f.minAddresses ?? DEFAULT_FILTERS.minAddresses;
  const maxAddresses = f.maxAddresses ?? DEFAULT_FILTERS.maxAddresses;
  const maxLeases = f.maxLeases ?? DEFAULT_FILTERS.maxLeases;

  const counted = f.conversions ? "uprn_count" : "address_count";
  let q = db
    .from("freehold_candidates")
    .select(f.withGeometry ? `${COLUMNS},geom` : COLUMNS)
    .gte(counted, minAddresses) // F2
    .lte(counted, maxAddresses)
    .lte("lease_count", maxLeases); // F3

  if (f.laCodes?.length) q = q.in("la_code", f.laCodes);
  if (f.ownerTypes?.length) q = q.in("owner_type", f.ownerTypes); // F4
  if (f.conversions) {
    q = q.eq("possible_conversion", true);
  } else {
    if (f.useClasses?.length) q = q.overlaps("use_classes", f.useClasses); // F5
    // F6 is a toggle: null means the filter is off entirely.
    if (f.minEpcUprns != null) q = q.gt("epc_uprn_count", f.minEpcUprns);
    if (f.minConfidence) q = q.gte("confidence", f.minConfidence);
  }

  switch (f.sort ?? "confidence") {
    case "addresses": q = q.order(counted, { ascending: false }); break;
    case "epc-worst": q = q.order("epc_band_worst", { ascending: false, nullsFirst: false }); break;
    case "epc-expiry": q = q.order("epc_first_expiry", { ascending: true, nullsFirst: false }); break;
    case "sale-recent": q = q.order("last_sale_date", { ascending: false, nullsFirst: false }); break;
    case "sale-price": q = q.order("last_sale_price", { ascending: false, nullsFirst: false }); break;
  }
  const { data, error } = await q.order("confidence", { ascending: false }).order("address_count", { ascending: false }).order("id").limit(Math.min(f.limit ?? 1000, 5000));
  if (error) throw new Error(`freehold query failed: ${error.message}`);
  return { rows: (data ?? []).map((r) => toCandidate(r as unknown as Row)), configured: true };
}

export async function getFreehold(id: number): Promise<FreeholdCandidate | null> {
  const db = await getClient();
  if (!db) return null;
  const { data, error } = await db.from("freehold_candidates").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(`freehold lookup failed: ${error.message}`);
  return data ? toCandidate(data as unknown as Row) : null;
}

/**
 * A possible conversion has no address of its own. Once the map has
 * reverse-geocoded one, store the address and look up its last sale and any
 * company freehold title at it (resolve_conversion, migration 0012).
 */
export async function resolveConversion(id: number, a: { label: string; paon: string; street: string; postcode: string }): Promise<FreeholdCandidate | null> {
  const db = await getClient();
  if (!db) return null;
  const { error } = await db.rpc("resolve_conversion", { p_id: id, p_label: a.label, p_paon: a.paon, p_street: a.street, p_postcode: a.postcode });
  if (error) throw new Error(`conversion lookup failed: ${error.message}`);
  return getFreehold(id);
}

/** Record that a candidate has been promoted to a Firestore property. */
export async function markInPipeline(id: number, propertyId: string): Promise<void> {
  const db = await getClient();
  if (!db) return;
  const { error } = await db
    .from("freehold_candidates")
    .update({ pipeline_property_id: propertyId, pipeline_added_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`freehold pipeline link failed: ${error.message}`);
}

/** The planning.data.gov.uk entity page for a title boundary (entity = 12000000000 + INSPIRE id). */
export function titleBoundaryUrl(inspireId: string): string {
  return `https://www.planning.data.gov.uk/entity/${12_000_000_000 + Number(inspireId)}`;
}

/** CSV for VA outreach / mail-merge (plan §6). */
export function toCsv(rows: FreeholdCandidate[]): string {
  const cols: Array<[string, (r: FreeholdCandidate) => unknown]> = [
    ["inspire_id", (r) => r.inspireId],
    ["first_address", (r) => r.sampleAddresses[0] ?? ""],
    ["sample_addresses", (r) => r.sampleAddresses.join(" | ")],
    ["addresses", (r) => r.addressCount],
    ["os_uprns", (r) => r.uprnCount ?? ""],
    ["possible_conversion", (r) => (r.possibleConversion ? "yes" : "")],
    ["near_address", (r) => r.nearAddress ?? ""],
    ["leases", (r) => r.leaseCount],
    ["epc_uprns", (r) => r.epcUprnCount],
    ["epc_certificates", (r) => r.epcCertCount],
    ["owner_type", (r) => r.ownerType + (r.ownerTypeInferred ? " (inferred)" : "")],
    ["company_name", (r) => r.companyName ?? ""],
    ["company_number", (r) => r.companyNumber ?? ""],
    ["company_address", (r) => r.companyAddress ?? ""],
    ["use_classes", (r) => r.useClasses.join(" ")],
    ["confidence", (r) => r.confidence],
    ["title_number", (r) => r.titleNumber ?? ""],
    ["epc_typical", (r) => r.epcBandTypical ?? ""],
    ["epc_worst", (r) => r.epcBandWorst ?? ""],
    ["epc_bands", (r) => Object.entries(r.epcBands).map(([b, k]) => `${b}:${k}`).join(" ")],
    ["epc_first_expiry", (r) => r.epcFirstExpiry ?? ""],
    ["epc_last_expiry", (r) => r.epcLastExpiry ?? ""],
    ["epc_expired_units", (r) => r.epcExpiredCount ?? ""],
    ["last_sale_date", (r) => r.lastSaleDate ?? ""],
    ["last_sale_price", (r) => r.lastSalePrice ?? ""],
    ["last_sale_source", (r) => r.lastSaleSource ?? ""],
    ["lat", (r) => r.centroid?.lat ?? ""],
    ["lng", (r) => r.centroid?.lng ?? ""],
    ["title_boundary_url", (r) => titleBoundaryUrl(r.inspireId)],
    ["in_pipeline", (r) => r.pipelinePropertyId ?? ""],
  ];
  const esc = (v: unknown) => {
    const t = String(v ?? "");
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return [cols.map(([h]) => h).join(","), ...rows.map((r) => cols.map(([, fn]) => esc(fn(r))).join(","))].join("\n");
}

// ── Areas and on-demand imports ──────────────────────────────────────────────
// Search a place, find its council, and if there is no data yet, start the
// refresh workflow for that council. The workflow's ETL writes its progress
// back to area_imports, which is what the map watches.

export type ImportStatus = "queued" | "running" | "done" | "failed";

export interface Area {
  laCode: string;
  laName: string;
  lat: number | null;
  lng: number | null;
  status: ImportStatus;
  requestedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  candidates: number | null;
  targets: number | null;
  message: string | null;
}

const REPO = "andyboudier/Boudier-Property-Pipeline";
const WORKFLOW = "freehold-refresh.yml";
export const WORKFLOW_RUNS_URL = `https://github.com/${REPO}/actions/workflows/${WORKFLOW}`;
const ONS_DISTRICT = /^[EW]\d{8}$/;

function toArea(r: Row): Area {
  const s = (v: unknown) => (typeof v === "string" ? v : null);
  const num = (v: unknown) => (v == null ? null : Number(v));
  return {
    laCode: String(r.la_code), laName: String(r.la_name), lat: num(r.lat), lng: num(r.lng),
    status: (s(r.status) as ImportStatus) ?? "queued",
    requestedAt: s(r.requested_at), startedAt: s(r.started_at), finishedAt: s(r.finished_at),
    candidates: num(r.candidates), targets: num(r.targets), message: s(r.message),
  };
}

export async function listAreas(): Promise<Area[]> {
  const db = await getClient();
  if (!db) return [];
  const { data, error } = await db.from("area_imports").select("*").order("la_name");
  if (error) throw new Error(`areas query failed: ${error.message}`);
  return (data ?? []).map((r) => toArea(r as Row));
}

export async function getArea(laCode: string): Promise<Area | null> {
  const db = await getClient();
  if (!db) return null;
  const { data } = await db.from("area_imports").select("*").eq("la_code", laCode).maybeSingle();
  return data ? reconcile(toArea(data as Row)) : null;
}

/**
 * A job that dies before the ETL starts (a missing repository secret, say)
 * never reports back, so its area would sit at "queued" for ever. Ask GitHub
 * how the run for this request ended and record a failure, with the step it
 * failed at, so the map can offer a retry.
 */
async function reconcile(a: Area): Promise<Area> {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token || !a.requestedAt || (a.status !== "queued" && a.status !== "running")) return a;
  const requested = new Date(a.requestedAt).getTime();
  if (Date.now() - requested < 60_000) return a;
  try {
    const gh = (path: string) =>
      fetch(`https://api.github.com/repos/${REPO}/${path}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
        cache: "no-store",
      });
    const since = new Date(requested - 60_000).toISOString();
    const r = await gh(`actions/workflows/${WORKFLOW}/runs?event=workflow_dispatch&created=%3E%3D${encodeURIComponent(since)}&per_page=20`);
    if (!r.ok) return a;
    const runs = ((await r.json()) as { workflow_runs?: { id: number; status: string; conclusion: string | null; created_at: string; html_url: string }[] }).workflow_runs ?? [];
    // The first run created after this request is the one it dispatched.
    const run = runs
      .filter((x) => new Date(x.created_at).getTime() >= requested - 30_000)
      .sort((x, y) => x.created_at.localeCompare(y.created_at))[0];
    if (!run || run.status !== "completed" || run.conclusion === "success") return a;

    let step = "";
    const j = await gh(`actions/runs/${run.id}/jobs`);
    if (j.ok) {
      const jobs = ((await j.json()) as { jobs?: { steps?: { name: string; conclusion: string | null }[] }[] }).jobs ?? [];
      step = jobs.flatMap((x) => x.steps ?? []).find((x) => x.conclusion === "failure")?.name ?? "";
    }
    const message =
      step === "Check secrets"
        ? "the GitHub job is missing its repository secrets (SUPABASE_DB_URL, EPC_API_KEY, HMLR_API_KEY)"
        : `the GitHub job ${run.conclusion}${step ? ` at "${step}"` : ""}`;
    const db = await getClient();
    await db?.from("area_imports").update({ status: "failed", finished_at: new Date().toISOString(), message }).eq("la_code", a.laCode).in("status", ["queued", "running"]);
    return { ...a, status: "failed", message };
  } catch {
    return a;
  }
}

/** The council a point falls in, from planning.data.gov.uk (OGL, no key). */
export async function councilAt(lat: number, lng: number): Promise<{ laCode: string; laName: string } | null> {
  const q = new URLSearchParams({ dataset: "local-authority-district", longitude: String(lng), latitude: String(lat), geometry_relation: "intersects", limit: "1" });
  const r = await fetch(`https://www.planning.data.gov.uk/entity.json?${q}`, { next: { revalidate: 86_400 } });
  if (!r.ok) return null;
  const e = ((await r.json()) as { entities?: { reference?: string; name?: string }[] }).entities?.[0];
  return e?.reference && e.name ? { laCode: e.reference, laName: e.name } : null;
}

export function isImportConfigured() {
  return !!process.env.GITHUB_DISPATCH_TOKEN;
}

/**
 * Record an import request and start the refresh workflow for one council.
 * Imports queue on GitHub (the workflow's concurrency group), because every
 * build shares the staging tables.
 */
export async function requestImport(laCode: string, laName: string, lat: number | null, lng: number | null): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!ONS_DISTRICT.test(laCode)) return { ok: false, error: "Not an ONS district code." };
  const db = await getClient();
  if (!db) return { ok: false, error: "The freehold data store is not configured." };
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) {
    return { ok: false, error: "Imports aren't set up yet: GITHUB_DISPATCH_TOKEN is missing in Vercel." };
  }

  const { error } = await db.from("area_imports").upsert(
    { la_code: laCode, la_name: laName, lat, lng, status: "queued", requested_at: new Date().toISOString(), started_at: null, finished_at: null, message: null },
    { onConflict: "la_code" },
  );
  if (error) return { ok: false, error: `Could not record the request: ${error.message}` };

  const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: "main", inputs: { authorities: laCode } }),
  });
  if (r.status !== 204) {
    const detail = (await r.text()).slice(0, 200);
    await db.from("area_imports").update({ status: "failed", message: `GitHub refused the dispatch (${r.status}): ${detail}` }).eq("la_code", laCode);
    return { ok: false, error: `GitHub refused to start the import (HTTP ${r.status}). Check the token's Actions permission.` };
  }
  return { ok: true };
}
