import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// ──────────────────────────────────────────────────────────────────────────
// Unbroken Freehold Finder — data access (plan §4, §6).
//
// Land data lives in Supabase Postgres + PostGIS, not Firestore, because the
// ETL does spatial joins and the map queries polygons. Firestore still owns the
// deals: "Add to Pipeline" writes a property there.
//
// Stays inert until SUPABASE_URL / SUPABASE_SERVICE_KEY are set, so the app
// runs exactly as before while the module is being built out.
// ──────────────────────────────────────────────────────────────────────────

export type OwnerType = "private" | "company" | "overseas" | "public" | "unknown";

/** The filters from plan §2. F1 (freehold) is implicit — INSPIRE is freehold-only. */
export interface FreeholdFilters {
  laCodes?: string[];
  minAddresses?: number; // F2, default 2
  maxAddresses?: number; // F2, default 20
  maxLeases?: number; // F3, default 0 ("unbroken")
  ownerTypes?: OwnerType[]; // F4
  useClasses?: string[]; // F5
  minEpcUprns?: number | null; // F6, null = filter off
  bbox?: [number, number, number, number]; // [west, south, east, north]
  limit?: number;
}

export interface FreeholdCandidate {
  id: number;
  inspireId: string;
  titleNumber: string | null;
  laCode: string;
  centroid: { lat: number; lng: number } | null;
  addressCount: number;
  leaseCount: number;
  epcUprnCount: number;
  epcCertCount: number;
  ownerType: OwnerType;
  ownerTypeInferred: boolean;
  companyName: string | null;
  companyNumber: string | null;
  useClasses: string[];
  sampleAddresses: string[];
  lastSaleDate: string | null;
  lastSalePrice: number | null;
  confidence: number;
  refreshedAt: string;
}

export const DEFAULT_FILTERS: Required<Pick<FreeholdFilters, "minAddresses" | "maxAddresses" | "maxLeases" | "minEpcUprns">> = {
  minAddresses: 2,
  maxAddresses: 20,
  maxLeases: 0,
  minEpcUprns: 2, // F6 default: "epc_count > 2" — more than two, so >= 3
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

function toCandidate(r: Row): FreeholdCandidate {
  const n = (v: unknown) => (typeof v === "number" ? v : 0);
  const s = (v: unknown) => (typeof v === "string" ? v : null);
  const centroid = r.centroid as { coordinates?: [number, number] } | null;
  return {
    id: n(r.id),
    inspireId: String(r.inspire_id ?? ""),
    titleNumber: s(r.title_number),
    laCode: String(r.la_code ?? ""),
    centroid: centroid?.coordinates ? { lng: centroid.coordinates[0], lat: centroid.coordinates[1] } : null,
    addressCount: n(r.address_count),
    leaseCount: n(r.lease_count),
    epcUprnCount: n(r.epc_uprn_count),
    epcCertCount: n(r.epc_cert_count),
    ownerType: (s(r.owner_type) as OwnerType) ?? "unknown",
    ownerTypeInferred: r.owner_type_inferred === true,
    companyName: s(r.company_name),
    companyNumber: s(r.company_number),
    useClasses: Array.isArray(r.use_classes) ? (r.use_classes as string[]) : [],
    sampleAddresses: Array.isArray(r.sample_addresses) ? (r.sample_addresses as string[]) : [],
    lastSaleDate: s(r.last_sale_date),
    lastSalePrice: typeof r.last_sale_price === "number" ? r.last_sale_price : null,
    confidence: n(r.confidence),
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
    .select(
      "id,inspire_id,title_number,la_code,centroid,address_count,lease_count,epc_uprn_count,epc_cert_count," +
        "owner_type,owner_type_inferred,company_name,company_number,use_classes,sample_addresses," +
        "last_sale_date,last_sale_price,confidence,refreshed_at",
    )
    .gte("address_count", minAddresses) // F2
    .lte("address_count", maxAddresses)
    .lte("lease_count", maxLeases); // F3

  if (f.laCodes?.length) q = q.in("la_code", f.laCodes);
  if (f.ownerTypes?.length) q = q.in("owner_type", f.ownerTypes); // F4
  if (f.useClasses?.length) q = q.overlaps("use_classes", f.useClasses); // F5
  // F6 is a toggle: null means the filter is off entirely.
  if (f.minEpcUprns != null) q = q.gt("epc_uprn_count", f.minEpcUprns);

  const { data, error } = await q.order("confidence", { ascending: false }).limit(Math.min(f.limit ?? 500, 5000));
  if (error) throw new Error(`freehold query failed: ${error.message}`);
  return { rows: (data ?? []).map((r) => toCandidate(r as unknown as Row)), configured: true };
}
