"""Every registered lease over seven years.

    Drives lease_count (F3) — the test of whether a freehold is still
    unbroken. Where the lease record has no UPRN the derivation falls back to
    matching on normalised address and postcode.

    Licence: accepted by Andy at https://use-land-property-data.service.gov.uk/datasets/leases — see etl/README.md.
"""

from ._csv_source import find_file, get, load_csv
from ._gate import require_licence

DATASET = "HMLR Registered Leases"
LICENCE_ENV = "HMLR_LICENCE_ACCEPTED"
SOURCE_URL = "https://use-land-property-data.service.gov.uk/datasets/leases"
TABLE = "stg_lease"
COLUMNS = ["uprn", "address", "postcode"]


def fetch(la_code: str, dest: str) -> str:
    """Locate the file you downloaded under your own account."""
    require_licence(LICENCE_ENV, DATASET, SOURCE_URL)
    return find_file(dest, "leases", DATASET, SOURCE_URL)


def _row(rec: dict):
    uprn = get(rec, "uprn")
    return (
        int(uprn) if uprn and uprn.isdigit() else None,
        get(rec, "associated-property-description", "property_description", "address"),
        get(rec, "postcode"),
    )


def load(path: str, conn, la_code: str) -> int:
    return load_csv(path, conn, TABLE, COLUMNS, _row)
