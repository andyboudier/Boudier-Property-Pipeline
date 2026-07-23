"use client";

import { useCallback, useEffect, useState } from "react";

/* eslint-disable @next/next/no-img-element */
// One-off animated welcome shown when the app opens (mirrors the ACT Halo app).
// Plays once per browser session (sessionStorage), auto-dismisses after ~2.2s,
// and can be clicked away.
export function SplashScreen() {
  const [phase, setPhase] = useState<"hidden" | "in" | "out">("hidden");

  const dismiss = useCallback(() => {
    setPhase("out");
    setTimeout(() => setPhase("hidden"), 600);
  }, []);

  useEffect(() => {
    try {
      if (sessionStorage.getItem("boudier-splash-seen")) return;
      sessionStorage.setItem("boudier-splash-seen", "1");
    } catch {
      /* private mode: just show it */
    }
    setPhase("in");
    // Deliberately no cleanup: under React strict mode the double-run would
    // clear this one-shot timer and leave the splash stuck on screen.
    setTimeout(dismiss, 2200);
  }, [dismiss]);

  if (phase === "hidden") return null;
  return (
    <div className={`splash${phase === "out" ? " out" : ""}`} onClick={dismiss} role="presentation">
      <div className="splash-inner">
        <span className="splash-glow" aria-hidden="true" />
        <img className="splash-logo" src="/boudier-logo.png" alt="Boudier Property" />
        <div className="splash-welcome">
          Welcome to <span>Boudier Property</span>
        </div>
        <div className="splash-sub">Intelligent Development, Lasting Value</div>
        <div className="splash-bar" aria-hidden="true">
          <i />
        </div>
      </div>
    </div>
  );
}
