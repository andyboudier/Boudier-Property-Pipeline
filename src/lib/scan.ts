import "server-only";
import type { MarketAlert } from "./types";
import {
  listWatch,
  touchWatch,
  leadExistsForUrl,
  addLead,
  listProperties,
  listLeads,
  getMonitorCriteria,
  updateLead,
  updateProperty,
  ignoredUrlSet,
} from "./db";
import { importListing, fetchRawContent, checkMarketStatus } from "./importListing";
import { matchesCriteria } from "./monitorCriteria";

// A URL must look like an individual listing page to be a candidate.
const LISTING_HINT = /(\/propert(y|ies)\/|\/details\/|\/listing\/|\/unit)/i;
// …and must NOT be an asset, form, or index/category/search/pagination page.
const NON_LISTING =
  /\.(css|js|mjs|json|jpe?g|png|gif|svg|webp|ico|pdf|woff2?|ttf|eot|mp4|zip)(\?|$)|\/(property-enquiry|enquiry|property-search|search|find-agents?|register|sign-in|log-?in|account|saved|contact|about|news|blog|privacy|cookies?|terms|team|service|sectors?|cost-calculator|valuation)(\/|$|\?)|\/page\/\d+|recently-(sold|let)|\/feed\/|\/rss\b|\/css\/|\/wp-(content|admin)\/|\/propert(y|ies)\/?(\?|$)/i;

// Portal listing-detail signatures (everything else from a portal host is a
// category/search page we don't want).
function portalDetail(u: string): boolean | null {
  let h = "";
  try {
    h = new URL(u).hostname;
  } catch {
    return null;
  }
  if (/rightmove\./i.test(h)) return /\/properties\/\d{5,}/.test(u);
  if (/zoopla\./i.test(h)) return /\/details\/\d{5,}/.test(u);
  if (/onthemarket\./i.test(h)) return /\/details\/\d{5,}/.test(u);
  return null; // not a known portal
}

const NEW_CAP = 6; // new prospects added per run (each costs an AI call)
const EXAMINE_CAP = 40; // candidate links inspected per run before the NEW_CAP cut
const PORTAL_PER_RUN = 3; // portal pages (slow stealth scrape) fetched per run, rotating
const RECHECK_CAP = 10; // tracked listings re-checked per run (cheap, no AI)

function extractListingLinks(content: string, baseUrl: string): string[] {
  const out = new Set<string>();
  const add = (href: string) => {
    try {
      const u = new URL(href, baseUrl).toString().split("#")[0];
      if (NON_LISTING.test(u)) return;
      const portal = portalDetail(u);
      if (portal === false) return; // a portal page that isn't a listing detail
      if (portal === true) {
        out.add(u);
        return;
      }
      if (LISTING_HINT.test(u)) out.add(u); // non-portal agent listing
    } catch {
      /* ignore */
    }
  };
  for (const m of content.matchAll(/href=["']([^"']+)["']/gi)) add(m[1]); // HTML anchors
  for (const m of content.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)) add(m[1]); // markdown links
  // Portals (Rightmove/Zoopla/OnTheMarket) render listings via JSON/JS, so their
  // links aren't in <a href>. Mine the listing-URL patterns straight from text:
  for (const m of content.matchAll(/(?:https?:\/\/[^\s"'<>)\]]*)?\/properties\/\d{5,}/g)) add(m[0]); // Rightmove
  for (const m of content.matchAll(/https?:\/\/[^\s"'<>)\]]*\/details\/\d{5,}\/?/g)) add(m[0]); // Zoopla / OnTheMarket
  return [...out].slice(0, 80);
}

const GONE = (s?: string) => s === "Sold" || s === "Under Offer" || s === "Withdrawn";

// Decide whether a status change warrants alerting the user.
function alertFor(prev: string | undefined, next: string): MarketAlert {
  if (!next) return null; // couldn't read it — treat as no change
  if (!GONE(prev) && (next === "Sold" || next === "Under Offer")) return "sold";
  if (GONE(prev) && next === "For Sale") return "back-on-market";
  return null;
}

export interface ScanSummary {
  ok: true;
  scanned: number;
  created: number;
  skipped: number;
  rechecked: number;
  alerts: { name: string; kind: MarketAlert; status: string; where: "prospect" | "pipeline" }[];
  watchStats: { watch: string; url: string; found: number; fresh: number; reachable: boolean }[];
  examined: { url: string; name: string; ok: boolean; reasons: string[] }[];
}

export async function runScan(): Promise<ScanSummary> {
  const [watches, criteria, properties, leads, ignored] = await Promise.all([
    listWatch(),
    getMonitorCriteria(),
    listProperties(),
    listLeads(),
    ignoredUrlSet(),
  ]);
  const knownUrls = new Set(properties.map((p) => p.listingUrl).filter(Boolean) as string[]);

  // ── A. Discover new prospects from watched agent pages ─────────────────────
  async function discover(): Promise<{ created: number; skipped: number; watchStats: ScanSummary["watchStats"]; examined: ScanSummary["examined"] }> {
    if (watches.length === 0) return { created: 0, skipped: 0, watchStats: [], examined: [] };
    const t0 = Date.now();
    const isPortal = (u: string) => /(rightmove|zoopla|onthemarket)\./i.test(u);
    // Portal pages need the slow stealth scraper, so only do a few per run
    // (oldest-scanned first) to stay inside the 60s budget; they rotate over runs.
    const portalWatches = watches.filter((w) => isPortal(w.url)).sort((a, b) => (a.lastScanAt || "").localeCompare(b.lastScanAt || ""));
    const otherWatches = watches.filter((w) => !isPortal(w.url));
    const toFetch = [...otherWatches, ...portalWatches.slice(0, PORTAL_PER_RUN)];
    const pages = await Promise.all(
      toFetch.map(async (w) => {
        await touchWatch(w.id);
        const content = await fetchRawContent(w.url).catch(() => null);
        return { w, content };
      }),
    );

    // Collect fresh candidates per watch (deduped against each other + what we
    // already hold or have ignored).
    const seen = new Set<string>();
    const perWatch: { label: string; links: string[] }[] = [];
    const watchStats: ScanSummary["watchStats"] = [];
    for (const { w, content } of pages) {
      const links: string[] = [];
      let total = 0;
      if (content) {
        for (const link of extractListingLinks(content, w.url)) {
          if (link === w.url) continue;
          total++;
          if (seen.has(link) || knownUrls.has(link) || ignored.has(link)) continue;
          seen.add(link);
          links.push(link);
        }
      }
      perWatch.push({ label: w.label, links });
      watchStats.push({ watch: w.label, url: w.url, found: total, fresh: links.length, reachable: !!content });
    }

    // Round-robin across watches so every source is sampled each run, not just
    // whichever ones happen to come first.
    const ordered: string[] = [];
    for (let i = 0; ordered.length < EXAMINE_CAP; i++) {
      let any = false;
      for (const pw of perWatch) {
        if (pw.links[i] != null) {
          ordered.push(pw.links[i]);
          any = true;
          if (ordered.length >= EXAMINE_CAP) break;
        }
      }
      if (!any) break;
    }

    const exists = await Promise.all(ordered.map((u) => leadExistsForUrl(u).catch(() => false)));
    const fresh = ordered.filter((_, i) => !exists[i]).slice(0, NEW_CAP);

    let created = 0;
    let skipped = 0;
    const examined: ScanSummary["examined"] = [];
    await Promise.all(
      fresh.map(async (url) => {
        try {
          // Stay within the 60s function budget: don't start a slow stealth
          // portal import late, and stop all imports near the deadline.
          if (Date.now() > t0 + 50000 || (isPortal(url) && Date.now() > t0 + 32000)) {
            examined.push({ url, name: "", ok: false, reasons: ["skipped: time budget"] });
            return;
          }
          const res = await importListing({ url });
          if (!res.ok || !res.fields.name) {
            examined.push({ url, name: res.fields?.name || "", ok: false, reasons: [res.blocked ? "blocked/unreadable" : "no data extracted"] });
            return;
          }
          const verdict = matchesCriteria(res.fields, criteria);
          examined.push({ url, name: res.fields.name, ok: verdict.include, reasons: verdict.reasons });
          if (!verdict.include) {
            skipped++;
            return;
          }
          await addLead({
            status: "new",
            source: res.fields.listingSource || res.source || "Web",
            url,
            name: res.fields.name,
            town: res.fields.town || "",
            guidePrice: res.fields.guidePrice ?? null,
            sizeSqFt: res.fields.sizeSqFt ?? null,
            pricePerSqFt: res.fields.pricePerSqFt ?? null,
            currentUse: res.fields.currentUse || "",
            notes: res.fields.notes || "",
            imageUrl: res.fields.imageUrl || "",
            marketStatus: res.fields.marketStatus || "",
            statusCheckedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
          });
          created++;
        } catch {
          examined.push({ url, name: "", ok: false, reasons: ["error"] });
        }
      }),
    );
    return { created, skipped, watchStats, examined };
  }

  // ── B. Re-check availability of listings we're already tracking ────────────
  async function recheck(): Promise<ScanSummary["alerts"]> {
    type Item = { url: string; name: string; prev?: string; checkedAt?: string; where: "prospect" | "pipeline"; save: (s: string, a: MarketAlert) => Promise<void> };
    const items: Item[] = [];
    for (const l of leads) {
      if ((l.status === "new" || l.status === "reviewing") && l.url) {
        items.push({
          url: l.url,
          name: l.name,
          prev: l.marketStatus,
          checkedAt: l.statusCheckedAt,
          where: "prospect",
          save: (s, a) => updateLead(l.id, { marketStatus: s, statusCheckedAt: new Date().toISOString(), ...(a ? { alert: a } : {}) }),
        });
      }
    }
    for (const p of properties) {
      if (p.listingUrl) {
        items.push({
          url: p.listingUrl,
          name: p.name,
          prev: p.marketStatus,
          checkedAt: p.statusCheckedAt,
          where: "pipeline",
          save: (s, a) => updateProperty(p.id, { marketStatus: s, statusCheckedAt: new Date().toISOString(), ...(a ? { alert: a } : {}) }),
        });
      }
    }
    // Oldest-checked (and never-checked) first, so we cycle through over days.
    items.sort((a, b) => (a.checkedAt || "").localeCompare(b.checkedAt || ""));
    const batch = items.slice(0, RECHECK_CAP);

    const alerts: ScanSummary["alerts"] = [];
    await Promise.all(
      batch.map(async (it) => {
        try {
          const status = await checkMarketStatus(it.url, false);
          if (!status) return; // unreadable — leave as-is, no false alert
          const a = alertFor(it.prev, status);
          await it.save(status, a);
          if (a) alerts.push({ name: it.name, kind: a, status, where: it.where });
        } catch {
          /* skip */
        }
      }),
    );
    return alerts;
  }

  const [disc, alerts] = await Promise.all([discover(), recheck()]);
  return {
    ok: true,
    scanned: watches.length,
    created: disc.created,
    skipped: disc.skipped,
    rechecked: Math.min(RECHECK_CAP, leads.filter((l) => (l.status === "new" || l.status === "reviewing") && l.url).length + properties.filter((p) => p.listingUrl).length),
    alerts,
    watchStats: disc.watchStats,
    examined: disc.examined,
  };
}
