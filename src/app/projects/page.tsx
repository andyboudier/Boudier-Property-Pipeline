import Link from "next/link";
import { auth } from "@/auth";
import { isAuthConfigured } from "@/lib/authConfig";

export const dynamic = "force-dynamic";

// Project Management: jump-off points into the signed-in user's own Microsoft
// 365 tools. The links open under their Microsoft session, so each person
// lands in their own calendar and task list automatically.
export default async function ProjectsPage() {
  const session = isAuthConfigured() ? await auth() : null;
  const who = session?.user?.email || session?.user?.name || "";

  const tools = [
    {
      href: "https://outlook.office.com/calendar/",
      label: "Outlook Calendar",
      desc: "Site visits, meetings and key project dates — your own Outlook calendar.",
      color: "#2F6FC2",
      icon: (
        <Svg>
          <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" fill="currentColor" fillOpacity=".12" />
          <path d="M3.5 9.5h17M8 3v4M16 3v4" />
          <circle cx="8.5" cy="13.5" r="1.1" fill="currentColor" stroke="none" />
          <circle cx="12" cy="13.5" r="1.1" fill="currentColor" stroke="none" />
          <circle cx="15.5" cy="13.5" r="1.1" fill="currentColor" stroke="none" />
          <circle cx="8.5" cy="17" r="1.1" fill="currentColor" stroke="none" />
          <circle cx="12" cy="17" r="1.1" fill="currentColor" stroke="none" />
        </Svg>
      ),
    },
    {
      href: "https://to-do.office.com/tasks/",
      label: "Microsoft To Do",
      desc: "Your project task lists — capture, prioritise and tick off actions.",
      color: "#2E7D5B",
      icon: (
        <Svg>
          <rect x="4" y="4" width="16" height="16" rx="3" fill="currentColor" fillOpacity=".12" />
          <path d="m8.2 12.4 2.5 2.5 5.1-5.3" />
        </Svg>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href="/" className="text-xs text-ink-muted hover:text-bronze-dark">← Home</Link>
          <p className="mt-2 font-serif text-xs uppercase tracking-[0.3em] text-bronze-dark">Project Management</p>
          <h1 className="mt-1 font-serif text-3xl text-ink sm:text-[34px]">Calendar &amp; Tasks</h1>
          <p className="mt-1 max-w-xl text-sm text-ink-muted">
            Your Microsoft 365 tools{who ? <> for <span className="font-medium text-ink">{who}</span></> : ""} —
            each link opens in a new tab under your own account.
          </p>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        {tools.map((t) => (
          <a
            key={t.label}
            href={t.href}
            target="_blank"
            rel="noopener noreferrer"
            className="home-card"
            style={{ ["--c" as string]: t.color }}
          >
            <span className="home-glow" aria-hidden="true" />
            <span className="home-ic">{t.icon}</span>
            <span className="home-label">
              {t.label}
              <span className="ml-1.5 text-[13px] opacity-60">↗</span>
            </span>
            <span className="home-desc">{t.desc}</span>
            <span className="home-go" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </span>
          </a>
        ))}
      </div>

      <p className="text-xs text-ink-muted">
        Tip: pin a shared project calendar in Outlook and it&apos;ll appear alongside your own when the
        calendar opens. If you&apos;d like project deadlines or site tasks shown directly inside this page
        later, that&apos;s possible too (it needs two extra Microsoft permissions).
      </p>
    </div>
  );
}

function Svg({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}
