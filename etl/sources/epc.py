"""Energy Performance Certificates — domestic and non-domestic.

    Drives filter F6 (more than two EPCs on a title, as evidence the building
    is genuinely multi-unit) and helps classify use for F5.

    NOTE: this service MOVED. The old epc.opendatacommunities.org now
    redirects here, and the old /api/v1/domestic/search path is gone (404).
    Choose "Download files" on the data-access page and filter to one local
    authority — bulk CSV is the right shape for an ETL anyway, and avoids
    paginating an API for tens of thousands of certificates.

    Licence: accepted by Andy at https://get-energy-performance-data.communities.gov.uk — see etl/README.md.
"""

from ._csv_source import find_file, get, load_csv
from ._gate import require_licence

DATASET = "EPC Open Data"
LICENCE_ENV = "EPC_LICENCE_ACCEPTED"
SOURCE_URL = "https://get-energy-performance-data.communities.gov.uk"
TABLE = "stg_epc"
COLUMNS = ["uprn", "postcode", "address", "property_type", "certificate_id"]


def fetch(la_code: str, dest: str) -> str:
    """Locate the file you downloaded under your own account."""
    require_licence(LICENCE_ENV, DATASET, SOURCE_URL)
    return find_file(dest, "epc", DATASET, SOURCE_URL)


def _row(rec: dict):
    uprn = get(rec, "uprn")
    if not uprn or not uprn.isdigit():
        return None
    address = ", ".join(x for x in (get(rec, "address1"), get(rec, "address2"), get(rec, "address3")) if x) or get(rec, "address")
    return (int(uprn), get(rec, "postcode"), address, get(rec, "property_type"), get(rec, "lmk_key"))


def load(path: str, conn, la_code: str) -> int:
    return load_csv(path, conn, TABLE, COLUMNS, _row)
