import Link from "next/link";
import { notFound } from "next/navigation";
import { getProperty } from "@/lib/db";
import { emptyMac, segmentStats, pricePerM2 } from "@/lib/macCalc";
import { gbp, num, pct } from "@/lib/format";
import { PrintButton } from "@/components/PrintButton";

export const dynamic = "force-dynamic";

export default async function MacPrintPage({ params }: { params: { id: string } }) {
  const p = await getProperty(params.id);
  if (!p) notFound();

  const mac = p.mac ?? emptyMac(p.name);
  const printedOn = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  const segments = mac.segments.filter((s) => s.comps.some((c) => c.property.trim() !== ""));

  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-5 flex items-center justify-between">
        <Link href={`/property/${p.id}/mac`} className="text-sm text-ink-muted hover:text-bronze-dark">← Back to MAC</Link>
        <PrintButton />
      </div>

      <article className="print-page card px-8 py-8 print:px-0 print:py-0">
        <header className="flex items-start justify-between border-b-2 border-ink pb-4">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/boudier-logo.png" alt="Boudier Property" className="h-9 w-auto rounded" />
            <div className="mt-1 text-[11px] uppercase tracking-[0.25em] text-bronze-dark">Intelligent Development, Lasting Value</div>
          </div>
          <div className="text-right text-xs text-ink-muted">
            <div className="font-semibold text-ink">Market Area Comparison (MAC)</div>
            <div>Printed {printedOn}</div>
          </div>
        </header>

        <section className="mt-5 grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <Field label="Project" value={mac.projectName || p.name} />
          <Field label="Date" value={mac.date} />
          <Field label="Town / LPA" value={`${p.town} · ${p.lpa}`} />
          <Field label="Segments" value={String(segments.length)} />
          {mac.description && (
            <div className="col-span-2"><Field label="Description" value={mac.description} /></div>
          )}
        </section>

        {segments.map((seg) => {
          const stats = segmentStats(seg, mac.date);
          const comps = seg.comps.filter((c) => c.property.trim() !== "");
          return (
            <section key={seg.key} className="print-break mt-6">
              <h3 className="mb-1 border-b border-paper-line pb-1 font-serif text-base text-ink">{seg.label}</h3>
              <p className="mb-2 text-xs text-ink-muted">
                {[seg.searchArea, seg.radius, seg.propertyTypeFilter].filter(Boolean).join(" · ")}
              </p>

              <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-soft">
                <span><strong className="text-ink">{stats.count}</strong> comparables</span>
                <span>Avg asking <strong className="text-ink">{gbp(Math.round(stats.avgAskingPrice))}</strong></span>
                <span>Avg £/m² <strong className="text-ink">{gbp(Math.round(stats.avgPricePerM2))}</strong></span>
                <span>Avg size <strong className="text-ink">{num(Math.round(stats.averageM2))} m²</strong></span>
                <span>Sales ratio <strong className="text-ink">{pct(stats.salesRatio)}</strong></span>
              </div>

              <table className="w-full border-collapse text-[11.5px]">
                <thead>
                  <tr className="text-left text-ink-muted">
                    <th className="border-b border-paper-line py-1 pr-2 font-medium">Property</th>
                    <th className="border-b border-paper-line py-1 pr-2 font-medium">Area</th>
                    <th className="border-b border-paper-line py-1 pr-2 text-right font-medium">Asking</th>
                    <th className="border-b border-paper-line py-1 pr-2 text-right font-medium">Beds</th>
                    <th className="border-b border-paper-line py-1 pr-2 text-right font-medium">m²</th>
                    <th className="border-b border-paper-line py-1 pr-2 text-right font-medium">£/m²</th>
                    <th className="border-b border-paper-line py-1 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {comps.map((c) => {
                    const ppm = pricePerM2(c);
                    return (
                      <tr key={c.id} className="align-top">
                        <td className="py-1 pr-2">{c.property}</td>
                        <td className="py-1 pr-2 text-ink-muted">{c.area || "—"}</td>
                        <td className="py-1 pr-2 text-right tabular-nums">{c.askingPrice != null ? gbp(c.askingPrice) : "—"}</td>
                        <td className="py-1 pr-2 text-right tabular-nums">{c.beds ?? "—"}</td>
                        <td className="py-1 pr-2 text-right tabular-nums">{c.totalM2 ?? "—"}</td>
                        <td className="py-1 pr-2 text-right tabular-nums">{ppm != null ? gbp(Math.round(ppm)) : "—"}</td>
                        <td className="py-1 text-ink-muted">{c.status || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          );
        })}

        {segments.length === 0 && (
          <p className="mt-6 text-sm text-ink-muted">No comparables recorded yet.</p>
        )}

        <footer className="mt-8 flex items-center justify-between border-t border-paper-line pt-3 text-[10px] text-ink-muted">
          <span>Boudier Property — Site Appraisal · MAC</span>
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
