"""OS Open UPRN — a point for every UPRN in Great Britain.

    The only source here that downloads without a signed-in session: the OS
    Data Hub downloads API serves Open Data anonymously. Verified against
    https://api.os.uk/downloads/v1/products/OpenUPRN — 619 MB CSV, GB-wide.

    The file includes non-address objects (car parks, street furniture), which
    is why the derivation keeps only UPRNs another dataset corroborates.

    Licence: OS Open Data, accepted by Andy at https://osdatahub.os.uk
"""

import csv
import io
import os
import zipfile
from pathlib import Path

import httpx

from ._gate import require_licence

DATASET = "OS Open UPRN"
LICENCE_ENV = "OS_LICENCE_ACCEPTED"
SOURCE_URL = "https://osdatahub.os.uk"
DOWNLOAD = "https://api.os.uk/downloads/v1/products/OpenUPRN/downloads?area=GB&format=CSV&redirect"


def fetch(la_code: str, dest: str) -> str:
    """Download the GB CSV once and cache it — it is the same file for every
    authority, so re-downloading 619 MB per LA would be wasteful."""
    require_licence(LICENCE_ENV, DATASET, SOURCE_URL)
    folder = Path(dest) / "os_uprn"
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / "osopenuprn_gb.zip"
    if target.exists() and target.stat().st_size > 1_000_000:
        return str(target)

    with httpx.stream("GET", DOWNLOAD, follow_redirects=True, timeout=120.0) as r:
        r.raise_for_status()
        total = int(r.headers.get("content-length") or 0)
        done = 0
        with open(target, "wb") as fh:
            for chunk in r.iter_bytes(1 << 20):
                fh.write(chunk)
                done += len(chunk)
                if total:
                    print(f"\r  OS Open UPRN {done / 1e6:,.0f}/{total / 1e6:,.0f} MB", end="", flush=True)
        print()
    return str(target)


def _open_csv(path: str):
    """The download is a zip containing one or more CSVs; stream them."""
    if path.lower().endswith(".zip"):
        with zipfile.ZipFile(path) as zf:
            for name in zf.namelist():
                if name.lower().endswith(".csv"):
                    with zf.open(name) as fh:
                        yield from csv.DictReader(io.TextIOWrapper(fh, "utf-8"))
    else:
        with open(path, newline="", encoding="utf-8") as fh:
            yield from csv.DictReader(fh)


def load(path: str, conn, la_code: str) -> int:
    """Stream the GB file, keep only points inside this authority's bounding
    box, and COPY those into stg_uprn."""
    from ..db import copy_rows, truncate
    from ..la_bbox import bbox_for

    west, south, east, north = bbox_for(la_code)
    truncate(conn, "stg_uprn")

    def rows():
        for rec in _open_csv(path):
            # Column names vary by release; LATITUDE/LONGITUDE are the stable pair.
            try:
                lat = float(rec.get("LATITUDE") or rec.get("latitude") or "")
                lng = float(rec.get("LONGITUDE") or rec.get("longitude") or "")
                uprn = int(rec.get("UPRN") or rec.get("uprn") or "")
            except (TypeError, ValueError):
                continue
            if west <= lng <= east and south <= lat <= north:
                yield (uprn, f"POINT({lng} {lat})")

    with conn.cursor() as cur:
        cur.execute("create temp table _u (uprn bigint, wkt text) on commit drop")
    n = copy_rows(conn, "_u", ["uprn", "wkt"], rows())
    with conn.cursor() as cur:
        cur.execute(
            "insert into stg_uprn (uprn, geom) "
            "select uprn, st_geomfromtext(wkt, 4326) from _u "
            "on conflict (uprn) do nothing"
        )
    conn.commit()
    return n
