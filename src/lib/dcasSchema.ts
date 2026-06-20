import type { Dcas, DcasSection } from "./types";

// The exact DCAS questions from the "Input" sheet, grouped by section.
export const DCAS_SCHEMA: { key: string; title: string; items: { id: string; label: string }[] }[] = [
  {
    key: "price",
    title: "Price",
    items: [{ id: "purchase_price", label: "What is the purchase price of the source property?" }],
  },
  {
    key: "planning",
    title: "Planning",
    items: [
      { id: "planning_status", label: "What is the planning status of the project?" },
      { id: "policy_objection", label: "Are there any obvious planning policy objection issues?" },
      { id: "neighbour_objection", label: "Are there any obvious neighbour objection issues?" },
      { id: "restrictive_covenants", label: "Are there any restrictive covenants?" },
      { id: "title_straightforward", label: "Is the title straightforward?" },
    ],
  },
  {
    key: "site",
    title: "Site",
    items: [
      { id: "build_type", label: "What type of build is it?" },
      { id: "distance_to_home", label: "How close to home is the site?" },
      { id: "complex_site", label: "Is it a complex site to build on?" },
      { id: "construction_access", label: "Is construction access, scaffolding, etc. an issue?" },
      { id: "new_build_required", label: "Any new build required?" },
      { id: "demolition_required", label: "Any demolition required?" },
      { id: "site_contamination", label: "Are there any site contamination concerns?" },
      { id: "asbestos", label: "Is asbestos likely to be an issue?" },
      { id: "nearby_contamination", label: "Are there any nearby contamination hazards?" },
      { id: "industrial_history", label: "Any heavy industrial history on site?" },
    ],
  },
  {
    key: "location",
    title: "Location",
    items: [
      { id: "resident_outlook", label: "How good is the outlook for residents?" },
      { id: "noise_pollution", label: "Any noise pollution?" },
      { id: "transport_links", label: "Transport links?" },
      { id: "amenities", label: "Amenities?" },
      { id: "local_pipeline", label: "What else is being built locally (check planning portal)?" },
      { id: "oversupply", label: "Is there an over-supply of proposed unit type locally?" },
      { id: "demand", label: "Is there a strong demand for proposed unit type locally?" },
      { id: "environment_type", label: "Type of environment?" },
    ],
  },
  {
    key: "deal",
    title: "Deal",
    items: [
      { id: "deal_complexity", label: "How complex is the deal?" },
      { id: "deal_source", label: "Source of deal?" },
      { id: "time_on_market", label: "Time on market?" },
      { id: "competition", label: "Competition?" },
      { id: "difficult_vendor", label: "Difficult vendor/agent?" },
    ],
  },
  {
    key: "investors",
    title: "Investors",
    items: [
      { id: "avg_gdv_per_unit", label: "What is the average GDV per unit?" },
      { id: "max_gdv_per_unit", label: "What is the maximum GDV per unit?" },
      { id: "residential_unit_type", label: "What residential unit type is being built?" },
      { id: "commercial_units", label: "Are there any commercial units being built?" },
      { id: "jv_finance", label: "JV Finance amount required?" },
    ],
  },
];

export function emptyDcas(opportunity = "", description = "", date = ""): Dcas {
  const sections: DcasSection[] = DCAS_SCHEMA.map((s) => ({
    key: s.key,
    title: s.title,
    items: s.items.map((i) => ({ id: i.id, label: i.label, rating: null, note: "" })),
  }));
  return {
    opportunity,
    description,
    date: date || new Date().toISOString().slice(0, 10),
    sections,
    overallComments: "",
  };
}

// DCAS completeness + score summary.
export function dcasStats(dcas?: Dcas) {
  const items = dcas?.sections.flatMap((s) => s.items) ?? [];
  const total = items.length;
  const answered = items.filter((i) => i.rating !== null).length;
  const criticals = items.filter((i) => i.rating === 1).length;
  const concerning = items.filter((i) => i.rating === 2).length;
  const ratedValues = items.filter((i) => i.rating !== null).map((i) => i.rating as number);
  const avg = ratedValues.length ? ratedValues.reduce((a, b) => a + b, 0) / ratedValues.length : 0;
  return {
    total,
    answered,
    unknown: total - answered,
    completionPct: total ? answered / total : 0,
    criticals,
    concerning,
    avgRating: avg,
  };
}
