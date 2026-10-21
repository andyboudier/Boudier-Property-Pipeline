"""HMLR INSPIRE Index Polygons — freehold title boundaries.

    Freehold-only, so filter F1 is satisfied by the source itself. Carries no
    title numbers; Phase 3 would replace this with the National Polygon Service.

    AUTOMATED, via planning.data.gov.uk. HMLR's own INSPIRE download sits
    behind a signed-in website with no API, but MHCLG republishes the same
    polygons as the open `title-boundary` dataset (22.8 million entities,
    OGL v3, Crown copyright / HMLR attribution). Verified live:

      GET https://www.planning.data.gov.uk/entity.json
          ?dataset=title-boundary&geometry_relation=intersects&limit=500
          &geometry=POLYGON((...bbox...))
      -> entities[{reference: <INSPIRE id>, geometry: <WGS84 WKT>, entry-date, ...}]
         with links.next for the following page.

    The authority's extent comes from the `local-authority-district` dataset
    on the same service, keyed by ONS code. Its full boundary is too long for
    a GET query, so the pull uses the bounding box; the derivation's spatial
    join clips to what matters anyway.

    The old route — a zip of GML from the HMLR website — is kept as a fallback
    (`load_gml`) for anyone holding such a file.
"""

import json
import os
import re
import time
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
from lxml import etree

DATASET = "HMLR INSPIRE Index Polygons (via planning.data.gov.uk title-boundary)"
LICENCE_ENV = None  # OGL v3 — nothing to accept
SOURCE_URL = "https://www.planning.data.gov.uk/dataset/title-boundary"
ATTRIBUTION = "Contains HM Land Registry data © Crown copyright and database right. OGL v3."

PDG = "https://www.planning.data.gov.uk"
PAGE = 500  # the API's maximum (1000 is rejected)
MAX_AGE_DAYS = int(os.environ.get("INSPIRE_MAX_AGE_DAYS", "30"))  # the dataset updates monthly
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"


def _bbox_from_wkt(wkt: str) -> tuple[float, float, float, float]:
    """(west, south, east, north) from any WKT — just the extreme coordinates."""
    xs, ys = [], []
    for x, y in re.findall(r"(-?\d+\.\d+)\s+(-?\d+\.\d+)", wkt):
        xs.append(float(x))
        ys.append(float(y))
    if not xs:
        raise ValueError("no coordinates in WKT")
    return min(xs), min(ys), max(xs), max(ys)


def la_boundary(client: httpx.Client, la_code: str) -> str | None:
    """The authority's official boundary (WGS84 WKT), from the
    local-authority-district dataset keyed by ONS code."""
    r = client.get(f"{PDG}/entity.json", params={"dataset": "local-authority-district", "reference": la_code})
    if r.status_code == 200:
        ents = r.json().get("entities") or []
        if ents and ents[0].get("geometry"):
            return ents[0]["geometry"]
    return None


def la_bbox(client: httpx.Client, la_code: str) -> tuple[float, float, float, float]:
    """The authority's extent, falling back to the hand-maintained table in
    la_bbox.py if the service has no boundary for it."""
    wkt = la_boundary(client, la_code)
    if wkt:
        return _bbox_from_wkt(wkt)
    from ..la_bbox import bbox_for

    return bbox_for(la_code)


def _steps(lo: float, hi: float, step: float) -> list[float]:
    out, v = [], lo
    while v < hi:
        out.append(round(v, 6))
        v += step
    return out


def _get_json(client: httpx.Client, url: str) -> dict:
    """GET with retries for the failures a public API actually produces:
    read timeouts and transient 429/5xx — not just non-200 codes."""
    last: Exception | None = None
    for attempt in range(6):
        try:
            r = client.get(url)
        except (httpx.TimeoutException, httpx.TransportError) as e:
            last = e
            time.sleep(2 * (attempt + 1))
            continue
        if r.status_code in (429, 500, 502, 503, 504):
            time.sleep(2 * (attempt + 1))
            continue
        if r.status_code != 200:
            raise RuntimeError(f"{DATASET}: HTTP {r.status_code}: {r.text[:160]}")
        return r.json()
    raise RuntimeError(f"{DATASET}: gave up after 6 attempts ({last})")


def _fresh(path: Path) -> bool:
    if not path.exists():
        return False
    age = datetime.now(timezone.utc) - datetime.fromtimestamp(path.stat().st_mtime, timezone.utc)
    return age < timedelta(days=MAX_AGE_DAYS)


def fetch(la_code: str, dest: str) -> str:
    """Page every title boundary intersecting the authority's bounding box into
    a JSONL cache. Reused until MAX_AGE_DAYS old."""
    folder = Path(dest) / "inspire"
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / f"{la_code}.jsonl"
    if _fresh(target):
        return str(target)

    # One query over a whole authority times out server-side, so the bbox is
    # tiled into ~2 km cells and each is paged separately. Cells are quick,
    # the loop is resumable, and polygons straddling a cell edge are deduped
    # by reference.
    tile = float(os.environ.get("INSPIRE_TILE_DEG", "0.02"))
    seen: set[str] = set()
    tmp = target.with_suffix(".jsonl.part")
    with httpx.Client(headers={"User-Agent": UA, "Accept": "application/json"}, timeout=60.0, follow_redirects=True) as client:
        # The bbox over-fetches into neighbouring authorities. Keep a polygon
        # only if its representative point falls inside this authority's real
        # boundary — otherwise neighbours get mis-tagged, and once several
        # authorities are loaded the same building appears under two of them.
        from shapely import wkt as shp_wkt
        from shapely.prepared import prep

        boundary_wkt = la_boundary(client, la_code)
        inside = prep(shp_wkt.loads(boundary_wkt)) if boundary_wkt else None
        west, south, east, north = (_bbox_from_wkt(boundary_wkt) if boundary_wkt else la_bbox(client, la_code))
        kept_out = 0
        cells = [(x, y) for x in _steps(west, east, tile) for y in _steps(south, north, tile)]
        with open(tmp, "w", encoding="utf-8") as out:
            for i, (x, y) in enumerate(cells, 1):
                cell = f"POLYGON(({x} {y},{x + tile} {y},{x + tile} {y + tile},{x} {y + tile},{x} {y}))"
                url: str | None = str(httpx.URL(f"{PDG}/entity.json", params={
                    "dataset": "title-boundary", "geometry_relation": "intersects", "limit": PAGE, "geometry": cell,
                }))
                while url:
                    body = _get_json(client, url)
                    for e in body.get("entities") or []:
                        ref = str(e.get("reference") or "")
                        geom = e.get("geometry")
                        if ref and geom and ref not in seen:
                            seen.add(ref)
                            if inside is not None:
                                try:
                                    if not inside.contains(shp_wkt.loads(geom).representative_point()):
                                        kept_out += 1
                                        continue
                                except Exception:
                                    pass  # unparseable geometry: keep it rather than lose it silently
                            out.write(json.dumps({"reference": ref, "geometry": geom, "entry_date": e.get("entry-date")}) + "\n")
                    # links.next is issued as http://, which CloudFront 301s to https://.
                    url = (body.get("links") or {}).get("next")
                    if url and url.startswith("http://"):
                        url = "https://" + url[len("http://"):]
                    time.sleep(0.15)
                print(f"\r  INSPIRE {la_code}: cell {i}/{len(cells)} ({len(seen) - kept_out:,} inside, {kept_out:,} outside)", end="", flush=True)
        print()
    tmp.replace(target)
    return str(target)


def _as_multipolygon(wkt: str) -> str:
    """The column is MultiPolygon; a plain POLYGON needs wrapping."""
    w = wkt.strip()
    if w.upper().startswith("POLYGON"):
        return "MULTIPOLYGON(" + w[len("POLYGON"):].strip() + ")"
    return w


def load(path: str, conn, la_code: str) -> int:
    """COPY the cached polygons into stg_inspire_polygon as EWKT."""
    if path.lower().endswith(".zip"):
        return load_gml(path, conn, la_code)
    from ..db import copy_rows, truncate

    truncate(conn, "stg_inspire_polygon")

    def rows():
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                rec = json.loads(line)
                yield (rec["reference"], la_code, f"SRID=4326;{_as_multipolygon(rec['geometry'])}")

    n = copy_rows(conn, "stg_inspire_polygon", ["inspire_id", "la_code", "geom"], rows())
    # A handful of boundaries (12 of 81,941 for Reading) are self-intersecting
    # as published. ST_Within errors on an invalid polygon, so repair them.
    with conn.cursor() as cur:
        cur.execute(
            # MakeValid may yield a GeometryCollection (polygon + stray lines);
            # keep only the polygonal parts (type 3) so the column type holds.
            "update stg_inspire_polygon "
            "set geom = st_multi(st_collectionextract(st_makevalid(geom), 3)) "
            "where la_code = %s and not st_isvalid(geom)", (la_code,))
    conn.commit()
    return n


# ── Fallback: a GML zip downloaded from the HMLR website ─────────────────────

def _rings(poly: etree._Element) -> list[list[tuple[float, float]]]:
    rings: list[list[tuple[float, float]]] = []
    for tag in ("exterior", "interior"):
        for ring in poly.iterfind(f".//{{*}}{tag}"):
            for poslist in ring.iterfind(".//{*}posList"):
                raw = (poslist.text or "").split()
                pts = [(float(raw[i]), float(raw[i + 1])) for i in range(0, len(raw) - 1, 2)]
                if len(pts) >= 4:
                    rings.append(pts)
    return rings


def parse(path: str):
    """Yield (inspire_id, [rings]) per polygon from a GML zip, streaming."""
    with zipfile.ZipFile(path) as zf:
        names = [n for n in zf.namelist() if n.lower().endswith(".gml")]
        if not names:
            raise RuntimeError(f"{DATASET}: no .gml inside {path}")
        for name in names:
            with zf.open(name) as fh:
                for _, elem in etree.iterparse(fh, events=("end",), tag="{*}featureMember"):
                    inspire_id = None
                    for idnode in elem.iterfind(".//{*}INSPIREID"):
                        inspire_id = (idnode.text or "").strip()
                        break
                    polys = [p for p in (_rings(p) for p in elem.iterfind(".//{*}Polygon")) if p]
                    if inspire_id and polys:
                        yield inspire_id, polys
                    elem.clear()
                    while elem.getprevious() is not None:
                        del elem.getparent()[0]


def load_gml(path: str, conn, la_code: str) -> int:
    """GML is in British National Grid; reproject to WGS84 and COPY as EWKT."""
    from pyproj import Transformer
    from shapely.geometry import MultiPolygon, Polygon
    from shapely.ops import transform as shp_transform

    from ..db import copy_rows, truncate

    to_wgs84 = Transformer.from_crs("EPSG:27700", "EPSG:4326", always_xy=True).transform
    truncate(conn, "stg_inspire_polygon")

    def rows():
        for inspire_id, polys in parse(path):
            shapes = []
            for rings in polys:
                try:
                    shapes.append(Polygon(rings[0], rings[1:]))
                except Exception:
                    continue
            if shapes:
                geom = shp_transform(to_wgs84, MultiPolygon(shapes))
                yield (inspire_id, la_code, f"SRID=4326;{geom.wkt}")

    n = copy_rows(conn, "stg_inspire_polygon", ["inspire_id", "la_code", "geom"], rows())
    conn.commit()
    return n
