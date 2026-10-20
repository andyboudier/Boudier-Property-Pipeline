"""HMLR Price Paid + TUID/UPRN lookup.

    Sale history. Corroborates UPRNs and fills last_sale_date / last_sale_price.

    Licence: accepted by Andy at https://www.gov.uk/government/statistical-data-sets/price-paid-data-downloads — see etl/README.md.
    """

from ._gate import require_licence

DATASET = "HMLR Price Paid + TUID/UPRN lookup"
LICENCE_ENV = "HMLR_LICENCE_ACCEPTED"
SOURCE_URL = "https://www.gov.uk/government/statistical-data-sets/price-paid-data-downloads"


def fetch(la_code: str, dest: str) -> str:
    """Download the dataset for one local authority. Returns the local path.

    Phase 1 stub — the licence gate is real, the download is not yet written.
    """
    require_licence(LICENCE_ENV, DATASET, SOURCE_URL)
    raise NotImplementedError(f"{DATASET}: download not implemented yet (Phase 1)")


def load(path: str, conn) -> int:
    """Load a downloaded file into PostGIS. Returns rows loaded."""
    raise NotImplementedError(f"{DATASET}: load not implemented yet (Phase 1)")
