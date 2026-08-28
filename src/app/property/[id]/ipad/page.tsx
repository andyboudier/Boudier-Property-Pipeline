import Link from "next/link";
import { notFound } from "next/navigation";
import { getProperty } from "@/lib/db";
import { ipadInputsForProperty } from "@/lib/ipadCalc";
import { IpadForm } from "@/components/IpadForm";
import type { Ipad } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // AI research agent (auto-fill) needs headroom

export default async function IpadPage({ params }: { params: { id: string } }) {
  const p = await getProperty(params.id);
  if (!p) notFound();

  // Seeded from the property when fresh — shared with the export and print views.
  const ipad: Ipad = { ...p.ipad, inputs: ipadInputsForProperty(p) };

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

      <IpadForm propertyId={p.id} initial={ipad} excelUrl={p.ipadExcelUrl || undefined} excelAt={p.ipadExcelAt || undefined} />
    </div>
  );
}
