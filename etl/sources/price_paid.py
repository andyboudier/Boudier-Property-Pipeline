"""Price Paid, with the TUID-to-UPRN lookup.

    Corroborates UPRNs and fills last_sale_date / last_sale_price.

    Licence: accepted by Andy at https://www.gov.uk/government/statistical-data-sets/price-paid-data-downloads — see etl/README.md.
"""

from ._csv_source import find_file, get, load_csv
from ._gate import require_licence

DATASET = "HMLR Price Paid"
LICENCE_ENV = "HMLR_LICENCE_ACCEPTED"
SOURCE_URL = "https://www.gov.uk/government/statistical-data-sets/price-paid-data-downloads"
TABLE = "stg_price_paid"
COLUMNS = ["uprn", "sale_date", "price"]


def fetch(la_code: str, dest: str) -> str:
    """Locate the file you downloaded under your own account."""
    require_licence(LICENCE_ENV, DATASET, SOURCE_URL)
    return find_file(dest, "price_paid", DATASET, SOURCE_URL)


def _row(rec: dict):
    uprn = get(rec, "uprn")
    if not uprn or not uprn.isdigit():
        return None
    price = get(rec, "price", "price_paid")
    date = (get(rec, "date_of_transfer", "deed_date", "date") or "")[:10] or None
    return (int(uprn), date, float(price) if price and price.replace(".", "").isdigit() else None)


def load(path: str, conn, la_code: str) -> int:
    return load_csv(path, conn, TABLE, COLUMNS, _row)
