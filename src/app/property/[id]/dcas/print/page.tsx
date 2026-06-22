import Link from "next/link";
import { notFound } from "next/navigation";
import { getProperty } from "@/lib/db";
import { emptyDcas, dcasStats } from "@/lib/dcasSchema";
import { ratingLabel, ratingColor } from "@/lib/ratings";
import { gbp, num } from "@/lib/format";
import { PrintButton } from "@/components/PrintButton";
import type { Dcas } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DcasPrintPage({ params }: { params: { id: string } }) {
  const p = await getProperty(params.id);
  if (!p) notFound();

  const dcas: Dcas = p.dcas ?? emptyDcas(p.name, p.currentUse);
  const stats = dcasStats(dcas);
  const printedOn = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });

  return (
    <div className="mx-auto max-w-3xl">
      {/* Screen-only toolbar */}
      <div className="no-print mb-5 flex items-center justify-between">
        <Link href={`/property/${p.id}/dcas`} className="text-sm text-ink-muted hover:text-bronze-dark">
          ← Back to DCAS
        </Link>
        <PrintButton />
      </div>

      <article className="print-page card px-8 py-8 print:px-0 print:py-0">
        {/* Letterhead */}
        <header className="flex items-start justify-between border-b-2 border-ink pb-4">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/boudier-logo.png" alt="Boudier Property" className="h-9 w-auto rounded" />
            <div className="mt-1 text-[11px] uppercase tracking-[0.25em] text-bronze-dark">Intelligent Development, Lasting Value</div>
          </div>
          <div className="text-right text-xs text-ink-muted">
            <div className="font-semibold text-ink">Deal Criteria Assessment Sheet</div>
            <div>Printed {printedOn}</div>
          </div>
        </header>

        {/* Summary block */}
        <section className="mt-5 grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <Field label="Opportunity" value={dcas.opportunity || p.name} />
          <Field label="Assessment date" value={dcas.date} />
          <Field label="Town / LPA" value={`${p.town} · ${p.lpa}`} />
          <Field label="Guide price" value={gbp(p.guidePrice)} />
          <Field label="Size" value={p.sizeSqFt != null ? `${num(p.sizeSqFt)} ft²` : "—"} />
          <Field label="Current use" value={p.currentUse} />
          <div className="col-span-2">
            <Field label="Description" value={dcas.description} />
          </div>
        </section>

        <section className="mt-3 flex gap-4 rounded-md bg-paper-warm/70 px-4 py-2 text-xs print:bg-transparent print:px-0">
          <span>
            <strong className="text-ink">{stats.answered}</strong>/{stats.total} answered
          </span>
          <span style={{ color: "#B23A48" }}>{stats.criticals} critical</span>
          <span style={{ color: "#C2872B" }}>{stats.concerning} concerning</span>
          <span>Avg score {stats.avgRating ? stats.avgRating.toFixed(1) : "—"}/5</span>
        </section>

        {/* Sections */}
        {dcas.sections.map((section) => (
          <section key={section.key} className="print-break mt-5">
            <h3 className="mb-1 border-b border-paper-line pb-1 font-serif text-base text-ink">{section.title}</h3>
            <table className="w-full border-collapse text-[12.5px]">
              <tbody>
                {section.items.map((item) => (
                  <tr key={item.id} className="align-top">
                    <td className="w-1/2 py-1.5 pr-3 text-ink-soft">{item.label}</td>
                    <td className="w-24 py-1.5">
                      <span
                        className="inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold"
                        style={{ background: `${ratingColor(item.rating)}1A`, color: ratingColor(item.rating) }}
                      >
                        {ratingLabel(item.rating)}
                      </span>
                    </td>
                    <td className="py-1.5 text-[12px] text-ink-muted">{item.note || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}

        {/* Overall comments */}
        <section className="print-break mt-6">
          <h3 className="mb-1 border-b border-paper-line pb-1 font-serif text-base text-ink">Overall comments</h3>
          <p className="min-h-[60px] whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink-soft">
            {dcas.overallComments || "—"}
          </p>
        </section>

        <footer className="mt-8 flex items-center justify-between border-t border-paper-line pt-3 text-[10px] text-ink-muted">
          <span>Boudier Property — Site Appraisal · DCAS</span>
          <span>{dcas.opportunity || p.name}</span>
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
