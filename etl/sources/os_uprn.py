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

    from ..net import download as stream_to

    stream_to(DOWNLOAD, target, progress="OS Open UPRN")
    return str(target)


def _open_csv(path: str):
    """The download is a zip containing one or more CSVs; stream them."""
    if path.lower().endswith(".zip"):
        with zipfile.ZipFile(path) as zf:
            for name in zf.namelist():
                if name.lower().endswith(".csv"):
                    with zf.open(name) as fh:
                        yield from csv.DictReader(io.TextIOWrapper(fh, "utf-8-sig"))
    else:
        with open(path, newline="", encoding="utf-8-sig") as fh:
            yield from csv.DictReader(fh)


def load(path: str, conn, la_code: str) -> int:
    """Stream the GB file, keep only points inside this authority's bounding
    box, and COPY those into stg_uprn as EWKT."""
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
                yield (uprn, f"SRID=4326;POINT({lng} {lat})")

    n = copy_rows(conn, "stg_uprn", ["uprn", "geom"], rows())
    conn.commit()
    return n
