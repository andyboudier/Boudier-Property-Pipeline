import Link from "next/link";
import { listContacts } from "@/lib/db";
import { ContactsView } from "@/components/ContactsView";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const contacts = await listContacts();
  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="text-xs text-ink-muted hover:text-bronze-dark">← Pipeline</Link>
        <h1 className="mt-2 font-serif text-2xl text-ink">Contacts</h1>
        <p className="text-sm text-ink-muted">
          Your professional address book. Scan a business card to add a contact automatically, search across everything,
          and filter by category.
        </p>
      </div>
      <ContactsView initialContacts={contacts} />
    </div>
  );
}
