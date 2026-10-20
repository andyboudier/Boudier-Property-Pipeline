"""VOA non-domestic rating list.

    Commercial units and their description. Corroborates UPRNs and feeds F5.

    Licence: accepted by Andy at https://voaratinglists.blob.core.windows.net/html/rlidata.htm — see etl/README.md.
    """

from ._gate import require_licence

DATASET = "VOA non-domestic rating list"
LICENCE_ENV = "VOA_LICENCE_ACCEPTED"
SOURCE_URL = "https://voaratinglists.blob.core.windows.net/html/rlidata.htm"


def fetch(la_code: str, dest: str) -> str:
    """Download the dataset for one local authority. Returns the local path.

    Phase 1 stub — the licence gate is real, the download is not yet written.
    """
    require_licence(LICENCE_ENV, DATASET, SOURCE_URL)
    raise NotImplementedError(f"{DATASET}: download not implemented yet (Phase 1)")


def load(path: str, conn) -> int:
    """Load a downloaded file into PostGIS. Returns rows loaded."""
    raise NotImplementedError(f"{DATASET}: load not implemented yet (Phase 1)")
