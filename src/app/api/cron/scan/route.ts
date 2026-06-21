import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const LISTING_HINT = /\b(property|properties|details|for-sale|to-let|commercial|listing)\b/i;

function extractListingLinks(content: string, baseUrl: string): string[] {
  const out = new Set<string>();
  const add = (href: string) => {
    try {
      const u = new URL(href, baseUrl).toString().split("#")[0];
      if (LISTING_HINT.test(u)) out.add(u);
    } catch {
      /* ignore bad href */
    }
  };
  for (const m of content.matchAll(/href=["']([^"']+)["']/gi)) add(m[1]); // HTML
  for (const m of content.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)) add(m[1]); // markdown
  return [...out].slice(0, 50);
}

export async function GET(req: NextRequest) {
  // Auth: require CRON_SECRET (Vercel Cron sends it as a Bearer token); also
  // allow Vercel's own cron header. If unset, the monitor is considered off.
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "CRON_SECRET not configured" }, { status: 503 });
  const authed = req.headers.get("authorization") === `Bearer ${secret}` || req.headers.get("x-vercel-cron") != null;
  if (!authed) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { listWatch, touchWatch, leadExistsForUrl, addLead, listProperties, getMonitorCriteria } = await import("@/lib/db");
  const { importListing, fetchRawContent } = await import("@/lib/importListing");
  const { matchesCriteria } = await import("@/lib/monitorCriteria");

  const watches = await listWatch();
  const criteria = await getMonitorCriteria();
  const knownUrls = new Set((await listProperties()).map((p) => p.listingUrl).filter(Boolean) as string[]);

  const CAP = 8; // bound AI/scraper cost per run
  let created = 0;
  let skipped = 0;
  const results: { watch: string; links?: number; added?: number; skipped?: number; error?: string }[] = [];

  for (const w of watches) {
    await touchWatch(w.id);
    const content = await fetchRawContent(w.url);
    if (!content) {
      results.push({ watch: w.label, error: "unreachable" });
      continue;
    }
    const links = extractListingLinks(content, w.url).filter((u) => u !== w.url);
    let added = 0;
    let wSkipped = 0;
    for (const link of links) {
      if (created >= CAP) break;
      if (knownUrls.has(link) || (await leadExistsForUrl(link))) continue;
      try {
        const res = await importListing({ url: link });
        if (res.ok && res.fields.name) {
          // Apply the user's monitor criteria before adding a prospect.
          const verdict = matchesCriteria(res.fields, criteria);
          if (!verdict.include) {
            wSkipped++;
            skipped++;
            knownUrls.add(link);
            continue;
          }
          await addLead({
            status: "new",
            source: res.fields.listingSource || res.source || w.label,
            url: link,
            name: res.fields.name,
            town: res.fields.town || "",
            guidePrice: res.fields.guidePrice ?? null,
            sizeSqFt: res.fields.sizeSqFt ?? null,
            pricePerSqFt: res.fields.pricePerSqFt ?? null,
            currentUse: res.fields.currentUse || "",
            notes: res.fields.notes || "",
            imageUrl: res.fields.imageUrl || "",
            createdAt: new Date().toISOString(),
          });
          knownUrls.add(link);
          added++;
          created++;
        }
      } catch {
        /* skip this link */
      }
    }
    results.push({ watch: w.label, links: links.length, added, skipped: wSkipped });
  }

  return NextResponse.json({ ok: true, scanned: watches.length, created, skipped, results });
}
