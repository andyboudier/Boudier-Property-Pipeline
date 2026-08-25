import Link from "next/link";
import { notFound } from "next/navigation";
import { getProperty } from "@/lib/db";
import { defaultIpadInputs, sqftToSqm, todayISO } from "@/lib/ipadCalc";
import { IpadTable } from "@/components/IpadTable";

export const dynamic = "force-dynamic";

// Table view — the IPAD laid out exactly like the "IPAD Foundation" sheet in
// the source Excel workbook, editable in place.
export default async function IpadTablePage({ params }: { params: { id: string } }) {
  const p = await getProperty(params.id);
  if (!p) notFound();

  const inputs = p.ipad?.inputs ?? defaultIpadInputs({
    areaM2: p.sizeSqFt != null ? Math.round(sqftToSqm(p.sizeSqFt)) : 0,
    purchasePrice: p.guidePrice ?? 0,
    stampDuty: p.guidePrice != null ? Math.round(p.guidePrice * 0.04) : 0,
  });
  if (!inputs.appraisalDate) inputs.appraisalDate = todayISO();

  return (
    <div className="space-y-4">
      <div className="no-print">
        <Link href={`/property/${p.id}/ipad`} className="text-xs text-ink-muted hover:text-bronze-dark">
          ← IPAD — {p.name}
        </Link>
      </div>
      <IpadTable propertyId={p.id} initial={inputs} projectAddress={p.name} />
    </div>
  );
}
