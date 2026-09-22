import Link from "next/link";
import { notFound } from "next/navigation";
import { listLeads, listWatch, getMonitorCriteria } from "@/lib/db";
import { ProspectsBoard } from "@/components/ProspectsBoard";
import { CriteriaEditor } from "@/components/CriteriaEditor";
import { classifyKind, type ProspectKind } from "@/lib/prospectKind";

export const dynamic = "force-dynamic";

const AREAS: Record<ProspectKind, { title: string; blurb: string; other: ProspectKind; otherLabel: string }> = {
  commercial: {
    title: "Commercial Prospects",
    blurb:
      "Pre-pipeline commercial leads — offices, retail, industrial, mixed use and development land. Paste a listing URL and AI reads the page into a prospect; review it, then promote to the pipeline.",
    other: "residential",
    otherLabel: "Residential",
  },
  residential: {
    title: "Residential Prospects",
    blurb:
      "Pre-pipeline residential development stock — land, sites, conversions, blocks and renovation opportunities. Paste a listing URL and AI reads the page into a prospect; review it, then promote to the pipeline.",
    other: "commercial",
    otherLabel: "Commercial",
  },
};

export default async function ProspectsAreaPage({ params }: { params: { kind: string } }) {
  const kind = params.kind as ProspectKind;
  if (kind !== "commercial" && kind !== "residential") notFound();
  const area = AREAS[kind];

  const [leads, watch, criteria] = await Promise.all([listLeads(), listWatch(), getMonitorCriteria()]);
  // Leads saved before the split have no kind — classify them on the fly so
  // nothing disappears from view.
  const mine = leads.filter((l) => (l.kind ?? classifyKind(l)) === kind);
  const others = leads.length - mine.length;
  const watchForArea = watch.filter((w) => (w.kind ?? "commercial") === kind);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="text-xs text-ink-muted hover:text-bronze-dark">← Home</Link>
        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="font-serif text-2xl text-ink">{area.title}</h1>
          <Link href={`/prospects/${area.other}`} className="btn-ghost text-xs">
            {area.otherLabel} prospects ({others}) →
          </Link>
        </div>
        <p className="text-sm text-ink-muted">{area.blurb}</p>
      </div>
      <ProspectsBoard initialLeads={mine} initialWatch={watchForArea} kind={kind} />
      <CriteriaEditor initial={criteria} />
    </div>
  );
}
