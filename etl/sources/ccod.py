"""UK and overseas company ownership.

    Drives owner_type (F4). A polygon with no match here is recorded as
    INFERRED private — flagged as an inference, never asserted as fact.
    Load CCOD and OCOD together; OCOD rows are marked overseas.

    Licence: accepted by Andy at https://use-land-property-data.service.gov.uk/datasets/ccod — see etl/README.md.
"""

from ._csv_source import find_file, get, load_csv
from ._gate import require_licence

DATASET = "HMLR CCOD / OCOD"
LICENCE_ENV = "HMLR_LICENCE_ACCEPTED"
SOURCE_URL = "https://use-land-property-data.service.gov.uk/datasets/ccod"
TABLE = "stg_ccod"
COLUMNS = ["uprn", "postcode", "company_name", "company_number", "is_overseas"]


def fetch(la_code: str, dest: str) -> str:
    """Locate the file you downloaded under your own account."""
    require_licence(LICENCE_ENV, DATASET, SOURCE_URL)
    return find_file(dest, "ccod", DATASET, SOURCE_URL)


def _row(rec: dict):
    name = get(rec, "proprietor-name-1", "proprietor_name_1", "proprietor name (1)")
    if not name:
        return None
    uprn = get(rec, "uprn")
    country = (get(rec, "proprietor-1-country-incorporated", "country_incorporated") or "").lower()
    overseas = bool(country) and "united kingdom" not in country and "england" not in country
    return (
        int(uprn) if uprn and uprn.isdigit() else None,
        get(rec, "property-address-postcode", "postcode"),
        name,
        get(rec, "company-registration-no-1", "company_registration_no_1"),
        overseas,
    )


def load(path: str, conn, la_code: str) -> int:
    return load_csv(path, conn, TABLE, COLUMNS, _row)
