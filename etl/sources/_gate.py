"""Licence gate.

Plan §1: licence terms for each dataset must be accepted by Andy before any
download. Each source module calls require_licence() first, so a missing
acceptance stops the run loudly instead of quietly pulling data we have no
right to hold.
"""

import os


class LicenceNotAccepted(RuntimeError):
    pass


def require_licence(env_var: str, dataset: str, where: str) -> None:
    if os.environ.get(env_var) != "1":
        raise LicenceNotAccepted(
            f"{dataset}: licence not accepted.\n"
            f"  Accept the terms at {where}, then set {env_var}=1 for this run.\n"
            f"  Nothing has been downloaded."
        )
