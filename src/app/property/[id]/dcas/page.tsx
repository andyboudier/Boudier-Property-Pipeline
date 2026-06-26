import Link from "next/link";
import { notFound } from "next/navigation";
import { getProperty } from "@/lib/db";
import { emptyDcas } from "@/lib/dcasSchema";
import { gbp } from "@/lib/format";
import { DcasForm } from "@/components/DcasForm";
import type { Dcas } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // AI research agent (auto-fill) needs headroom

export default async function DcasPage({ params }: { params: { id: string } }) {
  const p = await getProperty(params.id);
  if (!p) notFound();

  // Build an empty DCAS auto-populated from the pipeline if none saved yet.
  let dcas: Dcas = p.dcas ?? emptyDcas(p.name, p.currentUse);
  if (!p.dcas) {
    dcas = {
      ...dcas,
      sections: dcas.sections.map((s) =>
        s.key !== "price"
          ? s
          : {
              ...s,
              items: s.items.map((i) =>
                i.id === "purchase_price"
                  ? { ...i, note: p.guidePrice != null ? `Guide / asking ${gbp(p.guidePrice)} (from pipeline)` : "" }
                  : i,
              ),
            },
      ),
    };
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/property/${p.id}`} className="text-xs text-ink-muted hover:text-bronze-dark">
          ← {p.name}
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-xs font-semibold text-white">1</span>
          <div>
            <h1 className="font-serif text-2xl text-ink">DCAS — Deal Criteria Assessment</h1>
            <p className="text-sm text-ink-muted">
              Rate each criterion 1 (Critical) → 5 (Excellent), or leave Unknown. Some fields are pre-filled from the pipeline.
            </p>
          </div>
        </div>
      </div>

      <DcasForm propertyId={p.id} initial={dcas} guidePrice={p.guidePrice} />
    </div>
  );
}
