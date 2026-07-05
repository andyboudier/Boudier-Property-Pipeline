import Link from "next/link";
import { notFound } from "next/navigation";
import { getProperty, getSettings } from "@/lib/db";
import { dcasStats } from "@/lib/dcasSchema";
import { ratingLabel, ratingColor } from "@/lib/ratings";
import { computeIpad } from "@/lib/ipadCalc";
import { segmentStats, macSummary, pricePerM2, daysOnMarket, type MacProfileRow as _MPR } from "@/lib/macCalc";
import { evaluateProcedability, statusMeta } from "@/lib/procedability";
import { gbp, num, pct } from "@/lib/format";
import { PrintButton } from "@/components/PrintButton";
import type { IpadInputs } from "@/lib/types";

export const dynamic = "force-dynamic";

/* eslint-disable @next/next/no-img-element */
export default async function FullReportPage({ params }: { params: { id: string } }) {
  const [p, settings] = await Promise.all([getProperty(params.id), getSettings()]);
  if (!p) notFound();

  const result = evaluateProcedability(p, settings);
  const displayStatus = p.statusOverride ?? result.status;
  const sm = statusMeta(displayStatus);
  const d = p.dcas ? dcasStats(p.dcas) : null;
  const ipadOut = p.ipad?.inputs.units.length ? computeIpad(p.ipad.inputs) : null;
  const macData = p.mac && p.mac.segments?.some((s) => s.comps.some((c) => c.property.trim() !== "")) ? macSummary(p.mac) : null;
  const printedOn = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  const inp = p.ipad?.inputs;

  return (
    <div className="mx-auto max-w-3xl">
      {/* Screen-only toolbar */}
      <div className="no-print mb-5 flex items-center justify-between">
        <Link href={`/property/${p.id}`} className="text-sm text-ink-muted hover:text-bronze-dark">← Back to overview</Link>
        <PrintButton label="Print / Save full report as PDF" />
      </div>

      <article className="print-page card px-8 py-8 print:px-0 print:py-0">
        {/* ── Letterhead + cover ── */}
        <header className="flex items-start justify-between border-b-2 border-ink pb-4">
          <div>
            <img src="/boudier-logo.png" alt="Boudier Property" className="h-9 w-auto rounded" />
            <div className="mt-1 text-[11px] uppercase tracking-[0.25em] text-bronze-dark">Intelligent Development, Lasting Value</div>
          </div>
          <div className="text-right text-xs text-ink-muted">
            <div className="font-semibold text-ink">Full Property Report</div>
            <div>Printed {printedOn}</div>
          </div>
        </header>

        <section className="mt-5 flex items-start gap-5">
          {p.imageUrl && <img src={p.imageUrl} alt={p.name} className="h-28 w-40 rounded-lg border border-paper-line object-cover" />}
          <div className="min-w-0">
            <h1 className="font-serif text-2xl leading-tight text-ink">{p.name}</h1>
            <div className="mt-1 text-sm text-ink-muted">{[p.town, p.lpa].filter(Boolean).join(" · ")}</div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full px-2 py-0.5 font-semibold" style={{ background: `${sm.color}1A`, color: sm.color }}>
                {sm.label}{p.statusOverride ? " (set manually)" : ""}
              </span>
              {p.marketStatus && <span className="rounded-full bg-paper-warm px-2 py-0.5 text-ink-soft">Listing: {p.marketStatus}</span>}
              <span className="text-ink-muted">{result.headline}</span>
            </div>
          </div>
        </section>

        {/* ── 1. Property details ── */}
        <SectionTitle n="1" title="Property Details" />
        <section className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <Field label="Guide price" value={gbp(p.guidePrice)} />
          <Field label="Size" value={p.sizeSqFt != null ? `${num(p.sizeSqFt)} ft² (${num(p.sizeSqFt * 0.092903)} m²)` : "—"} />
          <Field label="£ / ft²" value={p.pricePerSqFt != null ? gbp(p.pricePerSqFt) : "—"} />
          <Field label="Current use" value={p.currentUse} />
          <Field label="Heritage" value={p.heritage} />
          <Field label="PD route" value={p.pdRoute} />
          <Field label="Full planning route" value={p.fullPlanningRoute} />
          <Field label="Key constraints" value={p.keyConstraints} />
          <Field label="Planning principle" value={p.planningPrinciple} />
          <Field label="Likely outcome" value={p.likelyOutcome} />
          <Field label="Priority next step" value={p.priorityNextStep} />
          <Field label="Listing" value={p.listingSource ? `${p.listingSource}${p.listingUrl ? ` — ${p.listingUrl}` : ""}` : "—"} />
        </section>
        {p.notes && (
          <div className="mt-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-bronze-dark">Notes</div>
            <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink-soft">{p.notes}</p>
          </div>
        )}

        {/* Procedability checks */}
        <div className="print-break mt-4">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-bronze-dark">Procedability checks (score {result.score}/100)</div>
          <table className="mt-1 w-full text-[12px]">
            <tbody>
              {result.checks.map((c) => (
                <tr key={c.key} className="align-top">
                  <td className="w-5 py-0.5 font-bold" style={{ color: c.outcome === "pass" ? "#2E7D5B" : c.outcome === "warn" ? "#C2872B" : c.outcome === "fail" ? "#B23A48" : "#8A8F94" }}>
                    {c.outcome === "pass" ? "✓" : c.outcome === "warn" ? "!" : c.outcome === "fail" ? "✕" : "·"}
                  </td>
                  <td className="w-56 py-0.5 text-ink">{c.label}</td>
                  <td className="py-0.5 text-ink-muted">{c.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── 2. DCAS ── */}
        <div style={{ breakBefore: "page" }}>
          <SectionTitle n="2" title="DCAS — Deal Criteria Assessment" />
          {!p.dcas || !d ? (
            <NotStarted />
          ) : (
            <>
              <section className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                <Field label="Opportunity" value={p.dcas.opportunity || p.name} />
                <Field label="Assessment date" value={p.dcas.date} />
                <div className="col-span-2"><Field label="Description" value={p.dcas.description} /></div>
              </section>
              <section className="mt-2 flex gap-4 text-xs">
                <span><strong className="text-ink">{d.answered}</strong>/{d.total} answered</span>
                <span style={{ color: "#B23A48" }}>{d.criticals} critical</span>
                <span style={{ color: "#C2872B" }}>{d.concerning} concerning</span>
                <span>Avg score {d.avgRating ? d.avgRating.toFixed(1) : "—"}/5</span>
              </section>
              {p.dcas.sections.map((section) => (
                <section key={section.key} className="print-break mt-4">
                  <h3 className="mb-1 border-b border-paper-line pb-1 font-serif text-[15px] text-ink">{section.title}</h3>
                  <table className="w-full border-collapse text-[12px]">
                    <tbody>
                      {section.items.map((item) => (
                        <tr key={item.id} className="align-top">
                          <td className="w-1/2 py-1 pr-3 text-ink-soft">{item.label}</td>
                          <td className="w-24 py-1">
                            <span className="inline-block rounded px-1.5 py-0.5 text-[10.5px] font-semibold" style={{ background: `${ratingColor(item.rating)}1A`, color: ratingColor(item.rating) }}>
                              {ratingLabel(item.rating)}
                            </span>
                          </td>
                          <td className="py-1 text-[11.5px] text-ink-muted">{item.note || ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              ))}
              <section className="print-break mt-4">
                <h3 className="mb-1 border-b border-paper-line pb-1 font-serif text-[15px] text-ink">Overall comments</h3>
                <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink-soft">{p.dcas.overallComments || "—"}</p>
              </section>
            </>
          )}
        </div>

        {/* ── 3. MAC ── */}
        <div style={{ breakBefore: "page" }}>
          <SectionTitle n="3" title="MAC — Market Area Comparison" />
          {!p.mac ? (
            <NotStarted />
          ) : (
            <>
              <section className="grid grid-cols-3 gap-x-8 gap-y-2 text-sm">
                <Field label="Project" value={p.mac.projectName || p.name} />
                <Field label="Date" value={p.mac.date} />
                <Field label="Description" value={p.mac.description} />
              </section>

              {p.mac.search && (
                <section className="print-break mt-3 rounded-md border border-paper-line p-3 text-[12px]">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-bronze-dark">Market search parameters</div>
                  <div className="grid grid-cols-3 gap-x-6 gap-y-1">
                    <KV k="Search area" v={p.mac.search.searchArea} />
                    <KV k="Radius" v={p.mac.search.radius} />
                    <KV k="Type" v={p.mac.search.propertyType} />
                    <KV k="Price range" v={`${p.mac.search.minPrice != null ? gbp(p.mac.search.minPrice) : "—"} to ${p.mac.search.maxPrice != null ? gbp(p.mac.search.maxPrice) : "—"}`} />
                    <KV k="Beds" v={`${p.mac.search.minBeds ?? "—"}–${p.mac.search.maxBeds ?? "—"}`} />
                    <KV k="Properties inc / exc SSTC" v={`${p.mac.search.totalIncSstc ?? "—"} / ${p.mac.search.totalExcSstc ?? "—"}`} />
                    <div className="col-span-3 text-ink-muted">
                      Filters: {(["garden", "parking", "newHome", "retirementHomes", "shared", "auction"] as const)
                        .map((k) => `${{ garden: "Garden", parking: "Parking", newHome: "New Home", retirementHomes: "Retirement Homes", shared: "Shared", auction: "Auction" }[k]}: ${p.mac!.search!.filters?.[k] ? "Yes" : "No"}`)
                        .join(" · ")}
                    </div>
                  </div>
                </section>
              )}

              {p.mac.segments.map((seg) => {
                const st = segmentStats(seg, p.mac!.date);
                const comps = seg.comps.filter((c) => c.property.trim() !== "");
                return (
                  <section key={seg.key} className="mt-4">
                    <h3 className="mb-1 border-b border-paper-line pb-1 font-serif text-[15px] text-ink">{seg.label}</h3>
                    <div className="mb-1 text-[11px] text-ink-muted">
                      {seg.searchArea && <>Search: {seg.searchArea} · {seg.radius} · </>}
                      Beds {seg.minBeds ?? "—"}–{seg.maxBeds ?? "—"} · Total inc SSTC {seg.totalIncSstc ?? "—"} · Unsold exc SSTC {seg.totalExcSstc ?? "—"}
                    </div>
                    {comps.length === 0 ? (
                      <p className="text-[12px] text-ink-muted">No comparables recorded.</p>
                    ) : (
                      <table className="w-full border-collapse text-[10.5px]">
                        <thead>
                          <tr className="border-b border-paper-line text-left text-[9.5px] uppercase tracking-wide text-ink-muted">
                            <th className="py-1 pr-2">Property</th>
                            <th className="py-1 pr-2">Type / Beds</th>
                            <th className="py-1 pr-2 text-right">Asking</th>
                            <th className="py-1 pr-2 text-right">m²</th>
                            <th className="py-1 pr-2 text-right">£/m²</th>
                            <th className="py-1 pr-2 text-right">DoM</th>
                            <th className="py-1 pr-2">Status</th>
                            <th className="py-1">Agent</th>
                          </tr>
                        </thead>
                        <tbody>
                          {comps.map((c) => {
                            const ppm2 = pricePerM2(c);
                            const dom = daysOnMarket(c, p.mac!.date);
                            const extra = [c.condition && `Condition: ${c.condition}`, c.kerbAppeal && `Kerb: ${c.kerbAppeal}`, c.proximity && `Proximity: ${c.proximity}`, c.similarity && `Similarity: ${c.similarity}`, c.m2Source && `m² source: ${c.m2Source}`, c.comments].filter(Boolean).join(" · ");
                            return (
                              <FragmentRow key={c.id} extra={extra}>
                                <td className="py-1 pr-2 text-ink">{c.property}{c.area ? `, ${c.area}` : ""}</td>
                                <td className="py-1 pr-2 text-ink-soft">{[c.propertyType, c.beds != null ? `${c.beds} bed` : ""].filter(Boolean).join(" · ") || "—"}</td>
                                <td className="py-1 pr-2 text-right tabular-nums">{gbp(c.askingPrice)}</td>
                                <td className="py-1 pr-2 text-right tabular-nums">{c.totalM2 ?? "—"}</td>
                                <td className="py-1 pr-2 text-right tabular-nums">{ppm2 ? num(ppm2) : "—"}</td>
                                <td className="py-1 pr-2 text-right tabular-nums">{dom ?? "—"}</td>
                                <td className="py-1 pr-2">{c.status || "—"}</td>
                                <td className="py-1">{c.agent || "—"}</td>
                              </FragmentRow>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                    <div className="mt-1 rounded bg-paper-warm/70 px-2 py-1 text-[11px] text-ink-soft print:bg-transparent print:px-0">
                      {st.count} comps · Avg m² {st.averageM2 ? num(st.averageM2, 1) : "—"} · Largest/smallest {st.largestM2 ? `${num(st.largestM2)}/${num(st.smallestM2)}` : "—"} ·
                      Avg £/m² {st.avgPricePerM2 ? gbp(st.avgPricePerM2) : "—"} · Avg asking {st.avgAskingPrice ? gbp(st.avgAskingPrice) : "—"} ·
                      Avg DoM {st.avgDaysOnMarket ? num(st.avgDaysOnMarket) : "—"} · Sales ratio {pct(st.salesRatio)}
                    </div>
                  </section>
                );
              })}

              {/* MAC report summary */}
              {macData && (
                <section className="print-break mt-5">
                  <h3 className="mb-2 border-b-2 border-ink pb-1 font-serif text-base font-semibold tracking-wide text-ink">MAC REPORT SUMMARY</h3>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-3">
                      {macData.segments.map((s, i) => (
                        <div key={i} className="rounded-md border border-paper-line p-2.5 text-[11.5px]">
                          <div className="mb-1 font-serif text-[13px] text-ink">{s.label}</div>
                          <SummaryStat k="Average m²" v={s.stats.totalProperties ? `${num(s.stats.averageM2, 1)} m²` : "—"} />
                          <SummaryStat k="Largest / Smallest" v={s.stats.largestM2 ? `${num(s.stats.largestM2, 1)} / ${num(s.stats.smallestM2, 1)} m²` : "—"} />
                          <SummaryStat k="Average £ per m²" v={s.stats.avgPricePerM2 ? gbp(s.stats.avgPricePerM2) : "—"} />
                          <SummaryStat k="Avg asking price" v={s.stats.avgAskingPrice ? gbp(s.stats.avgAskingPrice) : "—"} />
                          <SummaryStat k="Unsold / Total" v={`${num(s.stats.unsold)} / ${num(s.stats.totalProperties)}`} />
                          <SummaryStat k="Sales ratio" v={pct(s.stats.salesRatio)} />
                          <SummaryStat k="Avg days on market" v={s.stats.avgDaysOnMarket ? num(s.stats.avgDaysOnMarket) : "—"} />
                        </div>
                      ))}
                    </div>
                    <div className="space-y-4">
                      <ProfileTable title="Profile By Property Type" rows={macData.byType.rows} footer={[macData.byType.flats, macData.byType.houses, macData.byType.all]} />
                      <ProfileTable title="Profile By No. Of Bedrooms" rows={macData.byBeds.rows} footer={[macData.byBeds.all]} />
                    </div>
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        {/* ── 4. IPAD ── */}
        <div style={{ breakBefore: "page" }}>
          <SectionTitle n="4" title="IPAD — Initial Project Appraisal" />
          {!inp || !ipadOut ? (
            <NotStarted />
          ) : (
            <>
              <section className="grid grid-cols-3 gap-x-8 gap-y-2 text-sm">
                <Field label="Appraisal date" value={inp.appraisalDate} />
                <Field label="Developable area" value={`${num(inp.areaM2)} m²`} />
                <Field label="Timescale" value={`${inp.refTimescaleMonths} months`} />
                <div className="col-span-3"><Field label="Description" value={inp.description} /></div>
              </section>

              {/* Units & GDV */}
              <h3 className="mt-4 border-b border-paper-line pb-1 font-serif text-[15px] text-ink">Sales projections — Units & GDV</h3>
              <table className="mt-1 w-full text-[11.5px]">
                <thead>
                  <tr className="border-b border-paper-line text-left text-[9.5px] uppercase tracking-wide text-ink-muted">
                    <th className="py-1 pr-2">#</th><th className="py-1 pr-2">No.</th><th className="py-1 pr-2">Type</th>
                    <th className="py-1 pr-2 text-right">m² / unit</th><th className="py-1 pr-2 text-right">Total GDV</th><th className="py-1 text-right">£/m²</th>
                  </tr>
                </thead>
                <tbody>
                  {inp.units.map((u, i) => (
                    <tr key={u.id} className="border-b border-paper-line/60">
                      <td className="py-1 pr-2 text-ink-muted">{i + 1}</td>
                      <td className="py-1 pr-2 tabular-nums">{u.units}</td>
                      <td className="py-1 pr-2">{u.type || "—"}</td>
                      <td className="py-1 pr-2 text-right tabular-nums">{u.m2 || "—"}</td>
                      <td className="py-1 pr-2 text-right tabular-nums">{gbp(u.totalGdv)}</td>
                      <td className="py-1 text-right tabular-nums">{u.m2 ? num(u.totalGdv / u.m2) : "—"}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold text-ink">
                    <td colSpan={4} className="py-1 pr-2">Total Development Projected Sale Value (GDV)</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{gbp(ipadOut.gdv)}</td>
                    <td />
                  </tr>
                </tbody>
              </table>

              {/* Project costs — every field */}
              <h3 className="print-break mt-4 border-b border-paper-line pb-1 font-serif text-[15px] text-ink">Project costs</h3>
              <CostTable inp={inp} out={ipadOut} />

              {/* Appraisal result */}
              <section className="print-break mt-5 rounded-md border-2 border-ink p-3">
                <h3 className="mb-1 font-serif text-base font-semibold text-ink">Appraisal Result</h3>
                <table className="w-full text-[12.5px]">
                  <tbody>
                    <RRow k="GDV" v={gbp(ipadOut.gdv)} strong />
                    <RRow k="No. units" v={String(ipadOut.noUnits)} />
                    {ipadOut.lines.map((l) => (
                      <RRow key={l.label} k={l.label} v={gbp(l.value)} note={l.note} strong={l.label === "Total Cost of Development"} />
                    ))}
                    <RRow k="Cost / m² (ex finance)" v={gbp(ipadOut.costPerSqmExFinance)} />
                    <RRow k="Cost / m² (inc finance)" v={gbp(ipadOut.costPerSqmIncFinance)} />
                    <RRow k="Net profit" v={gbp(ipadOut.netProfit)} color={ipadOut.netProfit >= 0 ? "#2E7D5B" : "#B23A48"} strong />
                    <RRow k="Profit on GDV" v={pct(ipadOut.profitOnGdvPct)} color={ipadOut.profitOnGdvPct >= 0.18 ? "#2E7D5B" : ipadOut.profitOnGdvPct >= 0 ? "#C2872B" : "#B23A48"} strong />
                    <RRow k="Profit on cost" v={pct(ipadOut.profitOnCostPct)} />
                  </tbody>
                </table>
              </section>
            </>
          )}
        </div>

        <footer className="mt-8 flex items-center justify-between border-t border-paper-line pt-3 text-[10px] text-ink-muted">
          <span>Boudier Property — Full Property Report</span>
          <span>{p.name}</span>
        </footer>
      </article>
    </div>
  );
}

/* ── helpers ─────────────────────────────────────────────────────────────── */

function SectionTitle({ n, title }: { n: string; title: string }) {
  return (
    <h2 className="mb-3 mt-6 border-b-2 border-ink pb-1 font-serif text-lg font-semibold text-ink">
      <span className="mr-2 text-bronze-dark">{n}.</span>{title}
    </h2>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-bronze-dark">{label}</div>
      <div className="text-[13px] text-ink">{value || "—"}</div>
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div><span className="text-ink-muted">{k}: </span><span className="text-ink">{v || "—"}</span></div>
  );
}

function NotStarted() {
  return <p className="text-sm text-ink-muted">Not started.</p>;
}

function FragmentRow({ children, extra }: { children: React.ReactNode; extra: string }) {
  return (
    <>
      <tr className="border-t border-paper-line/70 align-top">{children}</tr>
      {extra && (
        <tr>
          <td colSpan={8} className="pb-1 pl-3 text-[10px] italic text-ink-muted">{extra}</td>
        </tr>
      )}
    </>
  );
}

function SummaryStat({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between border-b border-paper-line/60 py-0.5">
      <span className="text-ink-muted">{k}</span><span className="tabular-nums font-medium text-ink">{v}</span>
    </div>
  );
}

function ProfileTable({ title, rows, footer }: { title: string; rows: _MPR[]; footer: _MPR[] }) {
  return (
    <div>
      <div className="mb-1 font-serif text-[13px] text-ink">{title}</div>
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-[9px] uppercase tracking-wide text-ink-muted">
            <th className="py-0.5 text-left"></th><th className="py-0.5 text-right">Total</th><th className="py-0.5 text-right">Unsold</th>
            <th className="py-0.5 text-right">Sales Ratio</th><th className="py-0.5 text-right">%</th>
          </tr>
        </thead>
        <tbody>
          {[...rows, ...footer].map((r, i) => (
            <tr key={r.label + i} className={`border-t border-paper-line/60 ${i >= rows.length ? "font-semibold text-ink" : "text-ink-soft"}`}>
              <td className="py-0.5">{r.label}</td>
              <td className="py-0.5 text-right tabular-nums">{num(r.total)}</td>
              <td className="py-0.5 text-right tabular-nums">{num(r.unsold)}</td>
              <td className="py-0.5 text-right tabular-nums">{r.total ? pct(r.salesRatio) : "—"}</td>
              <td className="py-0.5 text-right tabular-nums">{pct(r.pctOfAll)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* Static, print-friendly rendering of every project-cost line (mirrors the
   IPAD form's PROJECT COSTS table, values resolved). */
function CostTable({ inp, out }: { inp: IpadInputs; out: ReturnType<typeof computeIpad> }) {
  const area = inp.areaM2 || 0;
  const fa = out.feeAmounts;
  const ov = inp.overrides ?? {};
  const pctNote = (k: string, rate: number, of: string) =>
    typeof ov[k] === "number" ? "fixed £" : `${+(rate * 100).toFixed(2)}% ${of}`;
  const commercialFinance = Math.max(out.totalPurchaseCosts - inp.privateFinance, 0);
  const costOfCommercialFinance = out.totalPurchaseFinance - (fa.privateFinanceRatePerMonth ?? 0);

  const rows: ([string, number, string] | { sub: string } | { total: string; v: number })[] = [
    { sub: "Purchase Cost & Fees" },
    ["Purchase Price", inp.purchasePrice, area ? `${gbp(inp.purchasePrice / area)} per m²` : ""],
    ["Solicitors and Legal Fees", inp.solicitors, ""],
    ["Stamp Duty", inp.stampDuty, ""],
    ["Finder's Fee", inp.findersFee, ""],
    ["Management Fee", inp.managementFee, ""],
    { total: "TOTAL PURCHASE COSTS & FEES", v: out.totalPurchaseCosts },
    { sub: "Construction/Refurbishment Costs" },
    ["Development Management Fee", fa.devMgmtPct ?? 0, pctNote("devMgmtPct", inp.devMgmtPct, "of construction")],
    ["Planning Fees", fa.planningPct ?? 0, pctNote("planningPct", inp.planningPct, "of construction")],
    ["Architect's First Stage", fa.architect1Pct ?? 0, pctNote("architect1Pct", inp.architect1Pct, "of construction")],
    ["Architect & Planning Fees - Second Stage", fa.architect2Pct ?? 0, pctNote("architect2Pct", inp.architect2Pct, "of construction")],
    ["Structural Engineer", fa.structuralPct ?? 0, pctNote("structuralPct", inp.structuralPct, "of construction")],
    ["Party Wall Surveyor", inp.partyWall, ""],
    ["SAPS (included builder's costs)", inp.saps, ""],
    ["Contract Administration by Project Manager", fa.contractAdminPct ?? 0, pctNote("contractAdminPct", inp.contractAdminPct, "of construction")],
    ["Empty Building Rates/Council Tax", inp.emptyRates, ""],
    ["Building Warranty", inp.buildingWarranty, ""],
    ["CDM Co-ordinator", fa.cdmPct ?? 0, pctNote("cdmPct", inp.cdmPct, "of construction")],
    ["CIL/106", inp.cil106, ""],
    ["Building Control", inp.buildingControl, ""],
    ["Demolition Costs", inp.demolition, ""],
    ["Asbestos/contaminant removal", inp.asbestos, ""],
    ["Commercial Refurbishment/Construction Cost", area * inp.commercialRatePerM2, `${num(inp.commercialRatePerM2)} per m²`],
    ["Industrial Refurbishment/Construction Cost", area * inp.industrialRatePerM2, `${num(inp.industrialRatePerM2)} per m²`],
    ["New Build Cost", area * inp.newBuildRatePerM2, `${num(inp.newBuildRatePerM2)} per m²`],
    ["Landscaping/External Works", inp.landscaping, ""],
    ["Other Costs", inp.otherCosts, ""],
    ["Contingency", fa.contingencyPct ?? 0, pctNote("contingencyPct", inp.contingencyPct, "of build + landscaping + other")],
    ["Utilities", inp.utilities, ""],
    ["Accountancy, Book-keeping etc. for SPV", inp.accountancy, ""],
    ["VAT on costs", inp.vatOnCosts, ""],
    { total: "TOTAL CONSTRUCTION/REFURBISHMENT COSTS", v: out.totalConstruction },
    { sub: "Finance Costs - Purchase" },
    ["Private Finance", inp.privateFinance, ""],
    [`Private finance cost — ${inp.privateFinanceMonths} months @ ${+(inp.privateFinanceRatePerMonth * 100).toFixed(2)}%/month`, fa.privateFinanceRatePerMonth ?? 0, ""],
    ["Commercial Finance", commercialFinance, "purchase costs less private finance"],
    [`Purchase bridging — ${inp.commBridgeMonths} months @ ${+(inp.commBridgeRatePerMonth * 100).toFixed(2)}%/month`, fa.commBridgeRatePerMonth ?? 0, ""],
    ["Broker Fee", fa.commBrokerPct ?? 0, pctNote("commBrokerPct", inp.commBrokerPct, "of commercial finance")],
    ["Lender Admin Fee", fa.commAdminPct ?? 0, pctNote("commAdminPct", inp.commAdminPct, "of commercial finance")],
    ["Lender Valuation Fee", inp.commValuation, ""],
    ["Lender Exit Fee", fa.commExitPct ?? 0, pctNote("commExitPct", inp.commExitPct, "of commercial finance")],
    ["Cost of Commercial Finance", costOfCommercialFinance, ""],
    { total: "Total Purchase Financing Costs", v: out.totalPurchaseFinance },
    { sub: "Finance Costs - Development" },
    ["Development Loan", out.totalConstruction, "= total construction"],
    [`Development bridging — ${inp.devBridgeMonths} months @ ${+(inp.devBridgeRatePerMonth * 100).toFixed(2)}%/month`, fa.devBridgeRatePerMonth ?? 0, ""],
    ["Broker Fee", fa.devBrokerPct ?? 0, pctNote("devBrokerPct", inp.devBrokerPct, "of development loan")],
    ["Lender Admin Fee", fa.devAdminPct ?? 0, pctNote("devAdminPct", inp.devAdminPct, "of development loan")],
    ["Lender Valuation Fee", inp.devValuation, ""],
    ["Lender Exit Fee", fa.devExitPct ?? 0, pctNote("devExitPct", inp.devExitPct, "of development loan")],
    { total: "Total Development Financing Costs", v: out.totalDevFinance },
    { total: "TOTAL FINANCE COSTS", v: out.totalFinance },
    { sub: "Disposal" },
    ["Agent's Selling Fees including legals", fa.agentSellingPct ?? 0, pctNote("agentSellingPct", inp.agentSellingPct, "of GDV")],
    { total: "TOTAL DISPOSAL COSTS", v: out.totalDisposal },
    { total: "Total Cost of Development", v: out.totalCostOfDevelopment },
  ];

  return (
    <table className="mt-1 w-full text-[11.5px]">
      <tbody>
        {rows.map((r, i) => {
          if ("sub" in r) return (
            <tr key={i}><td colSpan={3} className="pt-2 text-[10px] font-semibold uppercase tracking-wide text-bronze-dark">{r.sub}</td></tr>
          );
          if ("total" in r) return (
            <tr key={i} className="border-t border-paper-line font-semibold text-ink">
              <td className="py-1">{r.total}</td>
              <td className="py-1 text-right tabular-nums">{gbp(r.v)}</td>
              <td />
            </tr>
          );
          const [label, v, note] = r;
          return (
            <tr key={i} className="border-t border-paper-line/50 align-top">
              <td className="py-0.5 pr-2 text-ink-soft">{label}</td>
              <td className="w-28 py-0.5 text-right tabular-nums text-ink">{gbp(v)}</td>
              <td className="w-56 py-0.5 pl-3 text-[10.5px] text-ink-muted">{note}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function RRow({ k, v, note, strong, color }: { k: string; v: string; note?: string; strong?: boolean; color?: string }) {
  return (
    <tr className={strong ? "font-semibold" : ""}>
      <td className="py-0.5 text-ink-soft">{k}{note ? <span className="ml-1 text-[10px] text-ink-muted">({note})</span> : null}</td>
      <td className="py-0.5 text-right tabular-nums" style={{ color: color ?? "#16202B" }}>{v}</td>
    </tr>
  );
}
