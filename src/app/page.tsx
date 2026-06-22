import Link from "next/link";
import { listProperties, getSettings } from "@/lib/db";
import { evaluateProcedability } from "@/lib/procedability";
import { dcasStats } from "@/lib/dcasSchema";
import { computeIpad } from "@/lib/ipadCalc";
import { SearchTable, type Row } from "@/components/SearchTable";

export const dynamic = "force-dynamic";

export default async function HomePage() {
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

  const counts = {
    total: rows.length,
    proceedable: rows.filter((r) => r.status === "proceedable").length,
    review: rows.filter((r) => r.status === "review").length,
    notProceedable: rows.filter((r) => r.status === "not-proceedable").length,
    sold: rows.filter((r) => r.status === "sold").length,
  };

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

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Sites" value={counts.total} color="#16202B" />
        <Stat label="Proceedable" value={counts.proceedable} color="#2E7D5B" />
        <Stat label="Review" value={counts.review} color="#C2872B" />
        <Stat label="Not proceedable" value={counts.notProceedable} color="#B23A48" />
        <Stat label="Sold" value={counts.sold} color="#4F6D7A" />
      </section>

      <SearchTable rows={rows} />
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="card px-4 py-3">
      <div className="text-2xl font-semibold" style={{ color }}>{value}</div>
      <div className="text-xs uppercase tracking-wide text-ink-muted">{label}</div>
    </div>
  );
}
