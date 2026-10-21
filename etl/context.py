"""Per-run scope shared between sources.

CCOD, OCOD and Registered Leases are national files — 1.6 GB and 2.2 GB —
with no authority column. Loading all of England into staging to use one
town is pointless, so after EPC has loaded, run.py records the postcode
districts (RG1, RG30, ...) seen in that authority's certificates and the
national loaders keep only rows in those districts. Over-inclusion is fine:
the derivation joins on full postcode later.
"""

OUTCODES: set[str] | None = None

# The council's post towns, normalised ("reading", "newbury"), from its EPCs.
# Keeps CCOD/OCOD titles that have no postcode — common for council and
# housing association estates — when one names a town in scope.
TOWNS: set[str] | None = None


def outcode(postcode: str | None) -> str | None:
    if not postcode:
        return None
    return postcode.strip().upper().split()[0] if " " in postcode.strip() else postcode.strip().upper()[:-3] or None


def in_scope(postcode: str | None) -> bool:
    """True when no scope is set, or the postcode's district is in it."""
    if OUTCODES is None:
        return True
    oc = outcode(postcode)
    return bool(oc) and oc in OUTCODES
