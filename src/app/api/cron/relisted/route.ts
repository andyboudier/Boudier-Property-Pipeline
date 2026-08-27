import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ──────────────────────────────────────────────────────────────────────────
// Relisted check — pipeline properties only (not prospects).
//
// Finds sites recorded as gone from the market that are being advertised
// again, marks them "review" in the pipeline, and returns what changed so the
// daily digest can highlight them.
//
// Two ways a property qualifies:
//   A. marketStatus is in the "gone" set and a live re-check now reads For Sale.
//   B. the nightly scan already raised alert="back-on-market" but nothing has
//      set the pipeline status to review yet (covers the race where
//      /api/cron/scan re-checks the listing first and clears marketStatus).
//
// Auth: Bearer DIGEST_TOKEN if configured, else Bearer CRON_SECRET, or a
// Vercel cron request. It writes, so it is never open.
// ──────────────────────────────────────────────────────────────────────────

const SOLD_ONLY = ["Sold"];
const GONE = ["Sold", "Under Offer", "Withdrawn"];

const CHECK_CAP = 40; // listings re-checked per run
const CONCURRENCY = 6;

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

export async function GET(req: NextRequest) {
  const token = process.env.DIGEST_TOKEN || process.env.CRON_SECRET;
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "DIGEST_TOKEN/CRON_SECRET not configured" },
      { status: 503 },
    );
  }
  const authed =
    req.headers.get("authorization") === `Bearer ${token}` ||
    req.headers.get("x-vercel-cron") != null;
  if (!authed) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  // ?scope=gone widens the trigger from Sold to Sold + Under Offer + Withdrawn.
  const scope = req.nextUrl.searchParams.get("scope") === "gone" ? GONE : SOLD_ONLY;
  // ?dry=1 reports what would change without writing.
  const dry = req.nextUrl.searchParams.get("dry") === "1";

  const { listProperties, updateProperty } = await import("@/lib/db");
  const { checkMarketStatus } = await import("@/lib/importListing");

  const properties = await listProperties();

  type Row = {
    id: string;
    name: string;
    town: string;
    guidePrice: number | null;
    listingUrl: string;
    previousStatus: string;
    via: "recheck" | "alert";
  };

  const relisted: Row[] = [];
  const unreadable: { id: string; name: string; listingUrl: string }[] = [];

  // ── B. Already flagged back-on-market by the nightly scan, not yet reviewed ──
  const alreadyFlagged = properties.filter(
    (p) => p.alert === "back-on-market" && p.statusOverride !== "review",
  );

  // ── A. Recorded as gone, still carrying a listing URL — re-check live ───────
  const flaggedIds = new Set(alreadyFlagged.map((p) => p.id));
  const candidates = properties
    .filter((p) => !flaggedIds.has(p.id) && p.listingUrl && scope.includes(p.marketStatus || ""))
    .sort((a, b) => (a.statusCheckedAt || "").localeCompare(b.statusCheckedAt || ""))
    .slice(0, CHECK_CAP);

  const now = new Date().toISOString();

  for (const p of alreadyFlagged) {
    relisted.push({
      id: p.id,
      name: p.name,
      town: p.town,
      guidePrice: p.guidePrice ?? null,
      listingUrl: p.listingUrl || "",
      previousStatus: p.marketStatus || "",
      via: "alert",
    });
    if (!dry) await updateProperty(p.id, { statusOverride: "review" }).catch(() => {});
  }

  await pool(candidates, CONCURRENCY, async (p) => {
    let status = "";
    try {
      status = await checkMarketStatus(p.listingUrl as string, false);
    } catch {
      status = "";
    }
    if (!status) {
      // Unreadable (blocked / removed) — leave the record alone, no false alert.
      unreadable.push({ id: p.id, name: p.name, listingUrl: p.listingUrl as string });
      return;
    }
    if (status !== "For Sale") {
      if (!dry) await updateProperty(p.id, { statusCheckedAt: now }).catch(() => {});
      return;
    }
    relisted.push({
      id: p.id,
      name: p.name,
      town: p.town,
      guidePrice: p.guidePrice ?? null,
      listingUrl: p.listingUrl as string,
      previousStatus: p.marketStatus || "",
      via: "recheck",
    });
    if (!dry) {
      await updateProperty(p.id, {
        marketStatus: "For Sale",
        alert: "back-on-market",
        statusCheckedAt: now,
        statusOverride: "review",
      }).catch(() => {});
    }
  });

  return NextResponse.json({
    ok: true,
    dry,
    scope: scope.join(", "),
    pipelineTotal: properties.length,
    checked: candidates.length,
    relisted,
    unreadable,
    markedReview: dry ? 0 : relisted.length,
  });
}
