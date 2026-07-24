"use client";

import { useState } from "react";
import { MeetingScheduler } from "./MeetingScheduler";

export function ScheduleMeetingButton({ className = "btn-bronze" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className={className}>+ Teams meeting</button>
      <MeetingScheduler open={open} onClose={() => setOpen(false)} />
    </>
  );
}
