import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { Mac, MacComp, MacSegment } from "@/lib/types";
import payload from "./payload.json";

export const dynamic = "force-dynamic";

// One-time: load researched Rightmove comparables (¼ mile around School Road,
// BN3 5HX) into the Express House MAC — 1 Bed Flats and 2 Bed Flats segments.
// Merges: preserves existing top-level MAC fields; only the two segments'
// comps/totals are replaced. CRON_SECRET-gated; remove after running.

const PROPERTY_ID = "express-house-3-school-road-hove-east-sussex-bn3-5hx";

function segment(key: string, label: string, beds: number, comps: MacComp[], inc: number, exc: number, prev?: MacSegment): MacSegment {
  return {
    key,
    label,
    searchArea: prev?.searchArea?.trim() ? prev.searchArea : "School Road, Hove BN3 5HX",
    radius: "Within 1/4 mile",
    minPrice: prev?.minPrice ?? null,
    maxPrice: prev?.maxPrice ?? null,
    minBeds: beds,
    maxBeds: beds,
    propertyTypeFilter: "Flats/Apartments",
    totalIncSstc: inc,
    totalExcSstc: exc,
    comps,
  };
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "CRON_SECRET not configured" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { getProperty, saveMac } = await import("@/lib/db");
  const { emptyMac } = await import("@/lib/macCalc");
  const p = await getProperty(PROPERTY_ID);
  if (!p) return NextResponse.json({ ok: false, error: "property not found" }, { status: 404 });

  const existing: Mac = p.mac ?? emptyMac(p.name, p.currentUse || "");
  const prev1 = existing.segments?.find((s) => s.key === "1-bed");
  const prev2 = existing.segments?.find((s) => s.key === "2-bed");
  // Refuse to overwrite if either segment already holds real comp data.
  const hasData = (s?: MacSegment) => !!s?.comps?.some((c) => c.property.trim() !== "");
  if (hasData(prev1) || hasData(prev2)) {
    return NextResponse.json({ ok: false, error: "segments already contain comps — not overwriting" }, { status: 409 });
  }

  const t = payload.totals;
  const mac: Mac = {
    ...existing,
    projectName: existing.projectName || p.name,
    date: existing.date || new Date().toISOString().slice(0, 10),
    segments: [
      segment("1-bed", "1 Bed Flats", 1, payload.one as MacComp[], t.one.inc, t.one.exc, prev1),
      segment("2-bed", "2 Bed Flats", 2, payload.two as MacComp[], t.two.inc, t.two.exc, prev2),
      // keep any other segments the user added
      ...(existing.segments?.filter((s) => s.key !== "1-bed" && s.key !== "2-bed") ?? []),
    ],
  };

  await saveMac(PROPERTY_ID, mac);
  return NextResponse.json({
    ok: true,
    oneBedComps: payload.one.length,
    twoBedComps: payload.two.length,
    totals: t,
  });
}
