import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Constraint overlays for the freehold map (plan §6): planning.data.gov.uk
// polygons for the current map viewport, as one GeoJSON FeatureCollection.
// OGL v3, no key. Proxied rather than fetched from the browser so responses
// are cached here and the dataset list stays an allowlist.
//
//   GET /api/freeholds/overlays?dataset=conservation-area&bbox=west,south,east,north

const PDG = "https://www.planning.data.gov.uk/entity.geojson";
const ALLOWED = new Set(["conservation-area", "article-4-direction-area", "listed-building-outline", "flood-risk-zone"]);
const MAX_PAGES = 6; // 500 a page; flood zones are dense, the rest rarely exceed one
const MAX_SPAN = 0.4; // degrees — refuse whole-county viewports rather than time out

export async function GET(req: NextRequest) {
  const dataset = req.nextUrl.searchParams.get("dataset") || "";
  const bbox = (req.nextUrl.searchParams.get("bbox") || "").split(",").map(Number);
  if (!ALLOWED.has(dataset)) return NextResponse.json({ error: "unknown dataset" }, { status: 400 });
  if (bbox.length !== 4 || bbox.some((n) => !Number.isFinite(n))) return NextResponse.json({ error: "bbox=west,south,east,north" }, { status: 400 });
  const [w, s, e, n] = bbox;
  if (e - w > MAX_SPAN || n - s > MAX_SPAN) {
    return NextResponse.json({ type: "FeatureCollection", features: [], truncated: true, reason: "zoom in to load this layer" });
  }

  const polygon = `POLYGON((${w} ${s},${e} ${s},${e} ${n},${w} ${n},${w} ${s}))`;
  let url: string | null = `${PDG}?${new URLSearchParams({ dataset, geometry_relation: "intersects", limit: "500", geometry: polygon })}`;
  const features: unknown[] = [];
  let pages = 0;
  try {
    while (url && pages < MAX_PAGES) {
      const r = await fetch(url, { headers: { Accept: "application/geo+json" }, next: { revalidate: 86_400 } });
      if (!r.ok) break;
      const body = (await r.json()) as { features?: unknown[]; links?: { next?: string } };
      features.push(...(body.features ?? []));
      // Pagination links come back as http://, which CloudFront 301s.
      url = body.links?.next ? body.links.next.replace(/^http:\/\//, "https://") : null;
      pages++;
    }
  } catch {
    /* return what we have */
  }
  return NextResponse.json({ type: "FeatureCollection", features, truncated: !!url });
}
