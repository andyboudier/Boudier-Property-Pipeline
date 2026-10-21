"""HMLR OCOD — overseas company ownership.

    The overseas half of filter F4. Shares stg_ccod with CCOD and is loaded
    after it, appending rather than truncating, with is_overseas set.

    Licence: accepted by Andy at
    https://use-land-property-data.service.gov.uk/datasets/ocod
"""

from pathlib import Path

from ._csv_source import get, load_csv
from ._gate import require_licence
from ..context import in_scope
from ._hmlr_api import download, latest_file

DATASET = "HMLR OCOD (overseas owners)"
LICENCE_ENV = "HMLR_LICENCE_ACCEPTED"
SOURCE_URL = "https://use-land-property-data.service.gov.uk/datasets/ocod"
API_DATASET = "ocod"
TABLE = "stg_ccod"
COLUMNS = ["title_number", "tenure", "property_address", "postcode", "company_name", "company_number", "proprietorship", "country_incorporated", "is_overseas", "proprietor_address"]


def fetch(la_code: str, dest: str) -> str:
    require_licence(LICENCE_ENV, DATASET, SOURCE_URL)
    name = latest_file(API_DATASET)
    return download(API_DATASET, name, Path(dest) / "ocod")


def _prop_addr(rec: dict) -> str | None:
    """The proprietor's correspondence address, as published — the address to
    write to for an overseas-company-owned freehold."""
    parts = [get(rec, f"Proprietor (1) Address ({i})") for i in (1, 2, 3)]
    parts = [p for p in parts if p]
    return "; ".join(parts) if parts else None


def _row(rec: dict):
    if not in_scope(get(rec, "Postcode")):
        return None
    name = get(rec, "Proprietor Name (1)")
    if not name:
        return None
    return (
        get(rec, "Title Number"),
        get(rec, "Tenure"),
        get(rec, "Property Address"),
        get(rec, "Postcode"),
        name,
        get(rec, "Company Registration No. (1)"),
        get(rec, "Proprietorship Category (1)"),
        (get(rec, "Country Incorporated (1)") or "").strip() or None,
        True,  # every OCOD proprietor is overseas
        _prop_addr(rec),
    )


def load(path: str, conn, la_code: str) -> int:
    # append: CCOD has already truncated and filled the table this run
    return load_csv(path, conn, TABLE, COLUMNS, _row, truncate_first=False)
