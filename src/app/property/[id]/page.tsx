import Link from "next/link";
import { notFound } from "next/navigation";
import { getProperty, getSettings } from "@/lib/db";
import { evaluateProcedability } from "@/lib/procedability";
import { dcasStats } from "@/lib/dcasSchema";
import { computeIpad } from "@/lib/ipadCalc";
import { segmentStats } from "@/lib/macCalc";
import { StatusBadge, ChecksPanel } from "@/components/Procedability";
import { gbp, num, pct, sqftToSqmDisplay } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PropertyOverview({ params }: { params: { id: string } }) {
  const [p, settings] = await Promise.all([getProperty(params.id), getSettings()]);
  if (!p) notFound();

  const result = evaluateProcedability(p, settings);
  const d = dcasStats(p.dcas);
  const ipadOut = p.ipad?.inputs.units.length ? computeIpad(p.ipad.inputs) : null;
  const macSeg = p.mac?.segments?.find((s) => s.comps.some((c) => c.property.trim() !== ""));
  const macStats = macSeg ? segmentStats(macSeg, p.mac?.date ?? "") : null;

  const stages = [
    {
      key: "dcas",
      title: "DCAS",
      subtitle: "Deal Criteria Assessment",
      href: `/property/${p.id}/dcas`,
      started: d.answered > 0,
      progress: d.total ? d.answered / d.total : 0,
      meta: d.answered > 0 ? `${d.answered}/${d.total} answered · ${d.criticals} critical` : "Not started",
    },
    {
      key: "mac",
      title: "MAC",
      subtitle: "Market Area Comparison",
      href: `/property/${p.id}/mac`,
      started: !!macSeg,
      progress: macStats ? Math.min(1, macStats.count / 5) : 0,
      meta: macStats ? `${macStats.count} comps · ${pct(macStats.salesRatio)} sales ratio` : "Not started",
    },
    {
      key: "ipad",
      title: "IPAD",
      subtitle: "Initial Project Appraisal",
      href: `/property/${p.id}/ipad`,
      started: !!ipadOut,
      progress: ipadOut ? 1 : 0,
      meta: ipadOut ? `${pct(ipadOut.profitOnGdvPct)} profit on GDV` : "Not started",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="text-xs text-ink-muted hover:text-bronze-dark">← Pipeline</Link>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="font-serif text-3xl text-ink">{p.name}</h1>
            <p className="mt-1 text-sm text-ink-muted">
              {p.town} · <span className="text-ink-soft">{p.lpa}</span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={result.status} />
            <span className="text-sm text-ink-muted">{result.headline}</span>
          </div>
        </div>
      </div>

      {/* Snapshot */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Fact label="Guide price" value={gbp(p.guidePrice)} />
        <Fact label="Size" value={p.sizeSqFt != null ? `${num(p.sizeSqFt)} ft²` : "—"} sub={sqftToSqmDisplay(p.sizeSqFt)} />
        <Fact label="£ / ft²" value={p.pricePerSqFt != null ? `£${num(p.pricePerSqFt)}` : "—"} />
        <Fact
          label="Profit on GDV"
          value={ipadOut ? pct(ipadOut.profitOnGdvPct) : "—"}
          valueColor={ipadOut ? (ipadOut.profitOnGdvPct >= settings.targetProfitOnGdvPct ? "#2E7D5B" : ipadOut.profitOnGdvPct >= 0 ? "#C2872B" : "#B23A48") : undefined}
        />
      </section>

      {/* Stage buttons */}
      <section className="grid gap-3 sm:grid-cols-3">
        {stages.map((s, i) => (
          <Link key={s.key} href={s.href} className="card group relative overflow-hidden p-5 transition hover:border-bronze">
            <div className="flex items-center justify-between">
              <span className="font-serif text-2xl text-ink">{s.title}</span>
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-paper-warm text-xs font-semibold text-ink-muted">
                {i + 1}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-ink-muted">{s.subtitle}</p>
            <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-paper-line">
              <div className="h-full rounded-full bg-bronze transition-all" style={{ width: `${Math.round(s.progress * 100)}%` }} />
            </div>
            <p className="mt-2 text-xs text-ink-soft">{s.meta}</p>
            <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-bronze-dark">
              {s.started ? "Open" : "Start"} →
            </span>
          </Link>
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        {/* Procedability */}
        <div className="card p-5 lg:col-span-1">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-lg text-ink">Procedability</h2>
            <span className="text-xs text-ink-muted">Score {result.score}</span>
          </div>
          <p className="mb-2 mt-1 text-xs text-ink-muted">
            Against criteria: {num(settings.minSqFt)}–{num(settings.maxSqFt)} ft², ≥{pct(settings.targetProfitOnGdvPct)} profit on GDV.
            <Link href="/settings" className="ml-1 text-bronze-dark hover:underline">Edit</Link>
          </p>
          <ChecksPanel result={result} />
        </div>

        {/* Planning brief */}
        <div className="card p-5 lg:col-span-2">
          <h2 className="font-serif text-lg text-ink">Planning &amp; site brief</h2>
          <dl className="mt-3 grid gap-x-6 gap-y-4 sm:grid-cols-2">
            <Brief term="Current use / class" desc={p.currentUse} />
            <Brief term="Heritage / designation" desc={p.heritage} />
            <Brief term="PD route" desc={p.pdRoute} />
            <Brief term="Full planning route" desc={p.fullPlanningRoute} />
            <Brief term="Key constraints" desc={p.keyConstraints} full />
            <Brief term="Planning principle" desc={p.planningPrinciple} />
            <Brief term="Likely outcome / verdict" desc={p.likelyOutcome} />
            <Brief term="Priority / next step" desc={p.priorityNextStep} full />
          </dl>
          {p.listingUrl && (
            <a href={p.listingUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex text-sm text-bronze-dark hover:underline">
              View listing ({p.listingSource}) ↗
            </a>
          )}
        </div>
      </section>

      {ipadOut && (
        <section className="card p-5">
          <h2 className="font-serif text-lg text-ink">Appraisal headline (IPAD)</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Fact label="GDV" value={gbp(ipadOut.gdv)} />
            <Fact label="Total cost" value={gbp(ipadOut.totalCostOfDevelopment)} />
            <Fact label="Net profit" value={gbp(ipadOut.netProfit)} valueColor={ipadOut.netProfit >= 0 ? "#2E7D5B" : "#B23A48"} />
            <Fact label="No. units" value={String(ipadOut.noUnits)} />
          </div>
        </section>
      )}
    </div>
  );
}

function Fact({ label, value, sub, valueColor }: { label: string; value: string; sub?: string; valueColor?: string }) {
  return (
    <div className="card px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-ink-muted">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums" style={{ color: valueColor ?? "#16202B" }}>{value}</div>
      {sub && <div className="text-xs text-ink-muted">{sub}</div>}
    </div>
  );
}

function Brief({ term, desc, full }: { term: string; desc: string; full?: boolean }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <dt className="text-xs font-medium uppercase tracking-wide text-bronze-dark">{term}</dt>
      <dd className="mt-1 text-sm leading-relaxed text-ink-soft">{desc || "—"}</dd>
    </div>
  );
}
