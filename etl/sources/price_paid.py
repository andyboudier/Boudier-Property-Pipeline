"""HMLR Price Paid — every residential sale in the district since 1995.

    Fills last_sale_date / last_sale_price on each candidate (see
    enrich_freehold_candidates in migration 0010).

    Fetched from the PPD report service, one district per request:

      https://landregistry.data.gov.uk/app/ppd/ppd_data.csv?header=true&district=READING&limit=all

    Reading is ~95,000 sales, 24 MB, about 45 seconds. No key. Price Paid has
    no UPRN, so sales are matched to buildings by postcode and address in SQL,
    not here.

    Rows go into ppd_sales, which persists across councils (keyed by the PPD
    transaction id), not into a truncated stg_ table.

    Licence: OGL v3 — https://www.gov.uk/government/statistical-data-sets/price-paid-data-downloads
"""

import csv
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

from ._gate import require_licence

DATASET = "HMLR Price Paid"
LICENCE_ENV = "HMLR_LICENCE_ACCEPTED"
SOURCE_URL = "https://www.gov.uk/government/statistical-data-sets/price-paid-data-downloads"
TABLE = "ppd_sales"
COLUMNS = ["id", "la_code", "postcode", "paon", "saon", "street", "price", "sale_date", "property_type", "tenure", "category"]

PPD = "https://landregistry.data.gov.uk/app/ppd/ppd_data.csv"
MAX_AGE_DAYS = int(os.environ.get("PPD_MAX_AGE_DAYS", "30"))  # PPD updates monthly


def _district(la_code: str) -> str:
    """PPD's district is the council's name in capitals ("WINDSOR AND MAIDENHEAD")."""
    from ..la_bbox import official

    got = official(la_code)
    if not got:
        raise RuntimeError(f"No council name for {la_code} on planning.data.gov.uk")
    return got[0].upper()


def fetch(la_code: str, dest: str) -> str:
    require_licence(LICENCE_ENV, DATASET, SOURCE_URL)
    from ..net import download

    folder = Path(dest) / "price_paid"
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / f"{la_code}.csv"
    if target.exists():
        age = datetime.now(timezone.utc) - datetime.fromtimestamp(target.stat().st_mtime, timezone.utc)
        if age < timedelta(days=MAX_AGE_DAYS):
            return str(target)
    district = _district(la_code)
    from urllib.parse import urlencode

    download(f"{PPD}?{urlencode({'header': 'true', 'district': district, 'limit': 'all'})}", target)
    with open(target, encoding="utf-8", errors="replace") as fh:
        n = sum(1 for _ in fh) - 1
    if n <= 0:
        target.unlink()
        raise RuntimeError(f"Price Paid returned no sales for district {district!r} — check the name PPD uses")
    print(f"  Price Paid {district}: {n:,} sales")
    return str(target)


def _row(rec: dict, la_code: str):
    uid = (rec.get("unique_id") or "").strip("{}")
    price = rec.get("price_paid") or ""
    if not uid or not price.isdigit():
        return None
    blank = lambda k: (rec.get(k) or "").strip() or None  # noqa: E731
    return (
        uid, la_code, blank("postcode"), blank("paon"), blank("saon"), blank("street"),
        int(price), (rec.get("deed_date") or "")[:10] or None,
        blank("property_type"), blank("estate_type"), blank("transaction_category"),
    )


def load(path: str, conn, la_code: str) -> int:
    from ..db import copy_rows

    def rows():
        seen = set()
        with open(path, newline="", encoding="utf-8", errors="replace") as fh:
            for rec in csv.DictReader(fh):
                row = _row(rec, la_code)
                if row and row[0] not in seen:
                    seen.add(row[0])
                    yield row

    with conn.cursor() as cur:
        cur.execute("delete from ppd_sales where la_code = %s", (la_code,))
    n = copy_rows(conn, TABLE, COLUMNS, rows())
    conn.commit()
    return n
