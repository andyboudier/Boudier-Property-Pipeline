"""HMLR OCOD — overseas company ownership.

    The overseas half of filter F4. Shares stg_ccod with CCOD and is loaded
    after it, appending rather than truncating, with is_overseas set.

    Licence: accepted by Andy at
    https://use-land-property-data.service.gov.uk/datasets/ocod
"""

from pathlib import Path

from ._csv_source import get, load_csv
from ._gate import require_licence
from ._hmlr_api import download, latest_file

DATASET = "HMLR OCOD (overseas owners)"
LICENCE_ENV = "HMLR_LICENCE_ACCEPTED"
SOURCE_URL = "https://use-land-property-data.service.gov.uk/datasets/ocod"
API_DATASET = "ocod"
TABLE = "stg_ccod"
COLUMNS = ["title_number", "tenure", "property_address", "postcode", "company_name", "company_number", "proprietorship", "country_incorporated", "is_overseas"]


def fetch(la_code: str, dest: str) -> str:
    require_licence(LICENCE_ENV, DATASET, SOURCE_URL)
    name = latest_file(API_DATASET)
    return download(API_DATASET, name, Path(dest) / "ocod")


def _row(rec: dict):
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
        True  # every OCOD proprietor is overseas,
    )


def load(path: str, conn, la_code: str) -> int:
    # append: CCOD has already truncated and filled the table this run
    return load_csv(path, conn, TABLE, COLUMNS, _row, truncate_first=False)
