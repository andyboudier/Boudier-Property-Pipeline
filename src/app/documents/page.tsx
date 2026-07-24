import Link from "next/link";
import { ONEDRIVE_ROOT } from "@/lib/constants";
import { DocumentsSync } from "@/components/DocumentsSync";

export const dynamic = "force-dynamic";

// Documents section: open the shared OneDrive documents folder, and a one-time
// "sync to this Mac" flow that hands off to the OneDrive desktop app.
export default function DocumentsPage() {
  const rootUrl = process.env.ONEDRIVE_ROOT_SHARE_URL || ONEDRIVE_ROOT;

  return (
    <div className="space-y-6">
      <section>
        <Link href="/" className="text-xs text-ink-muted hover:text-bronze-dark">← Home</Link>
        <p className="mt-2 font-serif text-xs uppercase tracking-[0.3em] text-bronze-dark">Documents</p>
        <h1 className="mt-1 font-serif text-3xl text-ink sm:text-[34px]">Site documents</h1>
        <p className="mt-1 max-w-xl text-sm text-ink-muted">
          Every site&apos;s photos, plans, planning docs, investor packs and costs live in the shared
          OneDrive folder. Open it in the browser, or sync it to this Mac so it appears in Finder.
        </p>
      </section>

      <DocumentsSync rootUrl={rootUrl} />
    </div>
  );
}
