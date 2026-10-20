"""Non-domestic rating list.

    Corroborates commercial UPRNs and feeds the E (commercial) use class in
    F5.

    Licence: accepted by Andy at https://voaratinglists.blob.core.windows.net/html/rlidata.htm — see etl/README.md.
"""

from ._csv_source import find_file, get, load_csv
from ._gate import require_licence

DATASET = "VOA non-domestic rating list"
LICENCE_ENV = "VOA_LICENCE_ACCEPTED"
SOURCE_URL = "https://voaratinglists.blob.core.windows.net/html/rlidata.htm"
TABLE = "stg_voa"
COLUMNS = ["uprn", "description"]


def fetch(la_code: str, dest: str) -> str:
    """Locate the file you downloaded under your own account."""
    require_licence(LICENCE_ENV, DATASET, SOURCE_URL)
    return find_file(dest, "voa", DATASET, SOURCE_URL)


def _row(rec: dict):
    uprn = get(rec, "uprn")
    return (
        int(uprn) if uprn and uprn.isdigit() else None,
        get(rec, "description", "primary-description-text", "primary_description"),
    )


def load(path: str, conn, la_code: str) -> int:
    return load_csv(path, conn, TABLE, COLUMNS, _row)
