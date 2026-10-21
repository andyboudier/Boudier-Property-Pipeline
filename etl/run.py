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

from . import context
from .db import build_candidates, connect
from .sources import ccod, epc, inspire, leases, ocod, os_uprn, price_paid, voa
from .sources._gate import LicenceNotAccepted

# Order matters: polygons and points first, then the datasets that corroborate
# UPRNs, because the derivation drops any UPRN nothing else confirms.
# Order matters: polygons and points first; EPC next because it sets the
# postcode scope the national files are filtered by; then owners and leases.
PIPELINE = [inspire, os_uprn, epc, leases, ccod, ocod, voa, price_paid]
# Corroborating-only sources that may not be available yet. Missing is a
# warning, not a stop — the build runs without them.
OPTIONAL = {voa, price_paid}


def report(la_code: str, status: str, **fields) -> None:
    """Record progress on the area_imports row the app watches. Best effort:
    a failure to report must never fail the build itself."""
    try:
        from .la_bbox import official

        sets = ["status = %(status)s"]
        if status == "running":
            sets.append("started_at = now(), finished_at = null, message = null")
        if status in ("done", "failed"):
            sets.append("finished_at = now()")
        for k in ("candidates", "targets", "message"):
            if k in fields:
                sets.append(f"{k} = %({k})s")
        params = {"code": la_code, "status": status, **fields}
        with connect() as conn, conn.cursor() as cur:
            cur.execute("select 1 from area_imports where la_code = %(code)s", params)
            if not cur.fetchone():
                got = official(la_code)
                cur.execute("insert into area_imports (la_code, la_name) values (%s, %s)", (la_code, got[0] if got else la_code))
            cur.execute(f"update area_imports set {', '.join(sets)} where la_code = %(code)s", params)
            conn.commit()
    except Exception as e:
        print(f"  (could not report status: {e})")


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
                ready = ready and mod in OPTIONAL
            except FileNotFoundError as e:
                print(f"  MISSING  {mod.DATASET}{'  (optional)' if mod in OPTIONAL else ''}")
                print(f"           {str(e).splitlines()[1].strip()}")
                ready = ready and mod in OPTIONAL
        print("\nAll sources ready." if ready else "\nNot ready — see above.")
        return 0 if ready else 1

    print(f"Building freehold_candidates for {args.la}\n")
    report(args.la, "running")
    try:
        code = _build(args)
    except Exception as e:
        report(args.la, "failed", message=f"{type(e).__name__}: {str(e)[:300]}")
        raise
    if code != 0:
        report(args.la, "failed", message="stopped — see the workflow log")
    return code


def _build(args) -> int:

    # 1. Download everything first, with no database connection open. A cold
    #    INSPIRE pull takes 10-20 minutes, and the Supabase pooler closes an
    #    idle connection long before that — which is exactly how West
    #    Berkshire's first build died ("server closed the connection").
    paths: dict = {}
    for mod in PIPELINE:
        try:
            paths[mod] = mod.fetch(args.la, args.dest)
        except (LicenceNotAccepted, FileNotFoundError) as e:
            if mod in OPTIONAL:
                print(f"  skipped           {mod.DATASET} — {str(e).splitlines()[0]}")
                continue
            print(f"STOPPED — {e}")
            return 1

    # 2. Then connect, and keep the connection busy until the build is done.
    with connect() as conn:
        for mod in PIPELINE:
            if mod not in paths:
                continue
            n = mod.load(paths[mod], conn, args.la)
            print(f"  loaded {n:>9,}  {mod.DATASET}")
            if mod is epc:
                with conn.cursor() as cur:
                    cur.execute("select distinct split_part(upper(postcode), ' ', 1) from stg_epc where postcode like '% %'")
                    context.OUTCODES = {r[0] for r in cur.fetchall()}
                print(f"  scope: {len(context.OUTCODES)} postcode districts — {', '.join(sorted(context.OUTCODES))}")

        print("\n  deriving candidates…")
        made = build_candidates(conn, args.la)
        print(f"  {made:,} freehold candidates written")
        with conn.cursor() as cur:
            cur.execute("""select count(*) from freehold_candidates where la_code = %s and address_count between 2 and 20
                           and lease_count = 0 and epc_uprn_count > 2 and owner_type in ('private','company','overseas')""", (args.la,))
            targets = cur.fetchone()[0]
        print(f"  {targets:,} on the default approach list")
    report(args.la, "done", candidates=made, targets=targets)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
