"""Every registered lease over seven years.

    Drives lease_count (F3) — the test of whether a freehold is still
    unbroken. Where the lease record has no UPRN the derivation falls back to
    matching on normalised address and postcode.

    Licence: accepted by Andy at https://use-land-property-data.service.gov.uk/datasets/leases — see etl/README.md.
"""

import re
from pathlib import Path

from ._csv_source import get, load_csv
from ._gate import require_licence
from ..context import in_scope
from ._hmlr_api import download, latest_file

DATASET = "HMLR Registered Leases"
LICENCE_ENV = "HMLR_LICENCE_ACCEPTED"
SOURCE_URL = "https://use-land-property-data.service.gov.uk/datasets/leases"
API_DATASET = "leases"
TABLE = "stg_lease"
COLUMNS = ["uprn", "address", "postcode"]


def fetch(la_code: str, dest: str) -> str:
    """Download the newest full file through the HMLR API (cached)."""
    require_licence(LICENCE_ENV, DATASET, SOURCE_URL)
    name = latest_file(API_DATASET)
    return download(API_DATASET, name, Path(dest) / "leases")


# The real file has no postcode column: it is the tail of "Associated
# Property Description" ("19 ALCESTER CRESCENT, LONDON E5 9PX"). The UPRN
# column is "OS UPRN".
POSTCODE_AT_END = re.compile(r"\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\s*\)?\s*$", re.I)


def _postcode(desc: str | None) -> str | None:
    if not desc:
        return None
    m = POSTCODE_AT_END.search(desc.strip())
    if not m:
        return None
    pc = m.group(1).upper().replace(" ", "")
    return f"{pc[:-3]} {pc[-3:]}"


def _row(rec: dict):
    desc = get(rec, "Associated Property Description") or get(rec, "Register Property Description")
    postcode = _postcode(desc)
    if not in_scope(postcode):
        return None
    uprn = get(rec, "OS UPRN", "uprn")
    return (
        int(uprn) if uprn and uprn.isdigit() else None,
        desc,
        postcode,
    )


def load(path: str, conn, la_code: str) -> int:
    return load_csv(path, conn, TABLE, COLUMNS, _row)
