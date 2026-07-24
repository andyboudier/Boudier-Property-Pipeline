import { listProperties, listLeads, listContacts } from "@/lib/db";
import { auth } from "@/auth";
import { isAuthConfigured } from "@/lib/authConfig";
import { SplashScreen } from "@/components/SplashScreen";

export const dynamic = "force-dynamic";

// Post-login landing: animated splash (once per session) then a section
// chooser — mirrors the ACT Halo app's home, in Boudier branding.
export default async function HomePage() {
  const [properties, leads, contacts, session] = await Promise.all([
    listProperties().catch(() => []),
    listLeads().catch(() => []),
    listContacts().catch(() => []),
    isAuthConfigured() ? auth() : Promise.resolve(null),
  ]);
  const first = (session?.user?.name || "").trim().split(/\s+/)[0] || "";
  const activeLeads = leads.filter((l) => l.status === "new" || l.status === "reviewing").length;

  const tiles: {
    href: string;
    label: string;
    desc: string;
    color: string;
    count?: string;
    external?: boolean;
    icon: JSX.Element;
  }[] = [
    {
      href: "/pipeline",
      label: "Pipeline",
      desc: "Site appraisals — DCAS, MAC & IPAD",
      color: "#2E7D5B",
      count: `${properties.length} sites`,
      icon: (
        <Svg>
          <path d="M4 4v16h16" />
          <rect x="7" y="12" width="2.8" height="5" rx="1" fill="currentColor" fillOpacity=".18" />
          <rect x="11.6" y="9" width="2.8" height="8" rx="1" fill="currentColor" fillOpacity=".18" />
          <rect x="16.2" y="6" width="2.8" height="11" rx="1" fill="currentColor" fillOpacity=".18" />
        </Svg>
      ),
    },
    {
      href: "/prospects",
      label: "Prospects",
      desc: "Pre-pipeline leads, auto-monitor & insolvency scans",
      color: "#C2872B",
      count: `${activeLeads} to review`,
      icon: (
        <Svg>
          <circle cx="10.5" cy="10.5" r="6" fill="currentColor" fillOpacity=".14" />
          <path d="m15.2 15.2 4.8 4.8" />
          <path d="M8 10.5h5M10.5 8v5" strokeOpacity=".85" />
        </Svg>
      ),
    },
    {
      href: "/contacts",
      label: "Contacts",
      desc: "Architects, agents, accountants & advisors",
      color: "#4F6D7A",
      count: `${contacts.length} contacts`,
      icon: (
        <Svg>
          <circle cx="9" cy="8.5" r="3.2" fill="currentColor" fillOpacity=".16" />
          <path d="M3.8 19a5.2 5.2 0 0 1 10.4 0" />
          <circle cx="16.8" cy="9.5" r="2.5" fill="currentColor" fillOpacity=".16" />
          <path d="M14.6 18.6a4.4 4.4 0 0 1 5.6-3.4" />
        </Svg>
      ),
    },
    {
      href: "/projects",
      label: "Project Management",
      desc: "Your Outlook calendar & Microsoft To Do",
      color: "#B08D57",
      icon: (
        <Svg>
          <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" fill="currentColor" fillOpacity=".12" />
          <path d="M3.5 9.5h17M8 3v4M16 3v4" />
          <path d="m8.6 14.6 2 2 4.4-4.4" strokeOpacity=".9" />
        </Svg>
      ),
    },
    {
      href: "/documents",
      label: "Documents",
      desc: "Site folders on OneDrive — open or sync to your Mac",
      color: "#8C6E40",
      icon: (
        <Svg>
          <path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-10.5Z" fill="currentColor" fillOpacity=".14" />
          <path d="M3.5 11h17" strokeOpacity=".7" />
        </Svg>
      ),
    },
  ];

  return (
    <div className="home-wrap">
      <SplashScreen />
      <div className="home-bg" aria-hidden="true" />

      <section className="mb-8 mt-4">
        <p className="font-serif text-xs uppercase tracking-[0.3em] text-bronze-dark">Boudier Property</p>
        <h1 className="mt-1 font-serif text-3xl text-ink sm:text-[38px]">
          Welcome{first ? <>, <span className="home-name">{first}</span></> : ""}
        </h1>
        <p className="mt-2 max-w-xl text-sm text-ink-muted">
          Your workspace — choose a section to get started.
        </p>
      </section>

      <div className="home-grid">
        {tiles.map((t, i) => (
          <a
            key={t.label}
            href={t.href}
            {...(t.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            className="home-card"
            style={{ ["--c" as string]: t.color, animationDelay: `${i * 60}ms` }}
          >
            <span className="home-glow" aria-hidden="true" />
            <span className="home-ic">{t.icon}</span>
            <span className="home-label">
              {t.label}
              {t.external && <span className="ml-1.5 text-[13px] opacity-60">↗</span>}
            </span>
            <span className="home-desc">{t.desc}</span>
            {t.count && <span className="home-count">{t.count}</span>}
            <span className="home-go" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </span>
          </a>
        ))}
      </div>
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
