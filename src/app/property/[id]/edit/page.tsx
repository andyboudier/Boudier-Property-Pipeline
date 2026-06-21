import Link from "next/link";
import { notFound } from "next/navigation";
import { getProperty } from "@/lib/db";
import { NewPropertyForm } from "@/components/NewPropertyForm";

export const dynamic = "force-dynamic";

export default async function EditPropertyPage({ params }: { params: { id: string } }) {
  const p = await getProperty(params.id);
  if (!p) notFound();

  const initial = {
    name: p.name,
    town: p.town,
    lpa: p.lpa,
    guidePrice: p.guidePrice,
    sizeSqFt: p.sizeSqFt,
    pricePerSqFt: p.pricePerSqFt,
    currentUse: p.currentUse,
    heritage: p.heritage,
    pdRoute: p.pdRoute,
    fullPlanningRoute: p.fullPlanningRoute,
    keyConstraints: p.keyConstraints,
    planningPrinciple: p.planningPrinciple,
    likelyOutcome: p.likelyOutcome,
    priorityNextStep: p.priorityNextStep,
    listingSource: p.listingSource ?? "",
    listingUrl: p.listingUrl ?? "",
    notes: p.notes ?? "",
    documentsUrl: p.documentsUrl ?? "",
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href={`/property/${p.id}`} className="text-xs text-ink-muted hover:text-bronze-dark">← {p.name}</Link>
        <h1 className="mt-2 font-serif text-2xl text-ink">Edit site</h1>
        <p className="text-sm text-ink-muted">
          Update the pipeline details. DCAS, MAC and IPAD data are unaffected.
        </p>
      </div>
      <NewPropertyForm propertyId={p.id} initial={initial} />
    </div>
  );
}
