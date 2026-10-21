"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
// `Map` is aliased: the component would otherwise shadow JavaScript's Map.
import { APIProvider, Map as GoogleMap, useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import type { Area, FreeholdCandidate, OwnerType } from "@/lib/freeholds";
import { actionAddFreeholdToPipeline, actionRequestAreaImport } from "@/app/actions";

// Phase 2 (plan §6): the F1–F6 filter panel, polygons coloured by confidence,
// a side card, CSV export and Add to Pipeline. Polygons are drawn with Google
// Maps' own Data layer — at a few hundred to a few thousand features it is
// more than enough, and it saves a 2 MB deck.gl dependency; MVT tiles can come
// if an authority ever needs tens of thousands on screen at once.

export const RELEASE_1_LAS: { code: string; name: string; lat: number; lng: number }[] = [
  { code: "E06000038", name: "Reading", lat: 51.4543, lng: -0.9737 },
  { code: "E06000037", name: "West Berkshire", lat: 51.4014, lng: -1.3231 },
  { code: "E06000041", name: "Wokingham", lat: 51.4112, lng: -0.8356 },
  { code: "E06000036", name: "Bracknell Forest", lat: 51.414, lng: -0.752 },
  { code: "E06000040", name: "Windsor & Maidenhead", lat: 51.5213, lng: -0.7195 },
  { code: "E06000039", name: "Slough", lat: 51.5105, lng: -0.595 },
];

const OWNER_OPTIONS: { value: OwnerType; label: string }[] = [
  { value: "private", label: "Private" },
  { value: "company", label: "UK company" },
  { value: "overseas", label: "Overseas company" },
];
const USE_OPTIONS = ["C3", "C4", "E"];

interface Filters {
  la: string;
  minAddresses: number;
  maxAddresses: number;
  maxLeases: number; // F3: 0 = strictly unbroken
  ownerTypes: OwnerType[]; // F4
  useClasses: string[]; // F5, empty = any
  epcOn: boolean; // F6 toggle
  epcMoreThan: number;
  minConfidence: number;
}
const DEFAULTS: Filters = {
  la: "E06000038",
  minAddresses: 2,
  maxAddresses: 20,
  maxLeases: 0,
  ownerTypes: ["private", "company", "overseas"],
  useClasses: [],
  epcOn: true,
  epcMoreThan: 2,
  minConfidence: 0,
};
const SAVE_KEY = "freeholds.filters";

type Feature = { type: "Feature"; id: number; geometry: unknown; properties: FreeholdCandidate };

function queryFor(f: Filters) {
  const p = new URLSearchParams({
    la: f.la,
    minAddresses: String(f.minAddresses),
    maxAddresses: String(f.maxAddresses),
    maxLeases: String(f.maxLeases),
    owner: f.ownerTypes.join(","),
    epc: f.epcOn ? String(f.epcMoreThan) : "off",
  });
  if (f.useClasses.length) p.set("use", f.useClasses.join(","));
  if (f.minConfidence) p.set("minConfidence", String(f.minConfidence));
  return p;
}

const colour = (c: number) => (c >= 0.8 ? "#2E7D5B" : c >= 0.5 ? "#C2872B" : "#8A8A8A");
const pct = (c: number) => `${Math.round(c * 100)}%`;

// ── Map ──────────────────────────────────────────────────────────────────────

function PlaceSearch({ onPlace }: { onPlace?: (lat: number, lng: number) => void }) {
  const map = useMap();
  const places = useMapsLibrary("places");
  const host = useRef<HTMLDivElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    if (!places || !map || !host.current) return;
    const Ctor = (places as unknown as { PlaceAutocompleteElement?: new (o: Record<string, unknown>) => HTMLElement }).PlaceAutocompleteElement;
    if (!Ctor) {
      setProblem("Search needs the Places API (New) enabled on the Maps key.");
      return;
    }
    const el = new Ctor({ includedRegionCodes: ["gb"] });
    el.style.width = "100%";
    host.current.replaceChildren(el);
    const onSelect = async (ev: Event) => {
      const e = ev as Event & { placePrediction?: { toPlace: () => any }; place?: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
      const place = e.placePrediction ? e.placePrediction.toPlace() : e.place;
      if (!place) return;
      await place.fetchFields({ fields: ["location", "viewport"] });
      if (place.location) onPlace?.(place.location.lat(), place.location.lng());
      if (place.viewport) map.fitBounds(place.viewport);
      else if (place.location) {
        map.panTo(place.location);
        map.setZoom(18);
      }
    };
    el.addEventListener("gmp-select", onSelect);
    el.addEventListener("gmp-placeselect", onSelect);
    return () => el.remove();
  }, [places, map, onPlace]);
  return (
    <div className="min-w-0 flex-1">
      <div ref={host} aria-label="Search for an address, street or postcode" />
      {problem && <p className="mt-1 text-xs text-status-stop">{problem}</p>}
    </div>
  );
}

/** Draws the candidates on the map's Data layer and reports clicks. */
function Polygons({ features, selectedId, onSelect }: { features: Feature[]; selectedId: number | null; onSelect: (id: number) => void }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const layer = map.data;
    layer.forEach((f) => layer.remove(f));
    layer.addGeoJson({ type: "FeatureCollection", features });
    const click = layer.addListener("click", (e: google.maps.Data.MouseEvent) => {
      const id = e.feature.getId();
      if (typeof id === "number") onSelect(id);
    });
    return () => {
      google.maps.event.removeListener(click);
    };
  }, [map, features, onSelect]);

  useEffect(() => {
    if (!map) return;
    map.data.setStyle((f) => {
      const c = Number(f.getProperty("confidence") ?? 0);
      const inPipeline = !!f.getProperty("pipelinePropertyId");
      const sel = f.getId() === selectedId;
      return {
        fillColor: inPipeline ? "#1F3A5F" : colour(c),
        fillOpacity: sel ? 0.6 : 0.35,
        strokeColor: sel ? "#16202B" : inPipeline ? "#1F3A5F" : colour(c),
        strokeWeight: sel ? 3 : 1,
        zIndex: sel ? 10 : 1,
      };
    });
  }, [map, selectedId]);

  // Pan to a selection made from the list rather than the map.
  useEffect(() => {
    if (!map || selectedId == null) return;
    const f = features.find((x) => x.id === selectedId);
    const c = f?.properties.centroid;
    if (c) map.panTo({ lat: c.lat, lng: c.lng });
  }, [map, selectedId, features]);
  return null;
}

// ── Constraint overlays (plan §6) ───────────────────────────────────────────

const OVERLAYS: { key: string; label: string; stroke: string; fill: string }[] = [
  { key: "conservation-area", label: "Conservation areas", stroke: "#7A3E9D", fill: "#7A3E9D" },
  { key: "article-4-direction-area", label: "Article 4", stroke: "#B23A48", fill: "#B23A48" },
  { key: "listed-building-outline", label: "Listed buildings", stroke: "#C2872B", fill: "#C2872B" },
  { key: "flood-risk-zone", label: "Flood zones", stroke: "#2A6FB0", fill: "#2A6FB0" },
];

// Flood zones are drawn as image tiles straight from the Environment Agency's
// Flood Map for Planning WMS, not as vectors. As vectors a single normal map
// view of Reading was 2,146 shapes and 12.7 MB — over Vercel's 4.5 MB response
// cap and the 30 s limit, so the layer silently showed nothing. A tile is ~40 KB
// and the server is not involved.
const FLOOD_WMS = "https://environment.data.gov.uk/spatialdata/flood-map-for-planning-flood-zones/wms";
const FLOOD_LAYER = "Flood_Zones_2_3_Rivers_and_Sea";
const WEB_MERCATOR_R = 20037508.342789244;

function floodTiles(): google.maps.ImageMapType {
  return new google.maps.ImageMapType({
    name: "Flood zones",
    tileSize: new google.maps.Size(256, 256),
    opacity: 0.55,
    getTileUrl: (coord, zoom) => {
      const n = 2 ** zoom;
      const size = (2 * WEB_MERCATOR_R) / n;
      const minx = -WEB_MERCATOR_R + coord.x * size;
      const maxy = WEB_MERCATOR_R - coord.y * size;
      const q = new URLSearchParams({
        service: "WMS", version: "1.3.0", request: "GetMap", layers: FLOOD_LAYER, styles: "",
        crs: "EPSG:3857", bbox: `${minx},${maxy - size},${minx + size},${maxy}`,
        width: "256", height: "256", format: "image/png", transparent: "true",
      });
      return `${FLOOD_WMS}?${q}`;
    },
  });
}

/**
 * Vector overlays get one Data layer each, refetched for the viewport whenever
 * the map settles; flood zones are a tile layer. All are non-clickable, so a
 * click always reaches the building beneath.
 */
function Overlays({ enabled, onStatus }: { enabled: string[]; onStatus: (msg: string | null) => void }) {
  const map = useMap();

  // Flood: a WMS tile overlay, independent of the viewport fetch below.
  const flood = enabled.includes("flood-risk-zone");
  useEffect(() => {
    if (!map || !flood) return;
    const tiles = floodTiles();
    map.overlayMapTypes.push(tiles);
    return () => {
      const arr = map.overlayMapTypes;
      for (let i = 0; i < arr.getLength(); i++) if (arr.getAt(i) === tiles) { arr.removeAt(i); break; }
    };
  }, [map, flood]);

  const vectorKeys = enabled.filter((k) => k !== "flood-risk-zone");
  const vectorKey = vectorKeys.join(",");
  useEffect(() => {
    const keys = vectorKey ? vectorKey.split(",") : [];
    if (!map || keys.length === 0) {
      onStatus(null);
      return;
    }
    const layers = keys.map((key) => {
      const def = OVERLAYS.find((o) => o.key === key)!;
      const layer = new google.maps.Data({ map });
      layer.setStyle({ strokeColor: def.stroke, strokeWeight: 1.5, fillColor: def.fill, fillOpacity: 0.12, clickable: false, zIndex: 0 });
      return { key, layer };
    });
    let ctrl: AbortController | null = null;
    const load = async () => {
      const b = map.getBounds();
      if (!b) return;
      const sw = b.getSouthWest(), ne = b.getNorthEast();
      const bbox = [sw.lng(), sw.lat(), ne.lng(), ne.lat()].map((n) => n.toFixed(5)).join(",");
      ctrl?.abort();
      ctrl = new AbortController();
      const signal = ctrl.signal;
      let zoomIn = false;
      await Promise.all(
        layers.map(async ({ key, layer }) => {
          try {
            const r = await fetch(`/api/freeholds/overlays?dataset=${key}&bbox=${bbox}`, { signal });
            const j = await r.json();
            if (signal.aborted) return;
            layer.forEach((f) => layer.remove(f));
            if (j.reason) zoomIn = true;
            if (j.features?.length) layer.addGeoJson(j);
          } catch { /* aborted or offline */ }
        }),
      );
      if (!signal.aborted) onStatus(zoomIn ? "Zoom in to load the overlays" : null);
    };
    const idle = map.addListener("idle", load);
    load();
    return () => {
      ctrl?.abort();
      google.maps.event.removeListener(idle);
      layers.forEach(({ layer }) => layer.setMap(null));
    };
  }, [map, vectorKey, onStatus]);
  return null;
}

// ── Area banner: search a place, import its council if there's no data ───────

interface Lookup {
  lat: number;
  lng: number;
  council: { laCode: string; laName: string } | null;
  area: Area | null;
  importConfigured?: boolean;
  runsUrl?: string;
  message?: string;
}

const minutesSince = (iso: string | null) => (iso ? Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000)) : 0);

function AreaBanner({ lookup, currentLa, onShow, onImport, busy, error }: {
  lookup: Lookup; currentLa: string; onShow: (code: string) => void; onImport: () => void; busy: boolean; error: string | null;
}) {
  const box = "card flex flex-wrap items-center gap-3 p-3 text-sm";
  if (!lookup.council) return <div className={box}><span className="text-ink-muted">{lookup.message ?? "That place isn't in a council we can import."}</span></div>;
  const { laCode, laName } = lookup.council;
  const a = lookup.area;

  if (a?.status === "done") {
    if (laCode === currentLa) return null;
    return (
      <div className={box}>
        <span className="text-ink"><span className="font-medium">{laName}</span> — {(a.targets ?? 0).toLocaleString("en-GB")} on the approach list.</span>
        <button onClick={() => onShow(laCode)} className="btn-primary ml-auto px-3 py-1 text-xs">Show {laName}</button>
      </div>
    );
  }
  if (a?.status === "queued" || a?.status === "running") {
    const queuedMins = minutesSince(a.requestedAt);
    const stuck = a.status === "queued" && queuedMins >= 15;
    return (
      <div className={box}>
        <span className="h-2 w-2 animate-pulse rounded-full bg-bronze" />
        <span className="text-ink">
          Importing <span className="font-medium">{laName}</span> —{" "}
          {a.status === "running" ? `running for ${minutesSince(a.startedAt)} min` : `queued ${queuedMins} min ago`}. Usually 15–30 minutes; this updates by itself.
        </span>
        {stuck && (
          <span className="w-full text-xs text-status-stop">
            It hasn&apos;t started after {queuedMins} minutes — the job is probably missing its GitHub secrets.{" "}
            <a href={lookup.runsUrl} target="_blank" rel="noreferrer" className="underline">Open the job ↗</a>
          </span>
        )}
      </div>
    );
  }
  return (
    <div className={box}>
      <span className="text-ink">
        {a?.status === "failed" ? <>The last import of <span className="font-medium">{laName}</span> failed{a.message ? `: ${a.message}` : "."}</> : <>No freehold data for <span className="font-medium">{laName}</span> yet.</>}
      </span>
      <button onClick={onImport} disabled={busy || !lookup.importConfigured} className="btn-primary ml-auto px-3 py-1 text-xs disabled:opacity-50">
        {busy ? "Starting…" : a?.status === "failed" ? `Retry ${laName}` : `Import ${laName}`}
      </button>
      {!lookup.importConfigured && <span className="w-full text-xs text-ink-muted">Imports need a GitHub token in Vercel (GITHUB_DISPATCH_TOKEN) — see the setup notes.</span>}
      {error && <span className="w-full text-xs text-status-stop">{error}</span>}
    </div>
  );
}

// ── Side card ────────────────────────────────────────────────────────────────

function SideCard({ c, onClose, onAdded }: { c: FreeholdCandidate; onClose: () => void; onAdded: (id: number, propertyId: string) => void }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const sv = c.centroid ? `https://www.google.com/maps?q=&layer=c&cbll=${c.centroid.lat},${c.centroid.lng}` : null;
  const entity = `https://www.planning.data.gov.uk/entity/${12_000_000_000 + Number(c.inspireId)}`;
  const owner =
    c.ownerType === "private"
      ? `Private owner${c.ownerTypeInferred ? " — inferred (no company match; confirm via title register)" : ""}`
      : c.ownerType === "overseas"
        ? `Overseas company — ${c.companyName}`
        : c.ownerType === "company"
          ? `Company — ${c.companyName}`
          : c.ownerType;

  function add() {
    setErr(null);
    start(async () => {
      const r = await actionAddFreeholdToPipeline(c.id);
      if (r.ok) onAdded(c.id, r.propertyId);
      else setErr(r.error);
    });
  }

  return (
    <aside className="card flex h-full flex-col p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-serif text-lg leading-tight text-ink">{c.sampleAddresses[0] ?? `Freehold ${c.inspireId}`}</p>
          <p className="text-xs text-ink-muted">INSPIRE {c.inspireId} · confidence <span style={{ color: colour(c.confidence) }}>{pct(c.confidence)}</span></p>
        </div>
        <button onClick={onClose} className="text-ink-muted hover:text-ink" aria-label="Close">✕</button>
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        {[["Addresses", c.addressCount], ["Leases", c.leaseCount], ["EPCs", c.epcUprnCount]].map(([k, v]) => (
          <div key={String(k)} className="rounded-md bg-paper-warm px-2 py-1.5">
            <dt className="text-[10px] uppercase tracking-wide text-ink-muted">{k}</dt>
            <dd className="text-lg font-semibold tabular-nums text-ink">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-3 space-y-2 text-sm">
        <p className="text-ink">{owner}</p>
        {c.companyAddress && (
          <p className="text-ink-soft">
            <span className="text-xs uppercase tracking-wide text-ink-muted">Write to</span>
            <br />
            {c.companyAddress}
          </p>
        )}
        {c.useClasses.length > 0 && <p className="text-xs text-ink-muted">Use: {c.useClasses.join(", ")}</p>}
        {c.lastSalePrice != null && (
          <p className="text-xs text-ink-muted">Last sale £{c.lastSalePrice.toLocaleString("en-GB")} · {c.lastSaleDate}</p>
        )}
        {c.sampleAddresses.length > 0 && (
          <ul className="max-h-28 overflow-auto rounded-md border border-paper-line p-2 text-xs text-ink-soft">
            {c.sampleAddresses.map((a) => <li key={a}>{a}</li>)}
          </ul>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        {sv && <a href={sv} target="_blank" rel="noreferrer" className="btn-ghost px-2 py-1">Street View ↗</a>}
        <a href={entity} target="_blank" rel="noreferrer" className="btn-ghost px-2 py-1">Title boundary ↗</a>
        <a href="https://search-property-information.service.gov.uk/" target="_blank" rel="noreferrer" className="btn-ghost px-2 py-1" title="HMLR — buy the title register (a few pounds) to confirm a private owner">
          Buy title register ↗
        </a>
      </div>

      <div className="mt-auto pt-4">
        {c.pipelinePropertyId ? (
          <Link href={`/property/${c.pipelinePropertyId}`} className="btn-primary block text-center">In Title Split — open ↗</Link>
        ) : (
          <button onClick={add} disabled={pending} className="btn-primary w-full disabled:opacity-60">
            {pending ? "Adding…" : "Add to Title Split"}
          </button>
        )}
        {err && <p className="mt-1 text-xs text-status-stop">{err}</p>}
        <p className="mt-2 text-[10px] text-ink-muted">
          Counts are spatial-join proxies, not title data — confirm against the register before relying on them.
        </p>
      </div>
    </aside>
  );
}

// ── Filter panel ─────────────────────────────────────────────────────────────

function Filters({ f, set, count, loading, saved, onSave, areas }: { f: Filters; set: (p: Partial<Filters>) => void; count: number; loading: boolean; saved: boolean; onSave: () => void; areas: { code: string; name: string }[] }) {
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const chip = (on: boolean) =>
    `rounded-full border px-2.5 py-1 text-xs font-medium transition ${on ? "border-ink bg-ink text-white" : "border-paper-line bg-white text-ink-soft hover:border-bronze"}`;
  return (
    <aside className="card space-y-4 p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-serif text-lg text-ink">Filters</h2>
        <span className="text-sm text-ink-muted">{loading ? "Searching…" : `Results: ${count.toLocaleString("en-GB")}`}</span>
      </div>

      <div>
        <span className="label">Area</span>
        <div className="flex flex-wrap gap-1.5">
          {areas.map((a) => <button key={a.code} className={chip(f.la === a.code)} onClick={() => set({ la: a.code })}>{a.name}</button>)}
        </div>
      </div>

      <div>
        <span className="label">Addresses on the freehold (F2): {f.minAddresses}–{f.maxAddresses}</span>
        <div className="flex items-center gap-2">
          <input type="range" min={2} max={20} value={f.minAddresses} onChange={(e) => set({ minAddresses: Math.min(Number(e.target.value), f.maxAddresses) })} className="w-full" aria-label="Minimum addresses" />
          <input type="range" min={2} max={20} value={f.maxAddresses} onChange={(e) => set({ maxAddresses: Math.max(Number(e.target.value), f.minAddresses) })} className="w-full" aria-label="Maximum addresses" />
        </div>
      </div>

      <div>
        <span className="label">Registered leases (F3)</span>
        <div className="flex items-center gap-2 text-sm">
          <button className={chip(f.maxLeases === 0)} onClick={() => set({ maxLeases: 0 })}>Unbroken — none</button>
          <span className="text-xs text-ink-muted">or allow up to</span>
          <input type="number" min={0} max={20} value={f.maxLeases} onChange={(e) => set({ maxLeases: Math.max(0, Number(e.target.value) || 0) })} className="field w-16 py-1 text-sm" aria-label="Maximum leases" />
        </div>
      </div>

      <div>
        <span className="label">Owner (F4)</span>
        <div className="flex flex-wrap gap-1.5">
          {OWNER_OPTIONS.map((o) => <button key={o.value} className={chip(f.ownerTypes.includes(o.value))} onClick={() => set({ ownerTypes: toggle(f.ownerTypes, o.value) })}>{o.label}</button>)}
        </div>
        <span className="mt-1 block text-[10px] text-ink-muted">Councils, housing associations and the Crown are always excluded.</span>
      </div>

      <div>
        <span className="label">Use class (F5) — any if none picked</span>
        <div className="flex flex-wrap gap-1.5">
          {USE_OPTIONS.map((u) => <button key={u} className={chip(f.useClasses.includes(u))} onClick={() => set({ useClasses: toggle(f.useClasses, u) })}>{u === "E" ? "E (commercial)" : u === "C4" ? "C4 (HMO)" : "C3 (dwellings)"}</button>)}
        </div>
      </div>

      <div>
        <span className="label">EPC records (F6)</span>
        <div className="flex items-center gap-2 text-sm">
          <button className={chip(f.epcOn)} onClick={() => set({ epcOn: !f.epcOn })}>{f.epcOn ? "On" : "Off"}</button>
          <span className="text-xs text-ink-muted">more than</span>
          <input type="number" min={0} max={20} value={f.epcMoreThan} disabled={!f.epcOn} onChange={(e) => set({ epcMoreThan: Math.max(0, Number(e.target.value) || 0) })} className="field w-16 py-1 text-sm disabled:opacity-50" aria-label="EPC threshold" />
          <span className="text-xs text-ink-muted">UPRNs with an EPC</span>
        </div>
      </div>

      <div>
        <span className="label">Confidence</span>
        <div className="flex flex-wrap gap-1.5">
          {[["All", 0], ["Medium+", 0.5], ["High", 0.8]].map(([l, v]) => <button key={String(l)} className={chip(f.minConfidence === v)} onClick={() => set({ minConfidence: Number(v) })}>{l}</button>)}
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button onClick={onSave} className="btn-ghost text-xs">{saved ? "Saved ✓" : "Save search"}</button>
        <a href={`/api/freeholds?${queryFor(f).toString()}&format=csv`} className="btn-ghost text-xs" download>Export CSV</a>
        <button onClick={() => set(DEFAULTS)} className="ml-auto text-xs text-ink-muted hover:text-ink">Reset</button>
      </div>
    </aside>
  );
}

// ── Page component ───────────────────────────────────────────────────────────

export function FreeholdMap({ apiKey, configured }: { apiKey: string; configured: boolean }) {
  const [f, setF] = useState<Filters>(DEFAULTS);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const [overlays, setOverlays] = useState<string[]>([]);
  const [areaRows, setAreaRows] = useState<Area[]>([]);
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const loadAreas = useCallback(async () => {
    try {
      const j = (await (await fetch("/api/freeholds/areas", { cache: "no-store" })).json()) as { areas?: Area[] };
      setAreaRows(j.areas ?? []);
    } catch { /* keep what we have */ }
  }, []);
  useEffect(() => { if (configured) loadAreas(); }, [configured, loadAreas]);

  const onPlace = useCallback(async (lat: number, lng: number) => {
    setImportError(null);
    try {
      const j = await (await fetch(`/api/freeholds/areas?lat=${lat}&lng=${lng}`, { cache: "no-store" })).json();
      setLookup({ lat, lng, ...j });
    } catch { setLookup(null); }
  }, []);

  // While an import is queued or running, check on it every 30 seconds.
  const pending = lookup?.area?.status === "queued" || lookup?.area?.status === "running";
  const pendingCode = pending ? lookup?.council?.laCode : null;
  useEffect(() => {
    if (!pendingCode) return;
    const t = setInterval(async () => {
      try {
        const j = (await (await fetch(`/api/freeholds/areas?la=${pendingCode}`, { cache: "no-store" })).json()) as { area: Area | null };
        setLookup((cur) => (cur ? { ...cur, area: j.area } : cur));
        if (j.area?.status === "done") loadAreas();
      } catch { /* try again next tick */ }
    }, 30_000);
    return () => clearInterval(t);
  }, [pendingCode, loadAreas]);

  const startImport = async () => {
    if (!lookup?.council) return;
    setImportBusy(true);
    setImportError(null);
    const r = await actionRequestAreaImport(lookup.council.laCode, lookup.council.laName, lookup.lat, lookup.lng);
    setImportBusy(false);
    if (!r.ok) { setImportError(r.error); return; }
    const now = new Date().toISOString();
    setLookup((cur) => cur && cur.council ? { ...cur, area: { laCode: cur.council.laCode, laName: cur.council.laName, lat: cur.lat, lng: cur.lng, status: "queued", requestedAt: now, startedAt: null, finishedAt: null, candidates: null, targets: null, message: null } } : cur);
  };
  const [overlayMsg, setOverlayMsg] = useState<string | null>(null);
  const set = useCallback((p: Partial<Filters>) => {
    setF((s) => ({ ...s, ...p }));
    setSaved(false);
  }, []);

  // Restore a saved search (per-browser convenience only).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) setF({ ...DEFAULTS, ...(JSON.parse(raw) as Partial<Filters>) });
    } catch { /* storage unavailable — fine */ }
  }, []);
  const save = () => {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(f)); setSaved(true); } catch { /* ignore */ }
  };

  // Fetch on filter change, debounced; the response is a FeatureCollection.
  useEffect(() => {
    if (!configured) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/freeholds?${queryFor(f).toString()}&format=geojson&limit=3000`, { signal: ctrl.signal, cache: "no-store" });
        const j = (await r.json()) as { features?: Feature[] };
        setFeatures(j.features ?? []);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setFeatures([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [f, configured]);

  const byId = useMemo(() => new Map(features.map((x) => [x.id, x.properties])), [features]);
  const selected = selectedId != null ? byId.get(selectedId) ?? null : null;
  const withData = areaRows.filter((a) => a.status === "done" || (a.candidates ?? 0) > 0);
  const chips = withData.length ? withData.map((a) => ({ code: a.laCode, name: a.laName })) : RELEASE_1_LAS.map((a) => ({ code: a.code, name: a.name }));
  const fromTable = areaRows.find((a) => a.laCode === f.la && a.lat != null && a.lng != null);
  const la = fromTable
    ? { code: fromTable.laCode, name: fromTable.laName, lat: fromTable.lat as number, lng: fromTable.lng as number }
    : RELEASE_1_LAS.find((a) => a.code === f.la) ?? RELEASE_1_LAS[0];
  const onAdded = useCallback((id: number, propertyId: string) => {
    setFeatures((fs) => fs.map((x) => (x.id === id ? { ...x, properties: { ...x.properties, pipelinePropertyId: propertyId } } : x)));
  }, []);

  const list = (
    <div className="card max-h-[560px] overflow-auto">
      {features.length === 0 && !loading && (
        <p className="p-4 text-sm text-ink-muted">{configured ? "No freeholds match these filters." : "No data yet — connect Supabase and run the ETL."}</p>
      )}
      <ul className="divide-y divide-paper-line">
        {features.slice(0, 200).map(({ id, properties: c }) => (
          <li key={id}>
            <button onClick={() => setSelectedId(id)} className={`flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-paper-warm ${id === selectedId ? "bg-paper-warm" : ""}`}>
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.pipelinePropertyId ? "#1F3A5F" : colour(c.confidence) }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-ink">{c.sampleAddresses[0] ?? `Freehold ${c.inspireId}`}</span>
                <span className="block text-[11px] text-ink-muted">{c.addressCount} addresses · {c.leaseCount} leases · {c.ownerType === "private" ? "private" : c.companyName ?? c.ownerType}</span>
              </span>
              <span className="text-xs tabular-nums text-ink-muted">{pct(c.confidence)}</span>
            </button>
          </li>
        ))}
      </ul>
      {features.length > 200 && <p className="p-2 text-center text-[11px] text-ink-muted">Showing 200 of {features.length} — narrow the filters or export the CSV.</p>}
    </div>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[300px,1fr]">
      <Filters f={f} set={set} count={features.length} loading={loading} saved={saved} onSave={save} areas={chips} />
      <div className="space-y-3">
        {apiKey ? (
          <APIProvider apiKey={apiKey}>
            <div className="flex items-center gap-2"><PlaceSearch onPlace={onPlace} /></div>
            {lookup && (
              <AreaBanner lookup={lookup} currentLa={f.la} busy={importBusy} error={importError} onImport={startImport}
                onShow={(code) => { set({ la: code }); setLookup(null); }} />
            )}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="label mb-0">Overlays</span>
              {OVERLAYS.map((o) => {
                const on = overlays.includes(o.key);
                return (
                  <button
                    key={o.key}
                    onClick={() => setOverlays((cur) => (on ? cur.filter((k) => k !== o.key) : [...cur, o.key]))}
                    className="rounded-full border px-2.5 py-1 text-xs font-medium transition"
                    style={on ? { borderColor: o.stroke, background: o.stroke, color: "#fff" } : { borderColor: o.stroke, color: o.stroke }}
                  >
                    {o.label}
                  </button>
                );
              })}
              {overlayMsg && <span className="text-[11px] text-ink-muted">{overlayMsg}</span>}
            </div>
            <div className="grid gap-3 lg:grid-cols-[1fr,320px]">
              <div className="card overflow-hidden" style={{ height: 560 }}>
                <GoogleMap key={la.code} defaultCenter={{ lat: la.lat, lng: la.lng }} defaultZoom={13} mapTypeId="hybrid" gestureHandling="greedy" streetViewControl mapTypeControl style={{ width: "100%", height: "100%" }}>
                  <Overlays enabled={overlays} onStatus={setOverlayMsg} />
                  <Polygons features={features} selectedId={selectedId} onSelect={setSelectedId} />
                </GoogleMap>
              </div>
              <div style={{ height: 560 }}>{selected ? <SideCard c={selected} onClose={() => setSelectedId(null)} onAdded={onAdded} /> : list}</div>
            </div>
            <p className="text-[11px] text-ink-muted">
              <span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "#2E7D5B" }} /> high confidence
              <span className="ml-3 mr-2 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "#C2872B" }} /> medium
              <span className="ml-3 mr-2 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "#8A8A8A" }} /> low
              <span className="ml-3 mr-2 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "#1F3A5F" }} /> in Title Split
            </p>
          </APIProvider>
        ) : (
          <>
            <div className="card p-4 text-sm text-ink-muted">
              Map not configured — set <code className="rounded bg-paper-warm px-1">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code>. The list and export work regardless.
            </div>
            <div className="grid gap-3 lg:grid-cols-[1fr,320px]">
              {list}
              <div>{selected && <SideCard c={selected} onClose={() => setSelectedId(null)} onAdded={onAdded} />}</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
