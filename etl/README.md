# ETL — Unbroken Freehold Finder

Builds the `freehold_candidates` table (plan §4). Python + [uv]; runs monthly
from GitHub Actions or Cloud Run, never from the Next.js app.

```bash
uv sync
uv run python -m etl.run --la E06000038      # Reading
```

## Licences — read before running

**Every dataset below must have its licence accepted by Andy, under his own
account, before anything is downloaded.** The modules deliberately refuse to
fetch until the matching `*_ACCEPTED=1` env var is set, so no download can
happen by accident. See plan §1 and §8.

| Module | Dataset | Key needed | Licence gate |
|---|---|---|---|
| `sources/inspire.py` | HMLR INSPIRE Index Polygons (freehold boundaries) | none | `INSPIRE_LICENCE_ACCEPTED` |
| `sources/os_uprn.py` | OS Open UPRN | OS Data Hub key | `OS_LICENCE_ACCEPTED` |
| `sources/leases.py` | HMLR Registered Leases | none (licence choice) | `HMLR_LICENCE_ACCEPTED` |
| `sources/ccod.py` | HMLR CCOD / OCOD (company + overseas owners) | account | `HMLR_LICENCE_ACCEPTED` |
| `sources/epc.py` | EPC Open Data (domestic + non-domestic) | `EPC_API_KEY` | `EPC_LICENCE_ACCEPTED` |
| `sources/voa.py` | VOA non-domestic rating list | none | `VOA_LICENCE_ACCEPTED` |
| `sources/price_paid.py` | HMLR Price Paid + TUID↔UPRN | none | `HMLR_LICENCE_ACCEPTED` |
| `sources/planning_data.py` | planning.data.gov.uk constraints | **none — OGL, open** | none |

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
