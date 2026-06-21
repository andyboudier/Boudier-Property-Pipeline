import Link from "next/link";
import { notFound } from "next/navigation";
import { getProperty } from "@/lib/db";
import { computeIpad } from "@/lib/ipadCalc";
import { defaultInvestorTerms } from "@/lib/investorCalc";
import { InvestorForm } from "@/components/InvestorForm";

export const dynamic = "force-dynamic";

export default async function InvestorPage({ params }: { params: { id: string } }) {
  const p = await getProperty(params.id);
  if (!p) notFound();

  const netProfit = p.ipad?.inputs.units.length ? computeIpad(p.ipad.inputs).netProfit : 0;
  const initial = p.investor ?? defaultInvestorTerms({ termMonths: p.ipad?.inputs.refTimescaleMonths ?? null });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href={`/property/${p.id}`} className="text-xs text-ink-muted hover:text-bronze-dark">← {p.name}</Link>
        <h1 className="mt-2 font-serif text-2xl text-ink">Investor terms</h1>
        <p className="text-sm text-ink-muted">
          Set the raise, the return and the pitch. These feed the branded investor presentation you can export as a PDF.
        </p>
      </div>
      <InvestorForm propertyId={p.id} initial={initial} initialImageUrl={p.imageUrl ?? ""} netProfit={netProfit} />
    </div>
  );
}
