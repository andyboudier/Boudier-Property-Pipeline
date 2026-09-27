import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAllMonitorCriteria, listWatch, listLeads } from "@/lib/db";
import { classifyKind, type ProspectKind } from "@/lib/prospectKind";
import type { MonitorCriteria } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ──────────────────────────────────────────────────────────────────────────
// Search criteria — read-only.
//
// Reports the filters the nightly scan actually applies, so the daily digest
// can state them instead of carrying a copy that quietly drifts out of date.
// Returns both the structured criteria and a ready-made markdown `summary`.
//
// Nothing here writes. It lives under /api/cron because that prefix bypasses
// the SSO middleware, and it authenticates exactly like the relisted check:
// DIGEST_TOKEN if configured, else CRON_SECRET, as an "Authorization: Bearer"
// header or a ?token= query parameter for callers that cannot set headers.
// ──────────────────────────────────────────────────────────────────────────

const gbp = (n: number | null) => (n == null ? "no cap" : `£${n.toLocaleString("en-GB")}`);
const sqft = (n: number | null) => (n == null ? "no cap" : `${n.toLocaleString("en-GB")} sq ft`);
const list = (a: string[] | undefined, empty: string) => (a?.length ? a.join(", ") : empty);

/** The rules that live in code rather than in the editable criteria. */
function codeRules(c: MonitorCriteria, kind: ProspectKind): string[] {
  const rules: string[] = [];
  if (c.propertyTypes.some((t) => t.toLowerCase() === "residential")) {
    rules.push(
      "Residential must look like a development opportunity — land, a plot or site, a conversion, a barn, " +
        "something derelict or needing renovation, a block of flats, consent already granted, or an auction lot. " +
        "An ordinary house or flat is rejected.",
    );
  }
  if (kind === "commercial") {
    rules.push("Mixed use counts as commercial — a shop with a flat over is judged by these rules, not the residential ones.");
  }
  if (c.outcodes?.length) {
    rules.push(`Postcodes are matched exactly: ${c.outcodes.join(" and ")} — ${c.outcodes[0]} does not match ${c.outcodes[0]}1 or ${c.outcodes[0]}5.`);
  }
  rules.push("A listing with no readable type, or no location signal at all, is passed through for manual review rather than dropped.");
  return rules;
}

function describe(c: MonitorCriteria, kind: ProspectKind) {
  return {
    propertyTypes: c.propertyTypes,
    areas: c.areas,
    outcodes: c.outcodes ?? [],
    maxSqFt: c.maxSqFt,
    maxPrice: c.maxPrice,
    includeIfNoPrice: c.includeIfNoPrice,
    excludeKeywords: c.excludeKeywords,
    rules: codeRules(c, kind),
  };
}

function markdown(
  criteria: Record<ProspectKind, MonitorCriteria>,
  sources: Record<string, number>,
  prospects: Record<string, number>,
): string {
  const block = (kind: ProspectKind) => {
    const c = criteria[kind];
    return [
      `**${kind === "commercial" ? "Commercial" : "Residential"}**`,
      `- Types: ${list(c.propertyTypes, "any")}`,
      `- Areas: ${list(c.areas, "anywhere")}`,
      `- Postcodes: ${list(c.outcodes, "no extra limit")}`,
      `- Max size: ${sqft(c.maxSqFt)} · Max price: ${gbp(c.maxPrice)}`,
      `- No price quoted: ${c.includeIfNoPrice ? "still listed" : "rejected"}`,
      ...codeRules(c, kind).map((r) => `- ${r}`),
    ].join("\n");
  };
  return [
    "### Search criteria",
    block("commercial"),
    "",
    block("residential"),
    "",
    `Both exclude: ${list([...new Set(criteria.commercial.excludeKeywords)], "nothing")}.`,
    "",
    `Watching ${sources.total} sources (${sources.commercial} commercial, ${sources.residential} residential). ` +
      `${prospects.total} prospects awaiting review (${prospects.commercial} commercial, ${prospects.residential} residential).`,
    "",
    "Relisted alerts are not filtered by any of the above — they cover pipeline sites recorded as gone from the market that are being advertised again.",
  ].join("\n");
}

export async function GET(req: NextRequest) {
  const token = process.env.DIGEST_TOKEN || process.env.CRON_SECRET;
  if (!token) {
    return NextResponse.json({ ok: false, error: "DIGEST_TOKEN/CRON_SECRET not configured" }, { status: 503 });
  }
  const presented =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
    req.nextUrl.searchParams.get("token")?.trim() ||
    "";
  const authed = presented === token || req.headers.get("x-vercel-cron") != null;
  if (!authed) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const [criteria, watch, leads] = await Promise.all([getAllMonitorCriteria(), listWatch(), listLeads()]);

  const countBy = <T,>(items: T[], kindOf: (t: T) => ProspectKind) => {
    const out = { total: items.length, commercial: 0, residential: 0 };
    for (const i of items) out[kindOf(i)]++;
    return out;
  };
  const sources = countBy(watch, (w) => (w.kind ?? "commercial") as ProspectKind);
  const active = leads.filter((l) => l.status === "new" || l.status === "reviewing");
  const prospects = countBy(active, (l) => (l.kind ?? classifyKind(l)) as ProspectKind);

  // ?format=text returns just the markdown, for a caller that wants to paste it.
  if (req.nextUrl.searchParams.get("format") === "text") {
    return new NextResponse(markdown(criteria, sources, prospects), {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    commercial: describe(criteria.commercial, "commercial"),
    residential: describe(criteria.residential, "residential"),
    sources,
    prospectsToReview: prospects,
    relistedAlerts: "Not filtered by the criteria above — pipeline sites recorded as gone that are being advertised again.",
    summary: markdown(criteria, sources, prospects),
  });
}
