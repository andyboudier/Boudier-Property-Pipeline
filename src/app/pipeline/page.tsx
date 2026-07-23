import Link from "next/link";
import { listProperties, getSettings } from "@/lib/db";
import { evaluateProcedability } from "@/lib/procedability";
import { dcasStats } from "@/lib/dcasSchema";
import { computeIpad } from "@/lib/ipadCalc";
import { SearchTable, type Row } from "@/components/SearchTable";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const [properties, settings] = await Promise.all([listProperties(), getSettings()]);

  const rows: Row[] = properties.map((p) => {
    const result = evaluateProcedability(p, settings);
    const d = dcasStats(p.dcas);
    const ipadOut = p.ipad?.inputs.units.length ? computeIpad(p.ipad.inputs) : null;
    return {
      id: p.id,
      name: p.name,
      marketStatus: p.marketStatus,
      alert: p.alert,
      town: p.town,
      lpa: p.lpa,
      sizeSqFt: p.sizeSqFt,
      guidePrice: p.guidePrice,
      currentUse: p.currentUse,
      status: p.statusOverride ?? result.status,
      autoStatus: result.status,
      overridden: !!p.statusOverride,
      headline: result.headline,
      score: result.score,
      dcasPct: d.total ? d.answered / d.total : 0,
      dcasStarted: d.answered > 0,
      macStarted: !!p.mac?.segments?.some((s) => s.comps.some((c) => c.property.trim() !== "")),
      ipadStarted: !!p.ipad?.inputs.units.length,
      profitOnGdv: ipadOut?.profitOnGdvPct ?? null,
    };
  });

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-serif text-xs uppercase tracking-[0.3em] text-bronze-dark">Acquisition Pipeline</p>
          <h1 className="mt-1 font-serif text-3xl text-ink sm:text-[34px]">Site Appraisal</h1>
          <p className="mt-1 max-w-xl text-sm text-ink-muted">
            Planning &amp; viability screening across the live pipeline. Open a site to work through
            <span className="font-medium text-ink"> DCAS → MAC → IPAD</span>; procedability updates from the criteria you record.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start">
          <Link href="/recover" className="btn-ghost">Recently deleted</Link>
          <Link href="/property/new" className="btn-bronze">+ Add site</Link>
        </div>
      </section>

      <SearchTable rows={rows} />
    </div>
  );
}
