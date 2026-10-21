import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { searchFreeholds, isFreeholdsConfigured, toCsv, DEFAULT_FILTERS, type OwnerType } from "@/lib/freeholds";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Filter query behind the /freeholds map (plan §2, §6). Gated by the app's SSO
// middleware like every other non-cron route.
//
//   default         JSON rows
//   ?format=geojson FeatureCollection with each candidate's polygon, for the map
//   ?format=csv     download for VA outreach / mail-merge

const nums = (v: string | null) => (v == null || v === "" ? undefined : Number(v));
const csv = (v: string | null) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : undefined);

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const format = p.get("format") || "json";

  if (!isFreeholdsConfigured()) {
    return NextResponse.json({
      ok: true,
      configured: false,
      rows: [],
      count: 0,
      message: "Freehold data store not configured — set SUPABASE_URL and SUPABASE_SERVICE_KEY, then run the ETL.",
    });
  }

  try {
    // F6 is a toggle: epc=off switches it off entirely, otherwise a threshold.
    const epcParam = p.get("epc");
    const minEpcUprns = epcParam === "off" ? null : (nums(epcParam) ?? DEFAULT_FILTERS.minEpcUprns);

    const { rows } = await searchFreeholds({
      laCodes: csv(p.get("la")),
      minAddresses: nums(p.get("minAddresses")),
      maxAddresses: nums(p.get("maxAddresses")),
      maxLeases: nums(p.get("maxLeases")),
      ownerTypes: csv(p.get("owner")) as OwnerType[] | undefined,
      useClasses: csv(p.get("use")),
      minEpcUprns,
      minConfidence: nums(p.get("minConfidence")),
      withGeometry: format === "geojson",
      limit: nums(p.get("limit")),
    });

    if (format === "csv") {
      const la = (csv(p.get("la")) ?? ["all"]).join("-");
      return new NextResponse(toCsv(rows), {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="freeholds-${la}-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    if (format === "geojson") {
      const features = rows
        .filter((r) => r.geometry)
        .map(({ geometry, ...props }) => ({ type: "Feature", id: props.id, geometry, properties: props }));
      return NextResponse.json({ type: "FeatureCollection", features, count: features.length });
    }

    return NextResponse.json({ ok: true, configured: true, count: rows.length, rows });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
