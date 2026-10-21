"""Re-enrich councils that are already built: owner by address, EPC bands,
last sale price.

    uv run --project etl python -m etl.enrich --la E06000038 E06000037 --dest etl/data

Reuses the cached EPC, CCOD and OCOD downloads, fetches Price Paid for the
district, and runs enrich_freehold_candidates (migrations 0010-0011). A full
rebuild does all of this itself; this is for not having to do one.
"""

import argparse
import re

from . import context
from .db import connect
from .sources import ccod, epc, ocod, price_paid


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--la", nargs="+", required=True)
    ap.add_argument("--dest", default="data")
    args = ap.parse_args()
    for la in args.la:
        if not re.fullmatch(r"[EW]\d{8}", la):
            raise SystemExit(f"{la}: not an ONS council code")

    for la in args.la:
        print(f"── {la}")
        epc_path = epc.fetch(la, args.dest)  # the cache, if it is fresh
        ccod_path, ocod_path = ccod.fetch(la, args.dest), ocod.fetch(la, args.dest)
        ppd_path = price_paid.fetch(la, args.dest)
        with connect() as conn:
            print(f"  epc_latest   {epc.load_latest(epc_path, conn, la):>9,}")
            with conn.cursor() as cur:
                cur.execute("select distinct split_part(upper(postcode), ' ', 1) from epc_latest where la_code = %s and postcode like '%% %%'", (la,))
                context.OUTCODES = {r[0] for r in cur.fetchall()}
            n = ccod.load(ccod_path, conn, la) + ocod.load(ocod_path, conn, la)
            with conn.cursor() as cur:
                cur.execute("select save_ccod_titles()")
            print(f"  ccod_titles  {n:>9,}")
            print(f"  ppd_sales    {price_paid.load(ppd_path, conn, la):>9,}")
            with conn.cursor() as cur:
                cur.execute("select enrich_freehold_candidates(%s)", (la,))
                cur.execute(
                    """select count(*), count(epc_band_typical), count(last_sale_price),
                              count(*) filter (where owner_type in ('company', 'overseas'))
                       from freehold_candidates where la_code = %s
                         and address_count between 2 and 20 and lease_count = 0 and epc_uprn_count > 2""",
                    (la,),
                )
                total, banded, sold, companies = cur.fetchone()
            conn.commit()
        print(f"  default list {total:,}: {banded:,} with an EPC band, {sold:,} with a last sale, {companies:,} company-owned")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
