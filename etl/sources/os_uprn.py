"""OS Open UPRN.

    Lat/long for every UPRN. Includes non-address objects (car parks, street
    furniture), so results must be corroborated against another dataset.

    Licence: accepted by Andy at https://osdatahub.os.uk/downloads/open/OpenUPRN — see etl/README.md.
    """

from ._gate import require_licence

DATASET = "OS Open UPRN"
LICENCE_ENV = "OS_LICENCE_ACCEPTED"
SOURCE_URL = "https://osdatahub.os.uk/downloads/open/OpenUPRN"


def fetch(la_code: str, dest: str) -> str:
    """Download the dataset for one local authority. Returns the local path.

    Phase 1 stub — the licence gate is real, the download is not yet written.
    """
    require_licence(LICENCE_ENV, DATASET, SOURCE_URL)
    raise NotImplementedError(f"{DATASET}: download not implemented yet (Phase 1)")


def load(path: str, conn) -> int:
    """Load a downloaded file into PostGIS. Returns rows loaded."""
    raise NotImplementedError(f"{DATASET}: load not implemented yet (Phase 1)")
