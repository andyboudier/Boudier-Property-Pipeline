import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

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
  "last_sale_date,last_sale_price,confidence,pipeline_property_id,refreshed_at";

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

  let q = db
    .from("freehold_candidates")
    .select(f.withGeometry ? `${COLUMNS},geom` : COLUMNS)
    .gte("address_count", minAddresses) // F2
    .lte("address_count", maxAddresses)
    .lte("lease_count", maxLeases); // F3

  if (f.laCodes?.length) q = q.in("la_code", f.laCodes);
  if (f.ownerTypes?.length) q = q.in("owner_type", f.ownerTypes); // F4
  if (f.useClasses?.length) q = q.overlaps("use_classes", f.useClasses); // F5
  // F6 is a toggle: null means the filter is off entirely.
  if (f.minEpcUprns != null) q = q.gt("epc_uprn_count", f.minEpcUprns);
  if (f.minConfidence) q = q.gte("confidence", f.minConfidence);

  const { data, error } = await q.order("confidence", { ascending: false }).order("address_count", { ascending: false }).limit(Math.min(f.limit ?? 1000, 5000));
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
    ["leases", (r) => r.leaseCount],
    ["epc_uprns", (r) => r.epcUprnCount],
    ["epc_certificates", (r) => r.epcCertCount],
    ["owner_type", (r) => r.ownerType + (r.ownerTypeInferred ? " (inferred)" : "")],
    ["company_name", (r) => r.companyName ?? ""],
    ["company_number", (r) => r.companyNumber ?? ""],
    ["company_address", (r) => r.companyAddress ?? ""],
    ["use_classes", (r) => r.useClasses.join(" ")],
    ["confidence", (r) => r.confidence],
    ["last_sale_date", (r) => r.lastSaleDate ?? ""],
    ["last_sale_price", (r) => r.lastSalePrice ?? ""],
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
