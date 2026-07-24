import Link from "next/link";
import { auth } from "@/auth";
import { isAuthConfigured } from "@/lib/authConfig";
import { listUpcomingEvents, listTasks, defaultListId, NotSharedError, PROJECTS_OWNER, type CalEvent, type TodoTask } from "@/lib/graph";
import { ProjectsWorkspace } from "@/components/ProjectsWorkspace";

export const dynamic = "force-dynamic";

// Project Management: the SHARED project calendar and To Do list owned by
// Vanessa (PROJECTS_OWNER), read/written live via Graph using the signed-in
// user's own token. Vanessa shares both once; each user accepts once. Each
// panel degrades gracefully with guidance until the share is accepted.
export default async function ProjectsPage() {
  const session = isAuthConfigured() ? await auth() : null;
  const owner = PROJECTS_OWNER.split("@")[0].replace(/^\w/, (c) => c.toUpperCase()); // "Vanessa"

  let events: CalEvent[] = [];
  let tasks: TodoTask[] = [];
  let listId: string | null = null;
  let calendarNotShared = false;
  let tasksNotShared = false;
  let error: string | null = null;

  if (session?.user) {
    // Calendar and tasks are independent — one can work while the other's
    // share is still pending.
    const [calRes, taskRes] = await Promise.allSettled([
      listUpcomingEvents(14),
      (async () => {
        const id = await defaultListId();
        return { id, tasks: await listTasks(id, false) };
      })(),
    ]);

    if (calRes.status === "fulfilled") events = calRes.value;
    else if (calRes.reason instanceof NotSharedError) calendarNotShared = true;
    else error = calRes.reason instanceof Error ? calRes.reason.message : "Couldn't reach Microsoft 365.";

    if (taskRes.status === "fulfilled") {
      listId = taskRes.value.id;
      tasks = taskRes.value.tasks;
    } else if (taskRes.reason instanceof NotSharedError) tasksNotShared = true;
    else if (!error) error = taskRes.reason instanceof Error ? taskRes.reason.message : "Couldn't reach Microsoft 365.";
  }

  return (
    <div className="space-y-6">
      <section>
        <Link href="/" className="text-xs text-ink-muted hover:text-bronze-dark">← Home</Link>
        <p className="mt-2 font-serif text-xs uppercase tracking-[0.3em] text-bronze-dark">Project Management</p>
        <h1 className="mt-1 font-serif text-3xl text-ink sm:text-[34px]">Calendar &amp; Tasks</h1>
        <p className="mt-1 max-w-xl text-sm text-ink-muted">
          {owner}&apos;s shared project calendar and to-do list. Add events and tasks here and they
          appear for the whole team in Outlook and To Do straight away.
        </p>
      </section>

      <ProjectsWorkspace
        signedIn={!!session?.user}
        initialEvents={events}
        initialTasks={tasks}
        listId={listId}
        error={error}
        ownerName={owner}
        ownerEmail={PROJECTS_OWNER}
        calendarNotShared={calendarNotShared}
        tasksNotShared={tasksNotShared}
      />
    </div>
  );
}
