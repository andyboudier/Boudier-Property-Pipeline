"use client";

import { useState } from "react";
import { APIProvider, Map } from "@vis.gl/react-google-maps";

// Phase 0: the map itself, behind the app's existing auth. Polygon layers,
// the filter panel and the side card land in Phase 2 once the ETL has
// populated freehold_candidates.

// First-release local authorities (plan §7) — Thames Valley.
export const RELEASE_1_LAS: { code: string; name: string; lat: number; lng: number }[] = [
  { code: "E06000038", name: "Reading", lat: 51.4543, lng: -0.9737 },
  { code: "E06000037", name: "West Berkshire", lat: 51.4014, lng: -1.3231 },
  { code: "E06000041", name: "Wokingham", lat: 51.4112, lng: -0.8356 },
  { code: "E06000036", name: "Bracknell Forest", lat: 51.4140, lng: -0.7520 },
  { code: "E06000040", name: "Windsor & Maidenhead", lat: 51.5213, lng: -0.7195 },
  { code: "E06000039", name: "Slough", lat: 51.5105, lng: -0.5950 },
];

export function FreeholdMap({ apiKey, configured }: { apiKey: string; configured: boolean }) {
  const [la, setLa] = useState(RELEASE_1_LAS[0]);

  if (!apiKey) {
    return (
      <div className="card flex min-h-[420px] flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="font-serif text-lg text-ink">Map not configured</p>
        <p className="max-w-md text-sm text-ink-muted">
          Set <code className="rounded bg-paper-warm px-1">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> in Vercel (Maps
          JavaScript API enabled, restricted to this domain) and redeploy. Everything else on this page is ready.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="label mb-0">Area</span>
        {RELEASE_1_LAS.map((a) => (
          <button
            key={a.code}
            onClick={() => setLa(a)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              a.code === la.code ? "border-ink bg-ink text-white" : "border-paper-line bg-white text-ink-soft hover:border-bronze"
            }`}
          >
            {a.name}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden" style={{ height: 560 }}>
        <APIProvider apiKey={apiKey}>
          <Map
            key={la.code}
            defaultCenter={{ lat: la.lat, lng: la.lng }}
            defaultZoom={13}
            mapTypeId="hybrid"
            gestureHandling="greedy"
            disableDefaultUI={false}
            streetViewControl
            mapTypeControl
            style={{ width: "100%", height: "100%" }}
          />
        </APIProvider>
      </div>

      {!configured && (
        <p className="text-xs text-ink-muted">
          No freehold data yet — the map is live, but <code>freehold_candidates</code> is empty until Supabase is
          connected and the ETL has run for {la.name}.
        </p>
      )}
    </div>
  );
}
