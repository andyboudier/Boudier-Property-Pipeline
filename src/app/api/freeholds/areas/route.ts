import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { listAreas, getArea, councilAt, isImportConfigured, WORKFLOW_RUNS_URL } from "@/lib/freeholds";

export const dynamic = "force-dynamic";

// GET                     → every area with its import status (the map's area chips)
// GET ?lat=..&lng=..      → the council that point is in, and its status
// GET ?la=E07000114       → one council's status (polled while importing)
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  try {
    const lat = Number(p.get("lat")), lng = Number(p.get("lng"));
    if (p.has("lat") && p.has("lng") && Number.isFinite(lat) && Number.isFinite(lng)) {
      const c = await councilAt(lat, lng);
      if (!c) return NextResponse.json({ council: null, message: "That point isn't in a council in England or Wales." });
      return NextResponse.json({ council: c, area: await getArea(c.laCode), importConfigured: isImportConfigured(), runsUrl: WORKFLOW_RUNS_URL });
    }
    const la = p.get("la");
    if (la) return NextResponse.json({ area: await getArea(la), runsUrl: WORKFLOW_RUNS_URL });
    return NextResponse.json({ areas: await listAreas() });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
