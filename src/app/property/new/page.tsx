import Link from "next/link";
import { NewPropertyForm } from "@/components/NewPropertyForm";

export const dynamic = "force-dynamic";

export default function NewPropertyPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/" className="text-xs text-ink-muted hover:text-bronze-dark">← Pipeline</Link>
        <h1 className="mt-2 font-serif text-2xl text-ink">Add a site</h1>
        <p className="text-sm text-ink-muted">
          Capture the pipeline basics. These auto-populate the DCAS and IPAD when you open them.
        </p>
      </div>
      <NewPropertyForm />
    </div>
  );
}
