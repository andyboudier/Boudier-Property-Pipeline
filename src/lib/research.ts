import "server-only";
import type { Property } from "./types";
import { DCAS_SCHEMA } from "./dcasSchema";

// AI research agent — researches a property (with web search when available) and
// returns structured pre-fills for a section plus a free-text "notes" of useful
// findings. Estimate-quality: a researched starting draft, not gospel.

const MODEL = "claude-sonnet-4-6";

function isAI() {
  return !!process.env.ANTHROPIC_API_KEY;
}

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
};

async function quickText(url: string): Promise<string> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, { headers: HEADERS, signal: ctrl.signal, redirect: "follow" });
    clearTimeout(t);
    if (!res.ok) return "";
    const html = await res.text();
    const { htmlToText } = await import("./ai");
    return htmlToText(html).slice(0, 5000);
  } catch {
    return "";
  }
}

async function propertyContext(p: Property): Promise<string> {
  const lines = [
    `Address / site name: ${p.name || "(unknown)"}`,
    p.town ? `Town: ${p.town}` : "",
    p.lpa ? `Local planning authority (LPA): ${p.lpa}` : "",
    p.guidePrice != null ? `Guide / asking price: £${p.guidePrice.toLocaleString()}` : "",
    p.sizeSqFt != null ? `Size: ${p.sizeSqFt} sq ft (~${Math.round(p.sizeSqFt * 0.092903)} m²)` : "",
    p.currentUse ? `Current use: ${p.currentUse}` : "",
    p.listingUrl ? `Listing URL: ${p.listingUrl}` : "",
    p.notes ? `Existing notes: ${p.notes.slice(0, 1500)}` : "",
  ].filter(Boolean);
  if (p.listingUrl) {
    const txt = await quickText(p.listingUrl);
    if (txt && txt.length > 200) lines.push(`\nListing page extract:\n${txt}`);
  }
  return lines.join("\n");
}

type AnyTool = { name: string; description: string; input_schema: Record<string, unknown> };

function pickTool(msg: { content?: { type: string; name?: string; input?: unknown }[] }, name: string): Record<string, unknown> | null {
  const b = msg.content?.find((x) => x.type === "tool_use" && x.name === name);
  return b ? (b.input as Record<string, unknown>) : null;
}
function textOf(msg: { content?: { type: string; text?: string }[] }): string {
  return (msg.content || [])
    .filter((x) => x.type === "text")
    .map((x) => x.text || "")
    .join("\n");
}

// Run one research call: prefer web search + structured tool; fall back to a
// forced knowledge-only call if web search isn't available.
async function runResearch(system: string, user: string, tool: AnyTool): Promise<Record<string, unknown> | null> {
  if (!isAI()) return null;
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic();
  const webTool = { type: "web_search_20250305", name: "web_search", max_uses: 4 };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const create = (body: Record<string, unknown>) => client.messages.create(body as any) as unknown as Promise<{ content?: { type: string; name?: string; text?: string; input?: unknown }[] }>;

  try {
    const msg = await create({ model: MODEL, max_tokens: 4096, system, tools: [webTool, tool], messages: [{ role: "user", content: user }] });
    const out = pickTool(msg, tool.name);
    if (out) return out;
    // It researched but answered in prose — force the tool with what it found.
    const forced = await create({
      model: MODEL,
      max_tokens: 4096,
      system,
      tools: [tool],
      tool_choice: { type: "tool", name: tool.name },
      messages: [{ role: "user", content: `${user}\n\nResearch findings so far:\n${textOf(msg).slice(0, 4000)}\n\nRecord them via the tool now.` }],
    });
    return pickTool(forced, tool.name);
  } catch {
    // Web search unavailable → knowledge-only best estimate.
    try {
      const msg = await create({
        model: MODEL,
        max_tokens: 4096,
        system,
        tools: [tool],
        tool_choice: { type: "tool", name: tool.name },
        messages: [{ role: "user", content: `${user}\n\n(You may not have web access — use your best professional estimates and clearly note assumptions.)` }],
      });
      return pickTool(msg, tool.name);
    } catch {
      return null;
    }
  }
}

const ANALYST =
  "You are a UK residential/commercial property development analyst working for Boudier Property. " +
  "Research the specific property below using web search where possible — the agent's listing, the local planning authority's planning portal (recent/nearby applications), Land Registry / sold prices, and comparable listings on Rightmove/Zoopla/OnTheMarket. " +
  "Be concrete and evidence-based; where you must estimate, say so. Use GBP. Today's market.";

// ── DCAS ─────────────────────────────────────────────────────────────────────
export interface DcasResearch {
  items: { id: string; rating: number | null; note: string }[];
  notes: string;
}
export async function researchDcas(p: Property): Promise<DcasResearch | null> {
  const ctx = await propertyContext(p);
  const itemList = DCAS_SCHEMA.flatMap((s) => s.items.map((i) => `- ${i.id}: ${i.label} (section: ${s.title})`)).join("\n");
  const tool: AnyTool = {
    name: "record_dcas",
    description: "Record the researched DCAS assessment.",
    input_schema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "The criterion id from the list" },
              rating: { type: ["integer", "null"], description: "1 = critical/poor … 5 = excellent. Null if it can't be reasonably judged." },
              note: { type: "string", description: "1-2 sentence evidence/justification" },
            },
            required: ["id"],
          },
        },
        notes: { type: "string", description: "Useful findings worth recording on the deal (planning history, area, market, risks, opportunities)." },
      },
      required: ["items"],
    },
  };
  const out = await runResearch(
    ANALYST,
    `Assess this property against the DCAS deal-criteria checklist. Rate each criterion 1-5 (1 critical/poor, 5 excellent) with a brief justification, or null where it genuinely can't be judged.\n\nPROPERTY:\n${ctx}\n\nCRITERIA (use these exact ids):\n${itemList}`,
    tool,
  );
  if (!out) return null;
  const items = Array.isArray(out.items)
    ? (out.items as Record<string, unknown>[]).map((i) => ({
        id: String(i.id || ""),
        rating: typeof i.rating === "number" ? (Math.max(1, Math.min(5, Math.round(i.rating))) as number) : null,
        note: typeof i.note === "string" ? i.note : "",
      }))
    : [];
  return { items, notes: typeof out.notes === "string" ? out.notes : "" };
}

// ── MAC ──────────────────────────────────────────────────────────────────────
export interface MacResearch {
  searchArea: string;
  propertyType: string;
  comps: {
    property: string;
    area: string;
    askingPrice: number | null;
    beds: number | null;
    propertyType: string;
    totalM2: number | null;
    status: string;
    agent: string;
    onMarketSince: string;
    link: string;
    comments: string;
  }[];
  notes: string;
}
export async function researchMac(p: Property): Promise<MacResearch | null> {
  const ctx = await propertyContext(p);
  const tool: AnyTool = {
    name: "record_mac",
    description: "Record researched market-comparable listings near the property.",
    input_schema: {
      type: "object",
      properties: {
        searchArea: { type: "string", description: "Search area used (town/postcode)" },
        propertyType: { type: "string", description: "Dominant comparable type" },
        comps: {
          type: "array",
          description: "Up to 6 comparable properties currently on or recently sold in the area.",
          items: {
            type: "object",
            properties: {
              property: { type: "string", description: "Address / name" },
              area: { type: "string", description: "Area or postcode" },
              askingPrice: { type: ["number", "null"] },
              beds: { type: ["integer", "null"] },
              propertyType: { type: "string" },
              totalM2: { type: ["number", "null"] },
              status: { type: "string", description: "For Sale / Sold / Under Offer" },
              agent: { type: "string" },
              onMarketSince: { type: "string", description: "YYYY-MM-DD if known" },
              link: { type: "string", description: "Listing URL if known" },
              comments: { type: "string" },
            },
            required: ["property"],
          },
        },
        notes: { type: "string", description: "Useful market findings (pricing, demand, £/m², days on market, supply)." },
      },
    },
  };
  const out = await runResearch(
    ANALYST,
    `Build a market comparison for this property: find up to 6 genuine comparable listings (similar size/type) currently for sale or recently sold near it, with asking price, beds, size (m²) and status where available. Prefer real, citable listings.\n\nPROPERTY:\n${ctx}`,
    tool,
  );
  if (!out) return null;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const numN = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const comps = Array.isArray(out.comps)
    ? (out.comps as Record<string, unknown>[]).slice(0, 8).map((c) => ({
        property: str(c.property),
        area: str(c.area),
        askingPrice: numN(c.askingPrice),
        beds: numN(c.beds),
        propertyType: str(c.propertyType),
        totalM2: numN(c.totalM2),
        status: str(c.status),
        agent: str(c.agent),
        onMarketSince: str(c.onMarketSince),
        link: str(c.link),
        comments: str(c.comments),
      }))
    : [];
  return { searchArea: str(out.searchArea), propertyType: str(out.propertyType), comps, notes: str(out.notes) };
}

// ── IPAD ─────────────────────────────────────────────────────────────────────
export interface IpadResearch {
  purchasePrice: number | null;
  areaM2: number | null;
  newBuildRatePerM2: number | null;
  commercialRatePerM2: number | null;
  contingencyPct: number | null;
  units: { units: number; m2: number; type: string; totalGdv: number }[];
  notes: string;
}
export async function researchIpad(p: Property): Promise<IpadResearch | null> {
  const ctx = await propertyContext(p);
  const tool: AnyTool = {
    name: "record_ipad",
    description: "Record researched appraisal estimates for the property.",
    input_schema: {
      type: "object",
      properties: {
        purchasePrice: { type: ["number", "null"], description: "Likely purchase price (GBP), from guide/comparables" },
        areaM2: { type: ["number", "null"], description: "Developable / floor area in m²" },
        newBuildRatePerM2: { type: ["number", "null"], description: "New build / refurb cost £ per m² for this location/spec" },
        commercialRatePerM2: { type: ["number", "null"], description: "Commercial conversion cost £ per m², if relevant" },
        contingencyPct: { type: ["number", "null"], description: "Contingency as a fraction, e.g. 0.1 for 10%" },
        units: {
          type: "array",
          description: "Proposed unit mix with estimated GDV (total sale value) per line.",
          items: {
            type: "object",
            properties: {
              units: { type: "integer" },
              m2: { type: "number" },
              type: { type: "string", description: "e.g. '2 Bed Flat'" },
              totalGdv: { type: "number", description: "total GDV for the line (units × unit value)" },
            },
            required: ["type"],
          },
        },
        notes: { type: "string", description: "Assumptions, cost/value evidence, and any useful findings." },
      },
    },
  };
  const out = await runResearch(
    ANALYST,
    `Produce a first-cut financial appraisal for this property. Estimate the likely purchase price, the developable floor area (m²), realistic build/refurb cost per m² for this location and spec, a sensible contingency %, and a proposed unit mix with estimated GDV (sale value) per line, using local sales evidence. State your assumptions in notes.\n\nPROPERTY:\n${ctx}`,
    tool,
  );
  if (!out) return null;
  const numN = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const units = Array.isArray(out.units)
    ? (out.units as Record<string, unknown>[]).slice(0, 12).map((u) => ({
        units: typeof u.units === "number" ? Math.round(u.units) : 1,
        m2: typeof u.m2 === "number" ? u.m2 : 0,
        type: typeof u.type === "string" ? u.type : "",
        totalGdv: typeof u.totalGdv === "number" ? u.totalGdv : 0,
      }))
    : [];
  return {
    purchasePrice: numN(out.purchasePrice),
    areaM2: numN(out.areaM2),
    newBuildRatePerM2: numN(out.newBuildRatePerM2),
    commercialRatePerM2: numN(out.commercialRatePerM2),
    contingencyPct: numN(out.contingencyPct),
    units,
    notes: typeof out.notes === "string" ? out.notes : "",
  };
}

// Append research notes to the property's Notes (with a dated header).
export function appendNotes(existing: string | undefined, section: string, notes: string): string {
  if (!notes.trim()) return existing || "";
  const date = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const header = `— AI research (${section}) · ${date} —`;
  return [(existing || "").trim(), `${header}\n${notes.trim()}`].filter(Boolean).join("\n\n");
}
