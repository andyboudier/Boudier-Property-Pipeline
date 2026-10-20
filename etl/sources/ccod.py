"""HMLR CCOD / OCOD.

    UK and overseas company ownership. Drives owner_type (F4). A polygon with
    no match is INFERRED private — flag it, never assert it.

    Licence: accepted by Andy at https://use-land-property-data.service.gov.uk/datasets/ccod — see etl/README.md.
    """

from ._gate import require_licence

DATASET = "HMLR CCOD / OCOD"
LICENCE_ENV = "HMLR_LICENCE_ACCEPTED"
SOURCE_URL = "https://use-land-property-data.service.gov.uk/datasets/ccod"


def fetch(la_code: str, dest: str) -> str:
    """Download the dataset for one local authority. Returns the local path.

    Phase 1 stub — the licence gate is real, the download is not yet written.
    """
    require_licence(LICENCE_ENV, DATASET, SOURCE_URL)
    raise NotImplementedError(f"{DATASET}: download not implemented yet (Phase 1)")


def load(path: str, conn) -> int:
    """Load a downloaded file into PostGIS. Returns rows loaded."""
    raise NotImplementedError(f"{DATASET}: load not implemented yet (Phase 1)")
