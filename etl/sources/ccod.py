"""UK and overseas company ownership.

    Drives owner_type (F4). A polygon with no match here is recorded as
    INFERRED private — flagged as an inference, never asserted as fact.
    Load CCOD and OCOD together; OCOD rows are marked overseas.

    Licence: accepted by Andy at https://use-land-property-data.service.gov.uk/datasets/ccod — see etl/README.md.
"""

from pathlib import Path

from ._csv_source import get, load_csv
from ._gate import require_licence
from ..context import in_scope
from ._hmlr_api import download, latest_file

DATASET = "HMLR CCOD / OCOD"
LICENCE_ENV = "HMLR_LICENCE_ACCEPTED"
SOURCE_URL = "https://use-land-property-data.service.gov.uk/datasets/ccod"
API_DATASET = "ccod"
TABLE = "stg_ccod"
COLUMNS = ["title_number", "tenure", "property_address", "postcode", "company_name", "company_number", "proprietorship", "country_incorporated", "is_overseas"]


def fetch(la_code: str, dest: str) -> str:
    """Download the newest full file through the HMLR API (cached)."""
    require_licence(LICENCE_ENV, DATASET, SOURCE_URL)
    name = latest_file(API_DATASET)
    return download(API_DATASET, name, Path(dest) / "ccod")


def _row(rec: dict):
    if not in_scope(get(rec, "Postcode")):
        return None
    name = get(rec, "Proprietor Name (1)")
    if not name:
        return None
    country = (get(rec, "Country Incorporated (1)") or "").strip()
    return (
        get(rec, "Title Number"),
        get(rec, "Tenure"),
        get(rec, "Property Address"),
        get(rec, "Postcode"),
        name,
        get(rec, "Company Registration No. (1)"),
        get(rec, "Proprietorship Category (1)"),
        country or None,
        bool(country) and country.upper() not in ("UNITED KINGDOM", "ENGLAND", "WALES", "SCOTLAND", "NORTHERN IRELAND"),
    )


def load(path: str, conn, la_code: str) -> int:
    return load_csv(path, conn, TABLE, COLUMNS, _row)
