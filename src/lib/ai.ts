import "server-only";
import type { ImportedDraft } from "./importListing";

// AI extraction via Claude (Haiku) — reads messy listing text/HTML and returns
// structured fields. Robust to any site layout. Inert without ANTHROPIC_API_KEY.

const MODEL = "claude-haiku-4-5";

export function isAIConfigured() {
  return !!process.env.ANTHROPIC_API_KEY;
}

// Reduce HTML to text to cut tokens (and cost) before sending to the model.
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&pound;/g, "£")
    .replace(/&#163;/g, "£")
    .replace(/\s+/g, " ")
    .trim();
}

const EXTRACT_TOOL = {
  name: "record_property",
  description: "Record the property listing details extracted from the page.",
  input_schema: {
    type: "object" as const,
    properties: {
      name: { type: "string", description: "Property address or listing title" },
      town: { type: "string", description: "Town or city" },
      guidePrice: { type: ["number", "null"], description: "Sale/guide price in GBP, digits only (no £ or commas). Null if rent-only or on application." },
      rent: { type: ["string", "null"], description: "Rent if quoted, e.g. '£45,000 per annum'. Null if none." },
      sizeSqFt: { type: ["number", "null"], description: "Floor area in square feet, digits only. Null if unknown." },
      currentUse: { type: "string", description: "Property type / planning use class / tenure, e.g. 'Offices (Class E), leasehold'." },
      description: { type: "string", description: "A 1-3 sentence summary of the property." },
      imageUrl: { type: ["string", "null"], description: "URL of the main photo if present in the content." },
    },
    required: ["name"],
  },
};

export async function extractWithAI(content: string, sourceHint?: string): Promise<Partial<ImportedDraft> | null> {
  if (!isAIConfigured() || !content.trim()) return null;
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic();

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    tools: [EXTRACT_TOOL],
    tool_choice: { type: "tool", name: "record_property" },
    messages: [
      {
        role: "user",
        content:
          `Extract the property listing details from this ${sourceHint || "property"} page. ` +
          `Distinguish the SALE/guide price from any RENT. Prices in GBP, digits only.\n\n---\n` +
          content.slice(0, 60000),
      },
    ],
  });

  const block = msg.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") return null;
  const d = block.input as Record<string, unknown>;

  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const rent = str(d.rent);
  const desc = str(d.description);

  return {
    name: str(d.name),
    town: str(d.town),
    guidePrice: num(d.guidePrice),
    sizeSqFt: num(d.sizeSqFt),
    currentUse: str(d.currentUse),
    notes: [rent ? `Rent: ${rent}` : "", desc].filter(Boolean).join("\n").slice(0, 800),
    imageUrl: str(d.imageUrl),
  };
}
