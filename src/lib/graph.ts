import "server-only";
import { getGraphToken } from "@/auth";

// Thin Microsoft Graph client that acts as the signed-in user (delegated token
// from the session). The Project Management section shows a SHARED calendar and
// To Do list owned by PROJECTS_OWNER (Vanessa) so every user sees the same
// project diary and task list. Vanessa shares her calendar + list once; each
// user accepts the share once; the app then reads/writes them via the user's
// own token (needs the Calendars.ReadWrite.Shared / Tasks.ReadWrite.Shared
// scopes).

const GRAPH = "https://graph.microsoft.com/v1.0";

// The account whose shared calendar + To Do list the team works from.
export const PROJECTS_OWNER = (process.env.PROJECTS_OWNER || "vanessa@boudierproperty.co.uk").toLowerCase();
// Optional: the exact name of Vanessa's shared To Do list (else the first list
// she has shared with the user is used).
const PROJECTS_TODO_LIST = process.env.PROJECTS_TODO_LIST || "";

/** Thrown when Vanessa hasn't shared the calendar/list with this user yet. */
export class NotSharedError extends Error {
  kind: "calendar" | "tasks";
  constructor(kind: "calendar" | "tasks") {
    super(kind === "calendar" ? "Shared calendar not found" : "Shared task list not found");
    this.kind = kind;
  }
}

class GraphError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function graph<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getGraphToken();
  if (!token) throw new GraphError(401, "Not signed in");
  const res = await fetch(`${GRAPH}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new GraphError(res.status, data?.error?.message || `Graph ${res.status}`);
  }
  return data as T;
}

export const isGraphConfigured = () => true; // gated by session token at call time

/* ── Calendar ─────────────────────────────────────────────────────────────── */

export interface CalEvent {
  id: string;
  subject: string;
  start: string; // ISO
  end: string; // ISO
  allDay: boolean;
  location: string;
  webLink: string;
  organizer: string;
}

/** Find the calendar Vanessa has shared with this user (appears in the user's
 * own calendar list once accepted). Throws NotSharedError if it isn't there. */
async function sharedCalendarId(): Promise<string> {
  const data = await graph<{ value: { id: string; name?: string; owner?: { address?: string } }[] }>(
    `/me/calendars?$select=id,name,owner&$top=50`,
  );
  const cal = (data.value || []).find((c) => c.owner?.address?.toLowerCase() === PROJECTS_OWNER);
  if (!cal) throw new NotSharedError("calendar");
  return cal.id;
}

/** Vanessa's shared-calendar events over the next `days` days. */
export async function listUpcomingEvents(days = 14): Promise<CalEvent[]> {
  const calId = await sharedCalendarId();
  const start = new Date();
  const end = new Date(start.getTime() + days * 86400_000);
  const params = new URLSearchParams({
    startDateTime: start.toISOString(),
    endDateTime: end.toISOString(),
    $orderby: "start/dateTime",
    $top: "25",
    $select: "id,subject,start,end,isAllDay,location,webLink,organizer",
  });
  const data = await graph<{ value: RawEvent[] }>(`/me/calendars/${calId}/calendarView?${params}`, {
    headers: { Prefer: 'outlook.timezone="Europe/London"' },
  });
  return (data.value || []).map(mapEvent);
}

export async function createEvent(input: {
  subject: string;
  start: string; // ISO local (no Z) or ISO
  end: string;
  location?: string;
  allDay?: boolean;
}): Promise<CalEvent> {
  const calId = await sharedCalendarId();
  const body = {
    subject: input.subject,
    isAllDay: !!input.allDay,
    start: { dateTime: input.start, timeZone: "Europe/London" },
    end: { dateTime: input.end, timeZone: "Europe/London" },
    ...(input.location ? { location: { displayName: input.location } } : {}),
  };
  const ev = await graph<RawEvent>(`/me/calendars/${calId}/events`, { method: "POST", body: JSON.stringify(body) });
  return mapEvent(ev);
}

interface RawEvent {
  id: string;
  subject?: string;
  start?: { dateTime?: string };
  end?: { dateTime?: string };
  isAllDay?: boolean;
  location?: { displayName?: string };
  webLink?: string;
  organizer?: { emailAddress?: { name?: string } };
}
function mapEvent(e: RawEvent): CalEvent {
  return {
    id: e.id,
    subject: e.subject || "(no title)",
    start: e.start?.dateTime || "",
    end: e.end?.dateTime || "",
    allDay: !!e.isAllDay,
    location: e.location?.displayName || "",
    webLink: e.webLink || "",
    organizer: e.organizer?.emailAddress?.name || "",
  };
}

/* ── Microsoft To Do ──────────────────────────────────────────────────────── */

export interface TodoList {
  id: string;
  name: string;
}
export interface TodoTask {
  id: string;
  title: string;
  status: string; // "notStarted" | "completed" | …
  completed: boolean;
  due: string | null; // ISO date
  importance: string;
}

export async function listTaskLists(): Promise<TodoList[]> {
  const data = await graph<{ value: RawList[] }>(`/me/todo/lists`);
  return (data.value || []).map((l) => ({ id: l.id, name: l.displayName }));
}

interface RawList {
  id: string;
  displayName: string;
  isOwner?: boolean;
  isShared?: boolean;
}

/** Vanessa's shared To Do list — i.e. a list shared WITH this user (isOwner
 * false). Prefers PROJECTS_TODO_LIST by name if configured. Throws
 * NotSharedError if no shared list has been accepted yet. */
export async function defaultListId(): Promise<string> {
  const data = await graph<{ value: RawList[] }>(`/me/todo/lists`);
  const lists = data.value || [];
  const shared = lists.filter((l) => l.isOwner === false || l.isShared === true);
  const pool = shared.length ? shared : [];
  const pick =
    (PROJECTS_TODO_LIST && pool.find((l) => l.displayName?.toLowerCase() === PROJECTS_TODO_LIST.toLowerCase())) ||
    pool[0];
  if (!pick) throw new NotSharedError("tasks");
  return pick.id;
}

export async function listTasks(listId: string, includeCompleted = false): Promise<TodoTask[]> {
  const params = new URLSearchParams({ $top: "50", $orderby: "createdDateTime desc" });
  if (!includeCompleted) params.set("$filter", "status ne 'completed'");
  const data = await graph<{ value: RawTask[] }>(`/me/todo/lists/${listId}/tasks?${params}`);
  return (data.value || []).map(mapTask);
}

export async function createTask(listId: string, title: string, due?: string): Promise<TodoTask> {
  const body: Record<string, unknown> = { title };
  if (due) body.dueDateTime = { dateTime: `${due}T00:00:00`, timeZone: "Europe/London" };
  const t = await graph<RawTask>(`/me/todo/lists/${listId}/tasks`, { method: "POST", body: JSON.stringify(body) });
  return mapTask(t);
}

export async function setTaskCompleted(listId: string, taskId: string, completed: boolean): Promise<void> {
  await graph(`/me/todo/lists/${listId}/tasks/${taskId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: completed ? "completed" : "notStarted" }),
  });
}

interface RawTask {
  id: string;
  title?: string;
  status?: string;
  importance?: string;
  dueDateTime?: { dateTime?: string };
}
function mapTask(t: RawTask): TodoTask {
  return {
    id: t.id,
    title: t.title || "(untitled)",
    status: t.status || "notStarted",
    completed: t.status === "completed",
    due: t.dueDateTime?.dateTime ? t.dueDateTime.dateTime.slice(0, 10) : null,
    importance: t.importance || "normal",
  };
}

export { GraphError };
