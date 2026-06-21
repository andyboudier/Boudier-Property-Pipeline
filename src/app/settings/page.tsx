import Link from "next/link";
import { getSettings } from "@/lib/db";
import { SettingsForm } from "@/components/SettingsForm";
import { PasskeyManager } from "@/components/PasskeyManager";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await getSettings();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/" className="text-xs text-ink-muted hover:text-bronze-dark">← Pipeline</Link>
        <h1 className="mt-2 font-serif text-2xl text-ink">Procedability criteria</h1>
        <p className="text-sm text-ink-muted">
          These thresholds drive the traffic-light verdict across every site. Changes apply immediately.
        </p>
      </div>
      <SettingsForm initial={settings} />
      <PasskeyManager />
    </div>
  );
}
