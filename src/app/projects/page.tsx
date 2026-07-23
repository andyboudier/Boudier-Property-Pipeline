import Link from "next/link";
import { auth } from "@/auth";
import { isAuthConfigured } from "@/lib/authConfig";
import { listUpcomingEvents, listTasks, defaultListId, type CalEvent, type TodoTask } from "@/lib/graph";
import { ProjectsWorkspace } from "@/components/ProjectsWorkspace";

export const dynamic = "force-dynamic";

// Project Management: the signed-in user's own Outlook calendar and Microsoft
// To Do, read and written live via Graph (delegated). Falls back to plain
// links when SSO isn't configured or the Graph call fails.
export default async function ProjectsPage() {
  const session = isAuthConfigured() ? await auth() : null;
  const who = session?.user?.name || session?.user?.email || "";

  let events: CalEvent[] | null = null;
  let tasks: TodoTask[] | null = null;
  let listId: string | null = null;
  let error: string | null = null;

  if (session?.user) {
    try {
      listId = await defaultListId();
      [events, tasks] = await Promise.all([
        listUpcomingEvents(14),
        listId ? listTasks(listId, false) : Promise.resolve([] as TodoTask[]),
      ]);
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't reach Microsoft 365.";
    }
  }

  return (
    <div className="space-y-6">
      <section>
        <Link href="/" className="text-xs text-ink-muted hover:text-bronze-dark">← Home</Link>
        <p className="mt-2 font-serif text-xs uppercase tracking-[0.3em] text-bronze-dark">Project Management</p>
        <h1 className="mt-1 font-serif text-3xl text-ink sm:text-[34px]">Calendar &amp; Tasks</h1>
        <p className="mt-1 max-w-xl text-sm text-ink-muted">
          Your Microsoft 365 calendar and to-do list{who ? <> — signed in as <span className="font-medium text-ink">{who}</span></> : ""}.
          Add events and tasks here and they appear in Outlook and To Do straight away.
        </p>
      </section>

      <ProjectsWorkspace
        signedIn={!!session?.user}
        initialEvents={events ?? []}
        initialTasks={tasks ?? []}
        listId={listId}
        error={error}
      />
    </div>
  );
}
