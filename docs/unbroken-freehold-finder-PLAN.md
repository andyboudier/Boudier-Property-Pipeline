# Unbroken Freehold Finder — Build Plan (hand-off to Claude Code)

**Product:** Boudier Property — new module inside `pipeline.boudierproperty.co.uk`
**Repo:** `github.com/andyboudier/Boudier-Property-Pipeline` (Next.js 14 App Router, TypeScript, Firestore, Vercel)
**Goal:** Map layer over Google Maps that finds **unbroken multi-unit freeholds** (whole buildings held on one freehold title, no flats sold off on long leases) so we can approach the owners directly.
**Status:** Plan agreed → Claude Code to build Phase 0–3.

---

## 1. Ground rules

- We **do not scrape, decompile or copy Searchland** (their terms forbid it, and their data is licensed). We rebuild the same *method* from the same **public / licensable source data**. Searchland is a benchmark to test our results against.
- All source data is UK government data under OGL or HMLR licences. Licence terms for each dataset must be accepted by Andy (not by Claude) before any download.
- Phase 1 uses **free data only**. Phase 3 swaps in **paid HMLR data** if the free proxy is not accurate enough.

---

## 2. The filters (exact spec)

| # | Filter | Rule | Default | User control |
|---|---|---|---|---|
| F1 | Tenure | `tenure = 'Freehold'` | on | fixed |
| F2 | Addresses on the freehold | `address_count BETWEEN 2 AND 20` | 2–20 | min/max sliders |
| F3 | Leases on the freehold | `lease_count = 0` | 0 | toggle "allow ≤ n leases" |
| F4 | Ownership type | `owner_type IN ('private','company')` | both | multi-select: Private / UK company / Overseas company (excludes councils, housing associations, Crown, charities) |
| F5 | Use class | contains **Any** | Any | multi-select: C3 dwellings, C4 HMO, Sui generis HMO, E (commercial), mixed use |
| F6 | EPC records on the title | `epc_count > 2` | on | toggle **on/off** + threshold input; option to count distinct UPRNs vs all certificates |
| — | Area | Local authority / drawn polygon / radius | Thames Valley LAs | selector |

"Unbroken freehold" = F1 + F2 + F3 together. F4–F6 narrow it to approachable, residential-led targets.

---

## 3. Data sources

### Free (Phase 1)

| Dataset | Gives us | Key | Access |
|---|---|---|---|
| **HMLR INSPIRE Index Polygons** | Freehold title boundaries (freehold only — so F1 is automatic) | INSPIRE ID (not title number) | Free GML download per local authority, monthly |
| **OS Open UPRN** | Lat/long for every UPRN | UPRN | Free CSV/GeoPackage (OS Data Hub) |
| **HMLR Registered Leases** | Every registered lease (>7 yrs) incl. UPRN where known | UPRN, address | Free (licence choice on HMLR "Use land and property data") |
| **HMLR CCOD / OCOD** | Title number, tenure, address, company owner name + reg. no. | Title number, address/postcode | Free with account + licence |
| **EPC Open Data (domestic + non-domestic)** | Certificates incl. UPRN, property type, floor area | UPRN | Free API key, MHCLG "Get energy performance of buildings data" |
| **VOA non-domestic rating list** | Commercial units, description (shop, office…) | UARN, address | Free download |
| **HMLR Price Paid + TUID↔UPRN lookup** | Sale history, last price | UPRN | Free |
| **planning.data.gov.uk** | Conservation areas, Article 4, listed buildings, flood, TPOs, brownfield | Geometry | Free API / bulk |
| **PlanIt (planit.org.uk)** | Planning applications aggregated from council portals | Geometry / address | Free API (rate-limited) |
| **Companies House API** | Company status, officers, registered office (for approach letters) | Company no. | Free API key |

### Paid (Phase 3 — accuracy upgrade)

| Dataset | Why |
|---|---|
| **HMLR National Polygon Service** (National Polygon + Title Descriptor + **Title Number ↔ UPRN Look Up**) | Exact title-number polygons, true tenure, and a definitive UPRN list per title → exact F2/F3. Chargeable; free sample available. Contact: data.services@mail.landregistry.gov.uk |
| **HMLR Business Gateway API / official copies (~£7/title)** | Owner name + service address for **private** owners (not in any free dataset) — buy only for shortlisted targets |
| **OS AddressBase Plus** (optional) | Address classification (residential vs non-postal objects) → cleaner F2 and F5 |

---

## 4. How each filter is calculated

### Phase 1 (free proxy method — spatial join)

1. Load INSPIRE polygons (freehold) for target LAs into PostGIS.
2. Load OS Open UPRN points → `ST_Within(uprn, polygon)` gives UPRNs per freehold polygon.
3. **Remove non-address UPRNs**: keep a UPRN only if it appears in EPC, Price Paid, Registered Leases, VOA or CCOD (OS Open UPRN includes things like car parks and street furniture). → `address_count` (F2)
4. `lease_count` (F3) = count of those UPRNs that appear in **Registered Leases**. Also match by normalised address + postcode where the lease UPRN is blank.
5. `epc_count` (F6) = distinct UPRNs inside the polygon with ≥1 EPC (and a second metric: total certificates).
6. `owner_type` (F4): match polygon to CCOD/OCOD by address/postcode → `company` / `overseas`. Exclude names matching council/HA/charity patterns. **No match = assumed `private`** (same inference Searchland uses; flag as "inferred").
7. `use_class` (F5): from EPC property type (flat/house/maisonette), VOA description (commercial), address patterns ("Flat 1", "Room") → derive C3 / C4 / E / mixed.
8. Pre-compute everything into one table `freehold_candidates` (one row per polygon) and regenerate monthly.

**Known limits of the free method:** INSPIRE polygons have no title number; large polygons may hold several buildings; UPRN-to-polygon by location is not the same as UPRN-on-title. Expect false positives — every result gets a confidence score (see §6).

### Phase 3 (paid — exact method)
Replace steps 1–4 with National Polygon (title number + tenure) and Title↔UPRN lookup: `address_count` = UPRNs on title; `lease_count` = leasehold titles whose UPRNs sit under the freehold. CCOD then joins on **title number** (exact).

---

## 5. Architecture

```
            ┌────────────── ETL (Python, GitHub Actions monthly / Cloud Run) ─────────────┐
 Gov data → │ download → normalise addresses → PostGIS spatial joins → freehold_candidates │
            └──────────────────────────────┬──────────────────────────────────────────────┘
                                           │
                     Supabase Postgres + PostGIS (new) ── vector tiles (pg_tileserv/Martin or PMTiles)
                                           │
   Next.js 14 app (existing) ── /api/freeholds (filter query) ── Google Maps JS + deck.gl MVTLayer
                                           │
                                Firestore (existing) ← "Add to Pipeline" creates DCAS record
```

- **Why PostGIS, not Firestore:** Firestore cannot do spatial joins or polygon queries at this scale. Keep Firestore for deals; use Postgres for land data.
- **Map:** `@vis.gl/react-google-maps` + `deck.gl` `GeoJsonLayer` (≤ 5k polygons) or `MVTLayer` for vector tiles. Satellite/Street View come free with Google Maps.
- **Coverage first release:** Reading, West Berkshire, Wokingham, Bracknell Forest, Windsor & Maidenhead, Slough (+ South Oxfordshire / Vale / Swindon in release 2). Matches the 14 Berkshire VA target areas.
- **Env vars:** `GOOGLE_MAPS_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `EPC_API_KEY`, `COMPANIES_HOUSE_API_KEY` — set in Vercel, never committed.

### Core table: `freehold_candidates`
`id, inspire_id, title_number (nullable until Phase 3), la_code, geom, centroid, address_count, lease_count, epc_uprn_count, epc_cert_count, owner_type, owner_type_inferred (bool), company_name, company_number, use_classes text[], uprns bigint[], sample_addresses text[], last_sale_date, last_sale_price, constraints jsonb (conservation, article4, listed, flood), planning_recent jsonb, confidence numeric, refreshed_at`

---

## 6. UI (new route `/freeholds`)

- **Left panel:** filters F1–F6 exactly as §2, area selector, "Results: n" counter, save search.
- **Map:** coloured polygons (green = high confidence, amber = medium, grey = low). Overlay toggles: conservation areas, Article 4, listed buildings, flood zones, recent planning applications.
- **Click a polygon → side card:** address list, counts (addresses / leases / EPCs), owner type + company details, last sale, constraints, recent planning apps, links (HMLR title search, planning portal, Street View).
- **Actions:** "Add to Pipeline" (creates Firestore property + DCAS draft), "Buy title register" (Phase 3), "Export CSV" (for VA outreach / mail-merge).
- **Confidence score:** high when every UPRN in the polygon has an EPC/PPD/VOA record, polygon is a single building footprint, and address_count matches EPC count.

---

## 7. Phased delivery

| Phase | Deliverable | Done when |
|---|---|---|
| **0 — Setup** | Supabase+PostGIS project, schema migrations, env vars, `/freeholds` route skeleton with Google Map | Map renders inside Pipeline app behind existing auth |
| **1 — ETL (Reading only)** | Python ETL: INSPIRE, OS Open UPRN, Leases, EPC, CCOD/OCOD, VOA → `freehold_candidates` | Table populated for Reading; counts spot-checked on 20 known buildings vs Searchland |
| **2 — Filters + map** | `/api/freeholds` with F1–F6, polygon layer, side card, CSV export, Add to Pipeline | Same Reading search returns comparable list to Searchland's filter |
| **3 — Scale + accuracy** | All Thames Valley LAs; planning overlays; monthly refresh job; evaluate National Polygon Service sample and HMLR title purchase | Decision on paid data based on Phase 2 accuracy |
| **4 — Outreach** | Owner lookup (Companies House / purchased titles), letter mail-merge, contact log in Firestore | Linked into agent/VA outreach workflow |

---

## 8. Compliance

- Writing to **private individual** owners: GDPR legitimate-interest basis — keep a short Legitimate Interest Assessment, letters only (no cold calls to TPS numbers / no unsolicited email to individuals under PECR), include opt-out and data source statement.
- Respect each dataset's licence (some HMLR licences restrict commercial redistribution — data stays internal to Boudier).
- Log data source + refresh date on every record.

---

## 9. Open decisions for Andy

1. Approve Supabase (Postgres + PostGIS) alongside Firestore.
2. Confirm first-release LAs.
3. Budget for Phase 3 paid data (National Polygon Service quote + per-title purchases).
4. Google Maps API billing account (Maps JS + Street View).

---

## 10. Claude Code kick-off prompt

> Read `docs/unbroken-freehold-finder-PLAN.md`. Work on a new branch `feature/freehold-finder`. Start Phase 0: add Supabase/PostGIS schema migrations for `freehold_candidates` (see §5), create `/freeholds` route with a Google Map using `@vis.gl/react-google-maps` and deck.gl, behind existing auth. Then scaffold `etl/` (Python, uv) with one module per dataset in §3, starting with Reading (E06000038). Do not commit keys; list every env var needed. Stop after Phase 0 and report.

### Reference repos (starting points only)
- `cleder/uk-landregistry` — download INSPIRE polygons and load into a spatial DB (archived, Python)
- `3XE/Land-Registry-INSPIRE-Index-Polygons-tools` — INSPIRE GML conversion helpers
