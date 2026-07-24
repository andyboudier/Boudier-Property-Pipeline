"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { actionScheduleMeeting, actionAttendeeSuggestions } from "@/app/actions";

type Suggestion = { email: string; name: string };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Modal to schedule a Teams meeting. Attendee emails autofill from the contact
 * database and previously-used addresses; each is a removable chip. */
export function MeetingScheduler({
  open,
  onClose,
  initialSubject = "",
  initialAttendees = [],
}: {
  open: boolean;
  onClose: () => void;
  initialSubject?: string;
  initialAttendees?: string[];
}) {
  const [subject, setSubject] = useState(initialSubject);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:00");
  const [mins, setMins] = useState(30);
  const [attendees, setAttendees] = useState<string[]>(initialAttendees);
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showList, setShowList] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ joinUrl: string; webLink: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const boxRef = useRef<HTMLDivElement>(null);

  // Reset to the given presets each time the modal is opened; default the date
  // to today.
  useEffect(() => {
    if (open) {
      setSubject(initialSubject);
      setAttendees(initialAttendees);
      setInput("");
      setErr(null);
      setResult(null);
      const t = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      setDate(`${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`);
      actionAttendeeSuggestions().then(setSuggestions).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const filtered = useMemo(() => {
    const q = input.trim().toLowerCase();
    const chosen = new Set(attendees.map((a) => a.toLowerCase()));
    return suggestions
      .filter((s) => !chosen.has(s.email.toLowerCase()))
      .filter((s) => !q || s.email.toLowerCase().includes(q) || s.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [input, suggestions, attendees]);

  if (!open) return null;

  function addEmail(email: string) {
    const e = email.trim();
    if (!e) return;
    if (!EMAIL_RE.test(e)) {
      setErr(`"${e}" isn't a valid email.`);
      return;
    }
    if (!attendees.some((a) => a.toLowerCase() === e.toLowerCase())) setAttendees((prev) => [...prev, e]);
    setInput("");
    setErr(null);
    setShowList(false);
  }
  function remove(email: string) {
    setAttendees((prev) => prev.filter((a) => a !== email));
  }
  function nameFor(email: string) {
    return suggestions.find((s) => s.email.toLowerCase() === email.toLowerCase())?.name || "";
  }

  function schedule() {
    if (!subject.trim()) return setErr("Add a meeting title.");
    if (!date) return setErr("Choose a date.");
    if (attendees.length === 0) return setErr("Add at least one attendee.");
    setErr(null);
    const startISO = `${date}T${time}:00`;
    const endD = new Date(`${date}T${time}:00`);
    endD.setMinutes(endD.getMinutes() + mins);
    const pad = (n: number) => String(n).padStart(2, "0");
    const endISO = `${endD.getFullYear()}-${pad(endD.getMonth() + 1)}-${pad(endD.getDate())}T${pad(endD.getHours())}:${pad(endD.getMinutes())}:00`;
    start(async () => {
      const r = await actionScheduleMeeting({ subject: subject.trim(), start: startISO, end: endISO, attendees });
      if (!r.ok) return setErr(r.error);
      setResult({ joinUrl: r.meeting.joinUrl, webLink: r.meeting.webLink });
    });
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/60 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl bg-paper-warm p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-serif text-lg text-ink">Schedule a Teams meeting</h2>
          <button onClick={onClose} className="text-ink-muted hover:text-ink" aria-label="Close">✕</button>
        </div>

        {result ? (
          <div className="space-y-3">
            <p className="text-sm font-medium text-ink">Meeting created ✓ — the invite is on its way to attendees.</p>
            {result.joinUrl && (
              <div className="flex items-center gap-2">
                <input readOnly value={result.joinUrl} className="field flex-1 text-xs" onFocus={(e) => e.currentTarget.select()} />
                <button
                  onClick={() => { navigator.clipboard?.writeText(result.joinUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                  className="btn-ghost px-3 py-1.5 text-xs"
                >
                  {copied ? "Copied" : "Copy link"}
                </button>
              </div>
            )}
            <div className="flex gap-2">
              {result.joinUrl && <a href={result.joinUrl} target="_blank" rel="noopener noreferrer" className="btn-bronze px-4 py-1.5 text-sm">Join in Teams ↗</a>}
              {result.webLink && <a href={result.webLink} target="_blank" rel="noopener noreferrer" className="btn-ghost px-4 py-1.5 text-sm">Open in Outlook ↗</a>}
              <button onClick={onClose} className="btn-ghost px-4 py-1.5 text-sm">Done</button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Meeting title" className="field w-full" />

            <div className="flex flex-wrap gap-2">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="field" />
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="field" />
              <select value={mins} onChange={(e) => setMins(Number(e.target.value))} className="field">
                <option value={15}>15 min</option>
                <option value={30}>30 min</option>
                <option value={45}>45 min</option>
                <option value={60}>1 hour</option>
                <option value={90}>1.5 hours</option>
              </select>
            </div>

            {/* Attendees */}
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Attendees</label>
              {attendees.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {attendees.map((a) => (
                    <span key={a} className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs text-ink ring-1 ring-paper-line">
                      {nameFor(a) ? <span className="font-medium">{nameFor(a)}</span> : null}
                      <span className="text-ink-muted">{a}</span>
                      <button onClick={() => remove(a)} className="ml-0.5 text-ink-muted hover:text-red-600" aria-label={`Remove ${a}`}>✕</button>
                    </span>
                  ))}
                </div>
              )}
              <div className="relative" ref={boxRef}>
                <input
                  value={input}
                  onChange={(e) => { setInput(e.target.value); setShowList(true); }}
                  onFocus={() => setShowList(true)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addEmail(filtered[0]?.email || input); }
                    if (e.key === "Backspace" && !input && attendees.length) remove(attendees[attendees.length - 1]);
                  }}
                  placeholder="Type a name or email…"
                  className="field w-full"
                />
                {showList && filtered.length > 0 && (
                  <ul className="absolute z-10 mt-1 max-h-52 w-full overflow-auto rounded-lg border border-paper-line bg-white shadow-lg">
                    {filtered.map((s) => (
                      <li key={s.email}>
                        <button
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); addEmail(s.email); }}
                          className="flex w-full flex-col items-start px-3 py-1.5 text-left hover:bg-paper-warm"
                        >
                          {s.name && <span className="text-sm text-ink">{s.name}</span>}
                          <span className="text-xs text-ink-muted">{s.email}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <p className="mt-1 text-[11px] text-ink-muted">Suggestions come from your contacts and people you&apos;ve invited before. Press Enter to add a typed email.</p>
            </div>

            {err && <p className="text-xs text-red-600">{err}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={onClose} className="btn-ghost px-4 py-1.5 text-sm">Cancel</button>
              <button onClick={schedule} disabled={pending} className="btn-primary px-4 py-1.5 text-sm disabled:opacity-60">
                {pending ? "Scheduling…" : "Schedule Teams meeting"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
