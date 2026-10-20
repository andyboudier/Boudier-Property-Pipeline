"""Build freehold_candidates for one local authority (plan §4, Phase 1).

    uv run python -m etl.run --la E06000038            # Reading
    uv run python -m etl.run --la E06000038 --check    # what's missing, download nothing

Every source stops at its licence gate until that dataset's terms have been
accepted — see etl/README.md. Only OS Open UPRN downloads itself; the rest sit
behind a signed-in session, so you download them under your own account and
drop them in ./data/<source>/.
"""

import argparse
from pathlib import Path

from dotenv import load_dotenv

from .db import build_candidates, connect
from .sources import ccod, epc, inspire, leases, ocod, os_uprn, price_paid, voa
from .sources._gate import LicenceNotAccepted

# Order matters: polygons and points first, then the datasets that corroborate
# UPRNs, because the derivation drops any UPRN nothing else confirms.
PIPELINE = [inspire, os_uprn, epc, leases, ccod, ocod, voa, price_paid]


def main() -> int:
    # Credentials and licence gates live in the app's .env.local, one level up.
    for env_path in (Path(".env.local"), Path("..") / ".env.local", Path(__file__).parent.parent / ".env.local"):
        if env_path.exists():
            load_dotenv(env_path)
            break

    ap = argparse.ArgumentParser()
    ap.add_argument("--la", required=True, help="ONS local authority code, e.g. E06000038 (Reading)")
    ap.add_argument("--dest", default="./data", help="where downloads are cached")
    ap.add_argument("--check", action="store_true", help="report readiness, download nothing")
    args = ap.parse_args()

    if args.check:
        print(f"Readiness for {args.la}\n")
        ready = True
        for mod in PIPELINE:
            try:
                path = mod.fetch(args.la, args.dest)
                print(f"  ready    {mod.DATASET}\n           {path}")
            except LicenceNotAccepted:
                print(f"  LICENCE  {mod.DATASET} — set {mod.LICENCE_ENV}=1 once accepted")
                ready = False
            except FileNotFoundError as e:
                print(f"  MISSING  {mod.DATASET}")
                print(f"           {str(e).splitlines()[1].strip()}")
                ready = False
        print("\nAll sources ready." if ready else "\nNot ready — see above.")
        return 0 if ready else 1

    print(f"Building freehold_candidates for {args.la}\n")
    with connect() as conn:
        for mod in PIPELINE:
            try:
                path = mod.fetch(args.la, args.dest)
            except LicenceNotAccepted as e:
                print(f"STOPPED — {e}")
                return 1
            except FileNotFoundError as e:
                print(f"STOPPED — {e}")
                return 1
            n = mod.load(path, conn, args.la)
            print(f"  loaded {n:>9,}  {mod.DATASET}")

        print("\n  deriving candidates…")
        made = build_candidates(conn, args.la)
        print(f"  {made:,} freehold candidates written")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
