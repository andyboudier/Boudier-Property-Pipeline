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

const LISTING_HINT = /\b(property|properties|details|for-sale|to-let|commercial|listing)\b/i;
const NEW_CAP = 6; // new prospects discovered per run (each costs an AI call)
const RECHECK_CAP = 10; // tracked listings re-checked per run (cheap, no AI)

function extractListingLinks(content: string, baseUrl: string): string[] {
  const out = new Set<string>();
  const add = (href: string) => {
    try {
      const u = new URL(href, baseUrl).toString().split("#")[0];
      if (LISTING_HINT.test(u)) out.add(u);
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
  async function discover(): Promise<{ created: number; skipped: number }> {
    if (watches.length === 0) return { created: 0, skipped: 0 };
    const pages = await Promise.all(
      watches.map(async (w) => {
        await touchWatch(w.id);
        const content = await fetchRawContent(w.url).catch(() => null);
        return { w, content };
      }),
    );
    const seen = new Set<string>();
    const candidates: string[] = [];
    for (const { w, content } of pages) {
      if (!content) continue;
      for (const link of extractListingLinks(content, w.url)) {
        if (link === w.url || seen.has(link) || knownUrls.has(link) || ignored.has(link)) continue;
        seen.add(link);
        candidates.push(link);
      }
    }
    const head = candidates.slice(0, 30);
    const exists = await Promise.all(head.map((u) => leadExistsForUrl(u).catch(() => false)));
    const fresh = head.filter((_, i) => !exists[i]).slice(0, NEW_CAP);

    let created = 0;
    let skipped = 0;
    await Promise.all(
      fresh.map(async (url) => {
        try {
          const res = await importListing({ url });
          if (!res.ok || !res.fields.name) return;
          if (!matchesCriteria(res.fields, criteria).include) {
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
          /* skip */
        }
      }),
    );
    return { created, skipped };
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
          const status = await checkMarketStatus(it.url);
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
  };
}
