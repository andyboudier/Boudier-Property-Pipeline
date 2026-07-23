"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { actionCreateCalendarEvent, actionCreateTask, actionSetTaskCompleted } from "@/app/actions";
import type { CalEvent, TodoTask } from "@/lib/graph";

export function ProjectsWorkspace({
  signedIn,
  initialEvents,
  initialTasks,
  listId,
  error,
}: {
  signedIn: boolean;
  initialEvents: CalEvent[];
  initialTasks: TodoTask[];
  listId: string | null;
  error: string | null;
}) {
  const router = useRouter();

  if (!signedIn) {
    return (
      <div className="card p-6 text-sm text-ink-muted">
        Sign in with your Microsoft account to see and manage your calendar and tasks here.
        <div className="mt-4 flex gap-3">
          <a href="https://outlook.office.com/calendar/" target="_blank" rel="noopener noreferrer" className="btn-ghost">Open Outlook Calendar ↗</a>
          <a href="https://to-do.office.com/tasks/" target="_blank" rel="noopener noreferrer" className="btn-ghost">Open Microsoft To Do ↗</a>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card border-l-4 p-6 text-sm" style={{ borderLeftColor: "#C2872B" }}>
        <p className="font-medium text-ink">Couldn&apos;t reach Microsoft 365</p>
        <p className="mt-1 text-ink-muted">{error}</p>
        <p className="mt-2 text-xs text-ink-muted">
          If you just signed in, sign out and back in so the new calendar &amp; tasks permissions take effect.
        </p>
        <div className="mt-4 flex gap-3">
          <a href="/api/auth/signout" className="btn-ghost">Sign out</a>
          <a href="https://outlook.office.com/calendar/" target="_blank" rel="noopener noreferrer" className="btn-ghost">Outlook ↗</a>
          <a href="https://to-do.office.com/tasks/" target="_blank" rel="noopener noreferrer" className="btn-ghost">To Do ↗</a>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <CalendarPanel events={initialEvents} onChange={() => router.refresh()} />
      <TasksPanel tasks={initialTasks} listId={listId} onChange={() => router.refresh()} />
    </div>
  );
}

/* ── Calendar ─────────────────────────────────────────────────────────────── */

function CalendarPanel({ events, onChange }: { events: CalEvent[]; onChange: () => void }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [mins, setMins] = useState(60);
  const [location, setLocation] = useState("");
  const [err, setErr] = useState<string | null>(null);

  function add() {
    if (!subject.trim() || !date) {
      setErr("Add a title and a date.");
      return;
    }
    setErr(null);
    const startISO = `${date}T${time}:00`;
    const endD = new Date(`${date}T${time}:00`);
    endD.setMinutes(endD.getMinutes() + mins);
    const pad = (n: number) => String(n).padStart(2, "0");
    const endISO = `${endD.getFullYear()}-${pad(endD.getMonth() + 1)}-${pad(endD.getDate())}T${pad(endD.getHours())}:${pad(endD.getMinutes())}:00`;
    start(async () => {
      const r = await actionCreateCalendarEvent({ subject: subject.trim(), start: startISO, end: endISO, location: location.trim() || undefined });
      if (!r.ok) { setErr(r.error); return; }
      setSubject(""); setLocation(""); setDate(""); setOpen(false);
      onChange();
    });
  }

  return (
    <section className="card overflow-hidden">
      <header className="flex items-center justify-between border-b border-paper-line px-5 py-3">
        <h2 className="font-serif text-lg text-ink">Calendar</h2>
        <div className="flex items-center gap-2">
          <a href="https://outlook.office.com/calendar/" target="_blank" rel="noopener noreferrer" className="text-xs text-ink-muted hover:text-bronze-dark">Open in Outlook ↗</a>
          <button onClick={() => setOpen((o) => !o)} className="btn-bronze px-3 py-1.5 text-xs">{open ? "Close" : "+ New event"}</button>
        </div>
      </header>

      {open && (
        <div className="space-y-2 border-b border-paper-line bg-paper-warm/50 p-4">
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Event title (e.g. Site visit — 25 King Square)" className="field w-full" />
          <div className="flex flex-wrap gap-2">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="field" />
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="field" />
            <select value={mins} onChange={(e) => setMins(Number(e.target.value))} className="field">
              <option value={30}>30 min</option>
              <option value={60}>1 hour</option>
              <option value={90}>1.5 hours</option>
              <option value={120}>2 hours</option>
              <option value={240}>Half day</option>
            </select>
          </div>
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location (optional)" className="field w-full" />
          {err && <p className="text-xs text-red-600">{err}</p>}
          <button onClick={add} disabled={pending} className="btn-primary px-4 py-1.5 text-sm disabled:opacity-60">{pending ? "Adding…" : "Add to my calendar"}</button>
        </div>
      )}

      <ul className="divide-y divide-paper-line">
        {events.length === 0 && <li className="px-5 py-6 text-sm text-ink-muted">No events in the next 14 days.</li>}
        {events.map((e) => (
          <li key={e.id} className="flex items-start gap-3 px-5 py-3">
            <DateChip iso={e.start} allDay={e.allDay} />
            <div className="min-w-0 flex-1">
              <a href={e.webLink} target="_blank" rel="noopener noreferrer" className="block truncate font-medium text-ink hover:text-bronze-dark">{e.subject}</a>
              <div className="text-xs text-ink-muted">
                {e.allDay ? "All day" : `${fmtTime(e.start)}–${fmtTime(e.end)}`}
                {e.location ? ` · ${e.location}` : ""}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ── Tasks ────────────────────────────────────────────────────────────────── */

function TasksPanel({ tasks, listId, onChange }: { tasks: TodoTask[]; listId: string | null; onChange: () => void }) {
  const [pending, start] = useTransition();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function add() {
    if (!title.trim() || !listId) return;
    setErr(null);
    start(async () => {
      const r = await actionCreateTask(listId, title.trim(), due || undefined);
      if (!r.ok) { setErr(r.error); return; }
      setTitle(""); setDue("");
      onChange();
    });
  }

  function toggle(id: string, completed: boolean) {
    if (!listId) return;
    setBusyId(id);
    start(async () => {
      await actionSetTaskCompleted(listId, id, completed);
      setBusyId(null);
      onChange();
    });
  }

  return (
    <section className="card overflow-hidden">
      <header className="flex items-center justify-between border-b border-paper-line px-5 py-3">
        <h2 className="font-serif text-lg text-ink">Tasks</h2>
        <a href="https://to-do.office.com/tasks/" target="_blank" rel="noopener noreferrer" className="text-xs text-ink-muted hover:text-bronze-dark">Open in To Do ↗</a>
      </header>

      <div className="flex flex-wrap items-center gap-2 border-b border-paper-line bg-paper-warm/50 p-4">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
          placeholder="New task…"
          className="field min-w-[180px] flex-1"
          disabled={!listId}
        />
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="field" title="Due date (optional)" disabled={!listId} />
        <button onClick={add} disabled={pending || !title.trim() || !listId} className="btn-bronze px-4 py-1.5 text-sm disabled:opacity-60">Add</button>
      </div>
      {err && <p className="px-5 pt-2 text-xs text-red-600">{err}</p>}
      {!listId && <p className="px-5 py-4 text-sm text-ink-muted">No To Do lists found on your account.</p>}

      <ul className="divide-y divide-paper-line">
        {listId && tasks.length === 0 && <li className="px-5 py-6 text-sm text-ink-muted">No open tasks — you&apos;re all caught up.</li>}
        {tasks.map((t) => (
          <li key={t.id} className="flex items-center gap-3 px-5 py-2.5">
            <button
              onClick={() => toggle(t.id, !t.completed)}
              disabled={busyId === t.id}
              aria-label={t.completed ? "Mark not done" : "Mark done"}
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition ${t.completed ? "border-bronze bg-bronze text-white" : "border-ink-muted/50 hover:border-bronze"}`}
            >
              {t.completed && (
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5 9-10" /></svg>
              )}
            </button>
            <span className={`min-w-0 flex-1 text-sm ${t.completed ? "text-ink-muted line-through" : "text-ink"}`}>{t.title}</span>
            {t.due && <span className="shrink-0 text-xs text-ink-muted">due {fmtDate(t.due)}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ── helpers ──────────────────────────────────────────────────────────────── */

function DateChip({ iso, allDay }: { iso: string; allDay: boolean }) {
  const d = iso ? new Date(iso) : null;
  const day = d ? d.toLocaleDateString("en-GB", { weekday: "short" }) : "";
  const num = d ? d.getDate() : "";
  return (
    <div className="flex w-11 shrink-0 flex-col items-center rounded-lg bg-paper-warm py-1 text-center" title={allDay ? "All day" : ""}>
      <span className="text-[10px] font-semibold uppercase text-bronze-dark">{day}</span>
      <span className="text-base font-semibold leading-none text-ink">{num}</span>
    </div>
  );
}
function fmtTime(iso: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
