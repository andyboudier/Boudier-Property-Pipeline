"""HMLR INSPIRE Index Polygons.

    Freehold title boundaries per local authority (monthly GML). Freehold-only,
    so filter F1 is satisfied by the source itself. No title numbers.

    Licence: accepted by Andy at https://use-land-property-data.service.gov.uk/datasets/inspire — see etl/README.md.
    """

from ._gate import require_licence

DATASET = "HMLR INSPIRE Index Polygons"
LICENCE_ENV = "INSPIRE_LICENCE_ACCEPTED"
SOURCE_URL = "https://use-land-property-data.service.gov.uk/datasets/inspire"


def fetch(la_code: str, dest: str) -> str:
    """Download the dataset for one local authority. Returns the local path.

    Phase 1 stub — the licence gate is real, the download is not yet written.
    """
    require_licence(LICENCE_ENV, DATASET, SOURCE_URL)
    raise NotImplementedError(f"{DATASET}: download not implemented yet (Phase 1)")


def load(path: str, conn) -> int:
    """Load a downloaded file into PostGIS. Returns rows loaded."""
    raise NotImplementedError(f"{DATASET}: load not implemented yet (Phase 1)")
