# ETL — Unbroken Freehold Finder

Builds the `freehold_candidates` table (plan §4). Python + [uv]; runs monthly
from GitHub Actions or Cloud Run, never from the Next.js app.

```bash
uv sync
uv run python -m etl.run --la E06000038 --check   # what's missing — downloads nothing
uv run python -m etl.run --la E06000038           # build Reading
```

Needs `SUPABASE_DB_URL` (Supabase → Project Settings → Database → Connection
string → URI). Use the pooled connection on port 6543 for bulk loads.

## What downloads itself

Everything, now. The last manual step — HMLR's INSPIRE polygons, which sit
behind a signed-in website with no API — is gone: MHCLG republishes the same
polygons as the open **`title-boundary`** dataset on planning.data.gov.uk
(22.8 million entities, OGL v3, HMLR attribution). `inspire.py` tiles the
authority's bounding box (from the `local-authority-district` dataset, keyed
by ONS code) into ~2 km cells and pages each at 500 a time. Reading: 81,941
freehold polygons in about nine minutes, cached for 30 days.

The GML-zip route is kept as `load_gml` for anyone holding a file from the
HMLR site, but nothing requires it.

CCOD, OCOD and Registered Leases are national files (1.6 GB and 2.2 GB) with
no authority column, so after EPC has loaded, `run.py` records the postcode
districts seen in that authority's certificates and those loaders keep only
rows in them (`etl/context.py`).

VOA and Price Paid are corroborating-only and optional: if a file is missing
the build warns and continues.

## Licences — read before running

**Every dataset below must have its licence accepted by Andy, under his own
account, before anything is downloaded.** The modules deliberately refuse to
fetch until the matching `*_ACCEPTED=1` env var is set, so no download can
happen by accident. See plan §1 and §8.

| Module | Dataset | Key needed | Licence gate |
|---|---|---|---|
| `sources/inspire.py` | HMLR INSPIRE Index Polygons — **automatic, via planning.data.gov.uk `title-boundary`** | none | none (OGL v3) |
| `sources/os_uprn.py` | OS Open UPRN | OS Data Hub key | `OS_LICENCE_ACCEPTED` |
| `sources/leases.py` | HMLR Registered Leases | none (licence choice) | `HMLR_LICENCE_ACCEPTED` |
| `sources/ccod.py` | HMLR CCOD / OCOD (company + overseas owners) | account | `HMLR_LICENCE_ACCEPTED` |
| `sources/epc.py` | EPC Open Data (domestic + non-domestic) — **via the API, automatic** | `EPC_API_KEY` | `EPC_LICENCE_ACCEPTED` |
| `sources/voa.py` | VOA non-domestic rating list | none | `VOA_LICENCE_ACCEPTED` |
| `sources/price_paid.py` | HMLR Price Paid + TUID↔UPRN | none | `HMLR_LICENCE_ACCEPTED` |
| `sources/planning_data.py` | planning.data.gov.uk constraints | **none — OGL, open** | none |

### EPC: the API, not the bulk file

The plan (§3) points at `epc.opendatacommunities.org`; the service moved to
**get-energy-performance-data.communities.gov.uk**. Its API is documented at
`/api-technical-documentation` (OAS saved to `docs/epc-api-openapi.yml`) and
verified live: base `https://api.get-energy-performance-data.communities.gov.uk`,
`Authorization: Bearer <EPC_API_KEY>`, `GET /api/domestic/search` and
`/api/non-domestic/search` with `council[]=Reading&page_size=5000&current_page=N`.

Reading is 92,020 domestic + 5,350 non-domestic certificates — 21 requests,
about 30 seconds. The alternative, the full-load zip, is 8.3 GB for all of
England and Wales, so the search API wins for an authority-sized pull.

The search summary carries no property type, so flat/house/bungalow is
**inferred from the address line** and the domestic/non-domestic origin.
Exact types would mean streaming the full-load CSV on its `local_authority`
column — an upgrade for later, if F5 ever needs it.

`planning_data.py` is the one source with no key and no gate. It mirrors
`src/lib/planningData.ts` in the app, which is also what the GoPlanner
appraisal app draws its council data from.

## Method (plan §4, Phase 1)

1. INSPIRE polygons (freehold only → F1 automatic) into PostGIS.
2. `ST_Within(uprn_point, polygon)` → UPRNs per polygon.
3. Keep only UPRNs corroborated by EPC / Price Paid / Leases / VOA / CCOD —
   OS Open UPRN includes car parks and street furniture. → `address_count` (F2).
4. `lease_count` (F3) = those UPRNs appearing in Registered Leases, plus a
   normalised address+postcode match where the lease UPRN is blank.
5. `epc_uprn_count` / `epc_cert_count` (F6).
6. `owner_type` (F4) from CCOD/OCOD by address+postcode. No match ⇒ *inferred*
   private — recorded as `owner_type_inferred = true`, never presented as fact.
7. `use_classes` (F5) from EPC property type, VOA description, address patterns.
8. Confidence score, then upsert one row per polygon.

**Known limits.** INSPIRE polygons carry no title number; a large polygon may
cover several buildings; a UPRN sitting inside a polygon is not the same as a
UPRN being on that title. Expect false positives — hence the confidence score,
and hence Phase 3 (HMLR National Polygon + Title↔UPRN) to replace steps 1–4.
