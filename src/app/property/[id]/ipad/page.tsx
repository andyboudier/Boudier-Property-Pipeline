import Link from "next/link";
import { notFound } from "next/navigation";
import { getProperty } from "@/lib/db";
import { defaultIpadInputs, sqftToSqm } from "@/lib/ipadCalc";
import { IpadForm } from "@/components/IpadForm";
import type { Ipad } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function IpadPage({ params }: { params: { id: string } }) {
  const p = await getProperty(params.id);
  if (!p) notFound();

  // Auto-populate area (from sq ft) and purchase price (from guide) when fresh.
  const ipad: Ipad = p.ipad ?? {
    inputs: defaultIpadInputs({
      areaM2: p.sizeSqFt != null ? Math.round(sqftToSqm(p.sizeSqFt)) : 0,
      purchasePrice: p.guidePrice ?? 0,
      stampDuty: p.guidePrice != null ? Math.round(p.guidePrice * 0.04) : 0,
    }),
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/property/${p.id}`} className="text-xs text-ink-muted hover:text-bronze-dark">
          ← {p.name}
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-xs font-semibold text-white">3</span>
          <div>
            <h1 className="font-serif text-2xl text-ink">IPAD — Initial Project Appraisal</h1>
            <p className="text-sm text-ink-muted">
              Full residual appraisal. Enter unit GDV and costs; net profit and profit-on-GDV update live and feed procedability.
            </p>
          </div>
        </div>
      </div>

      <IpadForm propertyId={p.id} initial={ipad} />
    </div>
  );
}
