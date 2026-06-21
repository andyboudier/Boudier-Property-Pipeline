import Link from "next/link";
import { notFound } from "next/navigation";
import { getProperty } from "@/lib/db";
import { computeIpad, defaultIpadInputs } from "@/lib/ipadCalc";
import { gbp, num, pct } from "@/lib/format";
import { PrintButton } from "@/components/PrintButton";

export const dynamic = "force-dynamic";

export default async function IpadPrintPage({ params }: { params: { id: string } }) {
  const p = await getProperty(params.id);
  if (!p) notFound();

  const inputs = p.ipad?.inputs ?? defaultIpadInputs();
  const out = computeIpad(inputs);
  const printedOn = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  const appraised = inputs.appraisalDate
    ? new Date(inputs.appraisalDate).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })
    : "—";

  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-5 flex items-center justify-between">
        <Link href={`/property/${p.id}/ipad`} className="text-sm text-ink-muted hover:text-bronze-dark">← Back to IPAD</Link>
        <PrintButton />
      </div>

      <article className="print-page card px-8 py-8 print:px-0 print:py-0">
        <header className="flex items-start justify-between border-b-2 border-ink pb-4">
          <div>
            <div className="wordmark font-serif text-lg font-semibold text-ink">BOUDIER PROPERTY</div>
            <div className="text-[11px] uppercase tracking-[0.25em] text-bronze-dark">Intelligent Development, Lasting Value</div>
          </div>
          <div className="text-right text-xs text-ink-muted">
            <div className="font-semibold text-ink">Initial Project Appraisal (IPAD)</div>
            <div>Printed {printedOn}</div>
          </div>
        </header>

        <section className="mt-5 grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <Field label="Opportunity" value={p.name} />
          <Field label="Appraisal date" value={appraised} />
          <Field label="Town / LPA" value={`${p.town} · ${p.lpa}`} />
          <Field label="GDV" value={gbp(out.gdv)} />
          <Field label="Net profit" value={gbp(out.netProfit)} />
          <Field label="Profit on GDV" value={pct(out.profitOnGdvPct)} />
          <div className="col-span-2">
            <Field label="Description" value={inputs.description} />
          </div>
        </section>

        {/* Units */}
        <section className="print-break mt-6">
          <h3 className="mb-1 border-b border-paper-line pb-1 font-serif text-base text-ink">Scheme &amp; units</h3>
          <p className="mb-2 text-xs text-ink-muted">
            Developable area {num(inputs.areaM2)} m² · reference timescale {num(inputs.refTimescaleMonths)} months
          </p>
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="text-left text-ink-muted">
                <th className="border-b border-paper-line py-1.5 pr-2 font-medium">No.</th>
                <th className="border-b border-paper-line py-1.5 pr-2 font-medium">Type</th>
                <th className="border-b border-paper-line py-1.5 pr-2 font-medium">m² / unit</th>
                <th className="border-b border-paper-line py-1.5 text-right font-medium">Total GDV</th>
              </tr>
            </thead>
            <tbody>
              {inputs.units.map((u) => (
                <tr key={u.id}>
                  <td className="py-1.5 pr-2">{u.units}</td>
                  <td className="py-1.5 pr-2">{u.type || "—"}</td>
                  <td className="py-1.5 pr-2 tabular-nums">{num(u.m2)}</td>
                  <td className="py-1.5 text-right tabular-nums">{gbp(u.totalGdv)}</td>
                </tr>
              ))}
              {inputs.units.length === 0 && (
                <tr><td colSpan={4} className="py-3 text-center text-xs text-ink-muted">No unit lines.</td></tr>
              )}
              <tr className="border-t border-paper-line font-semibold">
                <td className="py-1.5 pr-2">{out.noUnits}</td>
                <td className="py-1.5 pr-2">Total</td>
                <td className="py-1.5 pr-2"></td>
                <td className="py-1.5 text-right tabular-nums">{gbp(out.gdv)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* Cost summary */}
        <section className="print-break mt-6">
          <h3 className="mb-1 border-b border-paper-line pb-1 font-serif text-base text-ink">Cost summary</h3>
          <table className="w-full border-collapse text-[12.5px]">
            <tbody>
              {out.lines.map((l) => (
                <tr key={l.label} className={l.label === "Total Cost of Development" ? "border-t border-paper-line font-semibold" : ""}>
                  <td className="py-1.5 pr-2 text-ink-soft">
                    {l.label}
                    {l.note && <span className="ml-1 text-[11px] text-ink-muted">({l.note})</span>}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{gbp(l.value)}</td>
                </tr>
              ))}
              <tr>
                <td className="py-1.5 pr-2 text-ink-muted">Cost / m² (inc. finance)</td>
                <td className="py-1.5 text-right tabular-nums text-ink-muted">{gbp(out.costPerSqmIncFinance)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* Result */}
        <section className="mt-6 grid grid-cols-2 gap-x-8 gap-y-2 rounded-md bg-paper-warm/70 px-4 py-3 text-sm print:bg-transparent print:px-0">
          <Field label="Total cost of development" value={gbp(out.totalCostOfDevelopment)} />
          <Field label="Net profit" value={gbp(out.netProfit)} />
          <Field label="Profit on GDV" value={pct(out.profitOnGdvPct)} />
          <Field label="Profit on cost" value={pct(out.profitOnCostPct)} />
        </section>

        <footer className="mt-8 flex items-center justify-between border-t border-paper-line pt-3 text-[10px] text-ink-muted">
          <span>Boudier Property — Site Appraisal · IPAD</span>
          <span>{p.name}</span>
        </footer>
      </article>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-bronze-dark">{label}</div>
      <div className="text-sm text-ink">{value || "—"}</div>
    </div>
  );
}
