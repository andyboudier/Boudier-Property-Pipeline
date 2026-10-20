import "server-only";

// ──────────────────────────────────────────────────────────────────────────
// Council / planning constraints — planning.data.gov.uk (MHCLG Planning Data).
//
// Open Government Licence, no API key, no account. This is the same source the
// GoPlanner appraisal app is built on, so the two share a data source without
// sharing credentials — there are none to share.
//
// Deliberately standalone (no imports from this app) so it can be lifted into
// GoPlanner as-is. Every result carries its source and the date it was read,
// because an absence of records is NOT proof a constraint doesn't exist:
// coverage varies by local authority. Callers must render "not identified"
// rather than "none".
// ──────────────────────────────────────────────────────────────────────────

const BASE = "https://www.planning.data.gov.uk";
const SOURCE = "planning.data.gov.uk (MHCLG, OGL)";

/** The constraint layers the freehold map overlays (plan §6) plus the LPA. */
export const CONSTRAINT_DATASETS = [
  "conservation-area",
  "article-4-direction-area",
  "listed-building",
  "listed-building-outline",
  "flood-risk-zone",
  "tree-preservation-zone",
  "brownfield-land",
  "green-belt",
  "local-planning-authority",
] as const;

export type ConstraintDataset = (typeof CONSTRAINT_DATASETS)[number];

export interface PlanningEntity {
  dataset: string;
  name: string;
  reference: string;
  entity: number;
  /** Dataset-specific extras, e.g. flood zone level or Article 4 rules. */
  details: Record<string, unknown>;
}

export interface ConstraintsResult {
  /** Entities grouped by dataset. A dataset absent from here was not matched. */
  byDataset: Record<string, PlanningEntity[]>;
  /** Datasets actually queried — so callers can distinguish "no match" from "not checked". */
  checked: string[];
  source: string;
  readAt: string;
  /** True when a query failed; the result is then incomplete, not empty. */
  partial: boolean;
}

function toEntity(e: Record<string, unknown>): PlanningEntity {
  const known = new Set(["dataset", "name", "reference", "entity", "geometry", "point"]);
  const details: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(e)) {
    if (!known.has(k) && v !== null && v !== "") details[k] = v;
  }
  return {
    dataset: String(e.dataset ?? ""),
    name: String(e.name ?? ""),
    reference: String(e.reference ?? ""),
    entity: typeof e.entity === "number" ? e.entity : 0,
    details,
  };
}

/**
 * Constraints intersecting a point. Queries each dataset separately so one
 * failing dataset doesn't take the rest with it — the result says so via
 * `partial` instead of silently looking clean.
 */
export async function constraintsAt(
  lat: number,
  lng: number,
  datasets: readonly string[] = CONSTRAINT_DATASETS,
): Promise<ConstraintsResult> {
  const byDataset: Record<string, PlanningEntity[]> = {};
  const checked: string[] = [];
  let partial = false;

  await Promise.all(
    datasets.map(async (dataset) => {
      const url =
        `${BASE}/entity.json?longitude=${lng}&latitude=${lat}` +
        `&geometry_relation=intersects&dataset=${encodeURIComponent(dataset)}&limit=50`;
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(20000), next: { revalidate: 86400 } });
        if (!res.ok) {
          partial = true;
          return;
        }
        const json = (await res.json()) as { entities?: Record<string, unknown>[] };
        checked.push(dataset);
        const entities = (json.entities ?? []).map(toEntity);
        if (entities.length) byDataset[dataset] = entities;
      } catch {
        partial = true; // timeout or network — not the same as "no constraint"
      }
    }),
  );

  return { byDataset, checked: checked.sort(), source: SOURCE, readAt: new Date().toISOString(), partial };
}

/** Compact shape for the freehold_candidates.constraints column (plan §5). */
export function summariseConstraints(r: ConstraintsResult) {
  const names = (d: string) => (r.byDataset[d] ?? []).map((e) => e.name).filter(Boolean);
  const listed = [...(r.byDataset["listed-building"] ?? []), ...(r.byDataset["listed-building-outline"] ?? [])];
  return {
    conservationArea: names("conservation-area"),
    article4: names("article-4-direction-area"),
    listedBuilding: listed.map((e) => e.name || e.reference).filter(Boolean),
    floodRiskZone: names("flood-risk-zone"),
    tpo: names("tree-preservation-zone"),
    brownfield: (r.byDataset["brownfield-land"] ?? []).length > 0,
    greenBelt: (r.byDataset["green-belt"] ?? []).length > 0,
    localPlanningAuthority: names("local-planning-authority")[0] ?? null,
    checked: r.checked,
    partial: r.partial,
    source: r.source,
    readAt: r.readAt,
  };
}
