"""Every registered lease over seven years.

    Drives lease_count (F3) — the test of whether a freehold is still
    unbroken. Where the lease record has no UPRN the derivation falls back to
    matching on normalised address and postcode.

    Licence: accepted by Andy at https://use-land-property-data.service.gov.uk/datasets/leases — see etl/README.md.
"""

from pathlib import Path

from ._csv_source import get, load_csv
from ._gate import require_licence
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


def _row(rec: dict):
    uprn = get(rec, "uprn")
    return (
        int(uprn) if uprn and uprn.isdigit() else None,
        get(rec, "associated-property-description", "property_description", "address"),
        get(rec, "postcode"),
    )


def load(path: str, conn, la_code: str) -> int:
    return load_csv(path, conn, TABLE, COLUMNS, _row)
