"""Build freehold_candidates for one local authority (plan §4, Phase 1).

Usage:  uv run python -m etl.run --la E06000038

Stops at the first dataset whose licence has not been accepted — see
etl/README.md. Nothing is downloaded before that check.
"""

import argparse

from .sources import ccod, epc, inspire, leases, os_uprn, price_paid, voa
from .sources._gate import LicenceNotAccepted

PIPELINE = [inspire, os_uprn, leases, epc, ccod, voa, price_paid]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--la", required=True, help="ONS local authority code, e.g. E06000038 (Reading)")
    ap.add_argument("--dest", default="./data", help="where downloads are cached")
    args = ap.parse_args()

    print(f"Building freehold_candidates for {args.la}\n")
    for mod in PIPELINE:
        try:
            mod.fetch(args.la, args.dest)
        except LicenceNotAccepted as e:
            print(f"STOPPED — {e}")
            return 1
        except NotImplementedError as e:
            print(f"  todo: {e}")
    print("\nPhase 1 downloads are not implemented yet; the licence gates are.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
