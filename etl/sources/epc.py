"""EPC Open Data.

    Domestic and non-domestic certificates by UPRN. Drives F6 and helps F5.
    Needs EPC_API_KEY.

    Licence: accepted by Andy at https://epc.opendatacommunities.org/ — see etl/README.md.
    """

from ._gate import require_licence

DATASET = "EPC Open Data"
LICENCE_ENV = "EPC_LICENCE_ACCEPTED"
SOURCE_URL = "https://epc.opendatacommunities.org/"


def fetch(la_code: str, dest: str) -> str:
    """Download the dataset for one local authority. Returns the local path.

    Phase 1 stub — the licence gate is real, the download is not yet written.
    """
    require_licence(LICENCE_ENV, DATASET, SOURCE_URL)
    raise NotImplementedError(f"{DATASET}: download not implemented yet (Phase 1)")


def load(path: str, conn) -> int:
    """Load a downloaded file into PostGIS. Returns rows loaded."""
    raise NotImplementedError(f"{DATASET}: load not implemented yet (Phase 1)")
