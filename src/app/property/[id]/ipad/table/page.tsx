import Link from "next/link";
import { notFound } from "next/navigation";
import { getProperty } from "@/lib/db";
import { computeIpad, defaultIpadInputs, sqmToSqft } from "@/lib/ipadCalc";
import { PrintButton } from "@/components/PrintButton";
import { IpadTable } from "@/components/IpadTable";

export const dynamic = "force-dynamic";

// Table view — the IPAD laid out exactly like the "IPAD Foundation" sheet in
// the source Excel workbook (same rows, order, wording and columns).
export default async function IpadTablePage({ params }: { params: { id: string } }) {
  const p = await getProperty(params.id);
  if (!p) notFound();

  const inputs = p.ipad?.inputs ?? defaultIpadInputs();
  const out = computeIpad(inputs);

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link href={`/property/${p.id}/ipad`} className="text-sm text-ink-muted hover:text-bronze-dark">
          ← Back to IPAD
        </Link>
        <div className="flex items-center gap-2">
          <Link href={`/property/${p.id}/ipad/print`} className="btn-ghost">PDF / Print</Link>
          <PrintButton label="Download table as PDF" />
        </div>
      </div>

      <IpadTable
        inp={inputs}
        out={out}
        projectAddress={p.name}
        areaSqFt={inputs.areaM2 ? Math.round(sqmToSqft(inputs.areaM2)) : 0}
      />
    </div>
  );
}
