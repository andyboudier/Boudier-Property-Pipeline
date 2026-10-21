"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { APIProvider, Map, useMap, useMapsLibrary } from "@vis.gl/react-google-maps";

// Phase 0/1: the map and a place search, behind the app's existing auth.
// Polygon layers, the filter panel and the side card land in Phase 2 once the
// ETL has populated freehold_candidates.

// First-release local authorities (plan §7) — Thames Valley.
export const RELEASE_1_LAS: { code: string; name: string; lat: number; lng: number }[] = [
  { code: "E06000038", name: "Reading", lat: 51.4543, lng: -0.9737 },
  { code: "E06000037", name: "West Berkshire", lat: 51.4014, lng: -1.3231 },
  { code: "E06000041", name: "Wokingham", lat: 51.4112, lng: -0.8356 },
  { code: "E06000036", name: "Bracknell Forest", lat: 51.414, lng: -0.752 },
  { code: "E06000040", name: "Windsor & Maidenhead", lat: 51.5213, lng: -0.7195 },
  { code: "E06000039", name: "Slough", lat: 51.5105, lng: -0.595 },
];

// Places API (New). The legacy `Autocomplete` widget is not offered on new
// Google Cloud projects, so this uses `PlaceAutocompleteElement` — a web
// component that renders its own input and emits a selection event. The
// installed Maps typings may predate it, hence the narrow local types.
type PlaceLike = {
  fetchFields: (o: { fields: string[] }) => Promise<unknown>;
  location?: google.maps.LatLng | null;
  viewport?: google.maps.LatLngBounds | null;
};
type SelectEvent = Event & { placePrediction?: { toPlace: () => PlaceLike }; place?: PlaceLike };
type PlacesWithElement = { PlaceAutocompleteElement?: new (o: Record<string, unknown>) => HTMLElement };

function PlaceSearch() {
  const map = useMap();
  const places = useMapsLibrary("places");
  const host = useRef<HTMLDivElement>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!places || !map || !host.current) return;
    const Ctor = (places as unknown as PlacesWithElement).PlaceAutocompleteElement;
    if (!Ctor) {
      setProblem("Search needs the Places API (New) enabled on the Maps key.");
      return;
    }
    let el: HTMLElement;
    try {
      el = new Ctor({ includedRegionCodes: ["gb"] }); // UK land data only
    } catch (e) {
      setProblem(`Search could not start: ${(e as Error).message}`);
      return;
    }
    el.style.width = "100%";
    host.current.replaceChildren(el);

    const onSelect = async (ev: Event) => {
      const e = ev as SelectEvent;
      // Newer builds fire `gmp-select` with a prediction; older ones fire
      // `gmp-placeselect` with the place itself. Handle both.
      const place = e.placePrediction ? e.placePrediction.toPlace() : e.place;
      if (!place) return;
      await place.fetchFields({ fields: ["location", "viewport", "formattedAddress"] });
      // A town gets its whole extent; a single address zooms to building level.
      if (place.viewport) map.fitBounds(place.viewport);
      else if (place.location) {
        map.panTo(place.location);
        map.setZoom(18);
      }
    };
    el.addEventListener("gmp-select", onSelect);
    el.addEventListener("gmp-placeselect", onSelect);
    return () => {
      el.removeEventListener("gmp-select", onSelect);
      el.removeEventListener("gmp-placeselect", onSelect);
      el.remove();
    };
  }, [places, map]);

  return (
    <div className="min-w-0 flex-1">
      <div ref={host} aria-label="Search for an address, street or postcode" />
      {problem && <p className="mt-1 text-xs text-status-stop">{problem}</p>}
    </div>
  );
}

function MapInner({ la, configured }: { la: (typeof RELEASE_1_LAS)[number]; configured: boolean }) {
  return (
    <>
      <div className="card overflow-hidden" style={{ height: 560 }}>
        <Map
          defaultCenter={{ lat: la.lat, lng: la.lng }}
          defaultZoom={13}
          mapTypeId="hybrid"
          gestureHandling="greedy"
          streetViewControl
          mapTypeControl
          style={{ width: "100%", height: "100%" }}
        />
      </div>
      {!configured && (
        <p className="text-xs text-ink-muted">
          No freehold data yet — the map is live, but <code>freehold_candidates</code> is empty until the ETL has run
          for {la.name}.
        </p>
      )}
    </>
  );
}

export function FreeholdMap({ apiKey, configured }: { apiKey: string; configured: boolean }) {
  const [la, setLa] = useState(RELEASE_1_LAS[0]);
  const pick = useCallback((a: (typeof RELEASE_1_LAS)[number]) => setLa(a), []);

  if (!apiKey) {
    return (
      <div className="card flex min-h-[420px] flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="font-serif text-lg text-ink">Map not configured</p>
        <p className="max-w-md text-sm text-ink-muted">
          Set <code className="rounded bg-paper-warm px-1">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> in Vercel (Maps
          JavaScript API enabled, restricted to this domain) and redeploy.
        </p>
      </div>
    );
  }

  return (
    <APIProvider apiKey={apiKey}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <PlaceSearch />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="label mb-0">Area</span>
          {RELEASE_1_LAS.map((a) => (
            <button
              key={a.code}
              onClick={() => pick(a)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                a.code === la.code ? "border-ink bg-ink text-white" : "border-paper-line bg-white text-ink-soft hover:border-bronze"
              }`}
            >
              {a.name}
            </button>
          ))}
        </div>
        {/* Remounting on area change resets the viewport to that authority. */}
        <MapInner key={la.code} la={la} configured={configured} />
      </div>
    </APIProvider>
  );
}
