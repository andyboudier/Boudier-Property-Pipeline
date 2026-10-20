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

import os
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

from lxml import etree

from ._gate import require_licence
from ._hmlr_api import BROWSER_UA

DATASET = "HMLR INSPIRE Index Polygons"
LICENCE_ENV = "INSPIRE_LICENCE_ACCEPTED"
SOURCE_URL = "https://use-land-property-data.service.gov.uk/datasets/inspire"

GML_NS = {
    "gml": "http://www.opengis.net/gml/3.2",
    "gml31": "http://www.opengis.net/gml",
}


# Council names as HMLR files them, keyed by ONS code.
COUNCIL_NAME = {
    "E06000038": "Reading",
    "E06000037": "West_Berkshire",
    "E06000041": "Wokingham",
    "E06000036": "Bracknell_Forest",
    "E06000040": "Windsor_and_Maidenhead",
    "E06000039": "Slough",
}

DOWNLOAD_PAGE = "https://use-land-property-data.service.gov.uk/datasets/inspire/download"


def _cached(folder: Path, la_code: str) -> str | None:
    """Any INSPIRE zip already downloaded for this council.

    The dataset refreshes monthly, so one download serves every run until the
    next release — this is what keeps it from being a per-run chore.
    """
    if not folder.exists():
        return None
    name = COUNCIL_NAME.get(la_code, "").lower()
    zips = sorted(folder.glob("*.zip"), key=lambda p: p.stat().st_mtime, reverse=True)
    for z in zips:
        if not name or name.replace("_", "") in z.stem.lower().replace("_", "").replace("-", ""):
            return str(z)
    return str(zips[0]) if zips else None


def _adopt_from_downloads(folder: Path, la_code: str) -> str | None:
    """Pick up a zip you just downloaded in the browser.

    Saves the copy-and-rename step: download it, and the next ETL run finds it
    in ~/Downloads and files it away itself.
    """
    name = COUNCIL_NAME.get(la_code, "").lower().replace("_", "")
    downloads = Path.home() / "Downloads"
    if not downloads.exists():
        return None
    for z in sorted(downloads.glob("*.zip"), key=lambda p: p.stat().st_mtime, reverse=True)[:40]:
        stem = z.stem.lower().replace("_", "").replace("-", "")
        if name and name in stem:
            folder.mkdir(parents=True, exist_ok=True)
            target = folder / z.name
            shutil.move(str(z), target)
            print(f"  found {z.name} in ~/Downloads — filed to {target}")
            return str(target)
    return None


def _session_download(folder: Path, la_code: str) -> str | None:
    """Download directly if a signed-in session cookie is available.

    Optional. HMLR has no API for INSPIRE, so the only automated route is to
    reuse a browser session: sign in, copy the session cookie from devtools
    into HMLR_SESSION_COOKIE, and this fetches without the browser round trip.
    Cookies expire after a while — when it stops working, refresh it or just
    use the browser.
    """
    cookie = os.environ.get("HMLR_SESSION_COOKIE")
    council = COUNCIL_NAME.get(la_code)
    if not cookie or not council:
        return None
    import httpx

    url = f"{DOWNLOAD_PAGE}/{council}.zip"
    headers = {"User-Agent": BROWSER_UA, "Cookie": cookie}
    try:
        with httpx.stream("GET", url, headers=headers, follow_redirects=True, timeout=300.0) as r:
            ctype = r.headers.get("content-type", "")
            if r.status_code != 200 or "zip" not in ctype.lower():
                return None  # almost certainly bounced to the sign-in page
            folder.mkdir(parents=True, exist_ok=True)
            target = folder / f"{council}.zip"
            with open(target, "wb") as fh:
                for chunk in r.iter_bytes(1 << 20):
                    fh.write(chunk)
        print(f"  downloaded {council}.zip with the saved session")
        return str(target)
    except Exception:
        return None


def fetch(la_code: str, dest: str) -> str:
    """Locate this council's INSPIRE zip, downloading it if that is possible.

    In order: a copy already downloaded, a signed-in session download, a zip
    sitting in ~/Downloads, and failing all three, open the page in the browser
    and say exactly what to click.
    """
    require_licence(LICENCE_ENV, DATASET, SOURCE_URL)
    folder = Path(dest) / "inspire"

    for finder in (lambda: _cached(folder, la_code),
                   lambda: _session_download(folder, la_code),
                   lambda: _adopt_from_downloads(folder, la_code)):
        found = finder()
        if found:
            return found

    council = COUNCIL_NAME.get(la_code, la_code)
    if os.environ.get("ETL_OPEN_BROWSER", "1") == "1" and sys.platform == "darwin":
        subprocess.run(["open", DOWNLOAD_PAGE], check=False)
        opened = "\n  Opened the download page in your browser."
    else:
        opened = ""

    raise FileNotFoundError(
        f"{DATASET}: no zip for {council}.{opened}\n"
        f"  Sign in, download '{council}', and re-run — it will be picked up from\n"
        f"  ~/Downloads automatically. HMLR has no API for INSPIRE, so this is the\n"
        f"  one manual step; the file refreshes monthly, so it is not a per-run chore.\n"
        f"  To skip even that, put a signed-in session cookie in HMLR_SESSION_COOKIE."
    )


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
    """Reproject to WGS84 and COPY into stg_inspire_polygon.

    Geometry goes in as EWKT, which PostGIS parses on COPY — no temp table and
    no second pass, so the whole load is one transaction.
    """
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
                    continue  # a ring with too few points, or self-intersecting
            if not shapes:
                continue
            geom = shp_transform(to_wgs84, MultiPolygon(shapes))
            yield (inspire_id, la_code, f"SRID=4326;{geom.wkt}")

    n = copy_rows(conn, "stg_inspire_polygon", ["inspire_id", "la_code", "geom"], rows())
    conn.commit()
    return n
