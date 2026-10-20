"""HMLR INSPIRE Index Polygons — freehold title boundaries.

    Freehold-only, so filter F1 is satisfied by the source itself. Carries no
    title numbers; Phase 3 replaces this with the National Polygon Service.

    Licence: accepted by Andy at
    https://use-land-property-data.service.gov.uk/datasets/inspire

    NOT auto-downloadable. The download sits behind a signed-in session — an
    anonymous request to the dataset URL just bounces between /datasets/inspire
    and /datasets/inspire/download. So you download the per-authority zip from
    that page yourself and point this module at the file.
"""

import zipfile
from pathlib import Path

from lxml import etree

from ._gate import require_licence

DATASET = "HMLR INSPIRE Index Polygons"
LICENCE_ENV = "INSPIRE_LICENCE_ACCEPTED"
SOURCE_URL = "https://use-land-property-data.service.gov.uk/datasets/inspire"

GML_NS = {
    "gml": "http://www.opengis.net/gml/3.2",
    "gml31": "http://www.opengis.net/gml",
}


def fetch(la_code: str, dest: str) -> str:
    """Locate the manually downloaded zip for this authority."""
    require_licence(LICENCE_ENV, DATASET, SOURCE_URL)
    folder = Path(dest) / "inspire"
    candidates = sorted(folder.glob("*.zip")) if folder.exists() else []
    if not candidates:
        raise FileNotFoundError(
            f"{DATASET}: no zip found in {folder}.\n"
            f"  Sign in at {SOURCE_URL}, download the zip for this local authority,\n"
            f"  and save it there. The download requires a session, so it cannot be automated."
        )
    return str(candidates[0])


def _rings(poly: etree._Element) -> list[list[tuple[float, float]]]:
    """Exterior ring plus any interior rings, as (lng, lat) in WGS84.

    INSPIRE GML is published in British National Grid (EPSG:27700); the caller
    reprojects. Coordinates arrive as whitespace-separated "x y" pairs.
    """
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
    """Yield (inspire_id, [rings]) for each polygon in the zip.

    Streams with iterparse and clears each element — an authority's file holds
    tens of thousands of polygons and will not fit comfortably in memory.
    """
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
                    if not inspire_id:
                        for idnode in elem.iterfind(".//{*}*[@{*}id]"):
                            inspire_id = idnode.get("{http://www.opengis.net/gml/3.2}id") or idnode.get("id")
                            if inspire_id:
                                break
                    polys = [_rings(p) for p in elem.iterfind(".//{*}Polygon")]
                    polys = [p for p in polys if p]
                    if inspire_id and polys:
                        yield inspire_id, polys
                    elem.clear()
                    while elem.getprevious() is not None:
                        del elem.getparent()[0]


def load(path: str, conn, la_code: str) -> int:
    """Reproject to WGS84 and COPY into stg_inspire_polygon."""
    from pyproj import Transformer
    from shapely.geometry import MultiPolygon, Polygon
    from shapely.ops import transform as shp_transform

    from ..db import copy_rows, truncate

    # INSPIRE is published in British National Grid.
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
            if not shapes:
                continue
            geom = shp_transform(to_wgs84, MultiPolygon(shapes))
            yield (inspire_id, la_code, geom.wkt)

    with conn.cursor() as cur:
        cur.execute("create temp table _ins (inspire_id text, la_code text, wkt text) on commit drop")
    n = copy_rows(conn, "_ins", ["inspire_id", "la_code", "wkt"], rows())
    with conn.cursor() as cur:
        cur.execute(
            "insert into stg_inspire_polygon (inspire_id, la_code, geom) "
            "select inspire_id, la_code, st_multi(st_geomfromtext(wkt, 4326)) from _ins "
            "on conflict (inspire_id, la_code) do update set geom = excluded.geom"
        )
    conn.commit()
    return n
