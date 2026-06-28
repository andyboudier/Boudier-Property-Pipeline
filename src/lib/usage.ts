import "server-only";
import { listProperties, listLeads, listContacts, listWatch } from "./db";

export interface FirecrawlUsage {
  ok: boolean;
  remainingCredits?: number;
  planCredits?: number;
  remainingTokens?: number;
  planTokens?: number;
  periodEnd?: string;
}

export async function getFirecrawlUsage(): Promise<FirecrawlUsage> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) return { ok: false };
  const h = { Authorization: `Bearer ${key}` };
  const get = (path: string) =>
    fetch(`https://api.firecrawl.dev${path}`, { headers: h, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  try {
    const [c, t] = await Promise.all([get("/v1/team/credit-usage"), get("/v1/team/token-usage")]);
    const cd = c?.data;
    const td = t?.data;
    if (!cd && !td) return { ok: false };
    return {
      ok: true,
      remainingCredits: cd?.remaining_credits,
      planCredits: cd?.plan_credits,
      remainingTokens: td?.remaining_tokens,
      planTokens: td?.plan_tokens,
      periodEnd: cd?.billing_period_end,
    };
  } catch {
    return { ok: false };
  }
}

export async function getFirestoreCounts() {
  try {
    const [p, l, c, w] = await Promise.all([listProperties(), listLeads(), listContacts(), listWatch()]);
    return { ok: true, properties: p.length, prospects: l.length, contacts: c.length, watches: w.length };
  } catch {
    return { ok: false, properties: 0, prospects: 0, contacts: 0, watches: 0 };
  }
}

// Which scraper the import/monitor will use. Firecrawl is primary; Tavily is the
// fallback used automatically when Firecrawl returns nothing (e.g. out of credits).
export function scraperStatus() {
  return {
    firecrawl: !!process.env.FIRECRAWL_API_KEY,
    tavily: !!process.env.TAVILY_API_KEY,
  };
}
