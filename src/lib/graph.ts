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

// Vanessa's mailbox, addressed directly. This works both when the caller has
// Exchange "Full Access" to her mailbox AND when she's shared her calendar with
// them — either way the .Shared scope lets a delegated token reach it.
const OWNER_PATH = `/users/${encodeURIComponent(PROJECTS_OWNER)}`;

function asNotShared<T>(kind: "calendar" | "tasks", e: unknown): T {
  if (e instanceof GraphError && (e.status === 403 || e.status === 404)) throw new NotSharedError(kind);
  throw e;
}

/** Vanessa's calendar events over the next `days` days. */
export async function listUpcomingEvents(days = 14): Promise<CalEvent[]> {
  const start = new Date();
  const end = new Date(start.getTime() + days * 86400_000);
  const params = new URLSearchParams({
    startDateTime: start.toISOString(),
    endDateTime: end.toISOString(),
    $orderby: "start/dateTime",
    $top: "25",
    $select: "id,subject,start,end,isAllDay,location,webLink,organizer",
  });
  try {
    const data = await graph<{ value: RawEvent[] }>(`${OWNER_PATH}/calendarView?${params}`, {
      headers: { Prefer: 'outlook.timezone="Europe/London"' },
    });
    return (data.value || []).map(mapEvent);
  } catch (e) {
    return asNotShared("calendar", e);
  }
}

export async function createEvent(input: {
  subject: string;
  start: string; // ISO local (no Z) or ISO
  end: string;
  location?: string;
  allDay?: boolean;
}): Promise<CalEvent> {
  const body = {
    subject: input.subject,
    isAllDay: !!input.allDay,
    start: { dateTime: input.start, timeZone: "Europe/London" },
    end: { dateTime: input.end, timeZone: "Europe/London" },
    ...(input.location ? { location: { displayName: input.location } } : {}),
  };
  try {
    const ev = await graph<RawEvent>(`${OWNER_PATH}/events`, { method: "POST", body: JSON.stringify(body) });
    return mapEvent(ev);
  } catch (e) {
    return asNotShared("calendar", e);
  }
}

export interface MeetingResult {
  id: string;
  subject: string;
  start: string;
  end: string;
  joinUrl: string;
  webLink: string;
}

/** Create a Teams online meeting on Vanessa's shared project calendar (she is
 * the organizer) and invite the attendee emails, so it shows on the team's
 * shared calendar. */
export async function createTeamsMeeting(input: {
  subject: string;
  start: string;
  end: string;
  attendees: string[];
}): Promise<MeetingResult> {
  const body = {
    subject: input.subject,
    start: { dateTime: input.start, timeZone: "Europe/London" },
    end: { dateTime: input.end, timeZone: "Europe/London" },
    isOnlineMeeting: true,
    onlineMeetingProvider: "teamsForBusiness",
    attendees: input.attendees
      .filter(Boolean)
      .map((a) => ({ emailAddress: { address: a }, type: "required" })),
  };
  let ev: RawEvent & { onlineMeeting?: { joinUrl?: string } };
  try {
    ev = await graph<RawEvent & { onlineMeeting?: { joinUrl?: string } }>(`${OWNER_PATH}/events`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  } catch (e) {
    return asNotShared("calendar", e);
  }
  return {
    id: ev.id,
    subject: ev.subject || input.subject,
    start: ev.start?.dateTime || input.start,
    end: ev.end?.dateTime || input.end,
    joinUrl: ev.onlineMeeting?.joinUrl || "",
    webLink: ev.webLink || "",
  };
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

interface RawList {
  id: string;
  displayName: string;
  isOwner?: boolean;
  isShared?: boolean;
  wellknownListName?: string;
}

// The client holds an opaque token that encodes BOTH the base path (Vanessa's
// mailbox vs the user's own) and the list id, so task read/writes hit the right
// place without the client needing to know which.
function packToken(base: string, listId: string): string {
  return `${base}::${listId}`;
}
function unpackToken(token: string): { base: string; listId: string } {
  const i = token.indexOf("::");
  return i === -1 ? { base: "/me/todo", listId: token } : { base: token.slice(0, i), listId: token.slice(i + 2) };
}

function pickList(lists: RawList[]): RawList | undefined {
  return (
    (PROJECTS_TODO_LIST && lists.find((l) => l.displayName?.toLowerCase() === PROJECTS_TODO_LIST.toLowerCase())) ||
    lists.find((l) => l.wellknownListName === "defaultList") ||
    lists[0]
  );
}

/** Resolve which To Do list to work from, preferring Vanessa's mailbox directly
 * (Full Access), then a list she's shared with the user. Returns an opaque
 * token used by the task read/write helpers. Throws NotSharedError if neither
 * is reachable. */
export async function defaultListId(): Promise<string> {
  // 1) Vanessa's mailbox directly — works with Exchange Full Access.
  try {
    const data = await graph<{ value: RawList[] }>(`${OWNER_PATH}/todo/lists`);
    const pick = pickList(data.value || []);
    if (pick) return packToken(`${OWNER_PATH}/todo`, pick.id);
  } catch {
    /* fall back to a shared list */
  }
  // 2) A list Vanessa has shared with this user (appears in their own lists).
  const data = await graph<{ value: RawList[] }>(`/me/todo/lists`);
  const shared = (data.value || []).filter((l) => l.isOwner === false || l.isShared === true);
  const pick = pickList(shared);
  if (!pick) throw new NotSharedError("tasks");
  return packToken("/me/todo", pick.id);
}

export async function listTasks(token: string, includeCompleted = false): Promise<TodoTask[]> {
  const { base, listId } = unpackToken(token);
  const params = new URLSearchParams({ $top: "50", $orderby: "createdDateTime desc" });
  if (!includeCompleted) params.set("$filter", "status ne 'completed'");
  try {
    const data = await graph<{ value: RawTask[] }>(`${base}/lists/${listId}/tasks?${params}`);
    return (data.value || []).map(mapTask);
  } catch (e) {
    return asNotShared("tasks", e);
  }
}

export async function createTask(token: string, title: string, due?: string): Promise<TodoTask> {
  const { base, listId } = unpackToken(token);
  const body: Record<string, unknown> = { title };
  if (due) body.dueDateTime = { dateTime: `${due}T00:00:00`, timeZone: "Europe/London" };
  const t = await graph<RawTask>(`${base}/lists/${listId}/tasks`, { method: "POST", body: JSON.stringify(body) });
  return mapTask(t);
}

export async function setTaskCompleted(token: string, taskId: string, completed: boolean): Promise<void> {
  const { base, listId } = unpackToken(token);
  await graph(`${base}/lists/${listId}/tasks/${taskId}`, {
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
