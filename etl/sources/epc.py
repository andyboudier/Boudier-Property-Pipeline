"""Energy Performance Certificates — domestic and non-domestic, via the API.

    Drives filter F6 (more than two EPCs on a title, as evidence the building
    is genuinely multi-unit), corroborates UPRNs, and supplies the postcode
    that links a polygon to its owner in CCOD/OCOD.

    Verified live against the service (docs: get-energy-performance-data
    .communities.gov.uk/api-technical-documentation, OAS saved to
    docs/epc-api-openapi.yml):

      base   https://api.get-energy-performance-data.communities.gov.uk
      auth   Authorization: Bearer <EPC_API_KEY>   (Basic and x-api-key are rejected)
      search GET /api/domestic/search  and  /api/non-domestic/search
             ?council[]=Reading&page_size=5000&current_page=N
             Reading: 92,020 domestic records over 19 pages; 5,350 non-domestic.

    Why the search API and not the full-load file: the domestic full load is
    8.3 GB for all of England and Wales, regenerated monthly, and we want one
    authority. Nineteen requests beat eight gigabytes.

    What the search summary does NOT carry is property type. The detail
    endpoint (/api/certificate) only returns it as a code, and calling it
    92,000 times is not on. So flat/house/bungalow is INFERRED from the address
    line ("Flat 2, ...", "Apartment 7") and the certificate's domestic or
    non-domestic origin. That is enough for F5's use-class buckets. The exact
    upgrade, if it is ever needed, is streaming the full-load CSV filtered on
    its local_authority column.

    Licence: OGL, accepted by Andy on registering for the API key.
"""

import json
import os
import re
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx

from ._gate import require_licence

DATASET = "EPC Open Data"
LICENCE_ENV = "EPC_LICENCE_ACCEPTED"
SOURCE_URL = "https://get-energy-performance-data.communities.gov.uk"
TABLE = "stg_epc"
COLUMNS = ["uprn", "postcode", "address", "property_type", "certificate_id"]

BASE = "https://api.get-energy-performance-data.communities.gov.uk"
PAGE_SIZE = 5000  # the API's maximum
MAX_AGE_DAYS = int(os.environ.get("EPC_MAX_AGE_DAYS", "30"))  # the data refreshes monthly
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"

# The council[] filter takes the name the EPC service uses. Only Reading has
# been verified against the live API; if another comes back empty, check the
# exact label on a record from that area (the `council` field) and fix it here.
EPC_COUNCIL = {
    "E06000038": "Reading",
    "E06000037": "West Berkshire",
    "E06000041": "Wokingham",
    "E06000036": "Bracknell Forest",
    "E06000040": "Windsor and Maidenhead",
    "E06000039": "Slough",
}

FLAT = re.compile(r"\b(flat|apartment|apartments|maisonette|penthouse|studio)\b", re.I)
BUNGALOW = re.compile(r"\bbungalow\b", re.I)


class EpcError(RuntimeError):
    pass


def _key() -> str:
    key = os.environ.get("EPC_API_KEY")
    if not key:
        raise EpcError(f"EPC_API_KEY is not set. Register at {SOURCE_URL} and copy the bearer token from My Account.")
    return key


def _page(client: httpx.Client, kind: str, council: str, page: int) -> dict:
    """One page of search results, with back-off on rate limiting."""
    url = f"{BASE}/api/{kind}/search"
    params = {"council[]": council, "page_size": PAGE_SIZE, "current_page": page}
    for attempt in range(5):
        r = client.get(url, params=params)
        if r.status_code == 429:
            time.sleep(5 * (attempt + 1))
            continue
        if r.status_code == 404:  # the API's way of saying "no records"
            return {"data": [], "pagination": {"totalPages": 0}}
        if r.status_code != 200:
            raise EpcError(f"{kind} search page {page}: HTTP {r.status_code} {r.text[:160]}")
        body = r.json()
        if isinstance(body.get("data"), dict) and "error" in body["data"]:
            raise EpcError(f"{kind} search page {page}: {body['data']['error']}")
        return body
    raise EpcError(f"{kind} search page {page}: rate limited five times, giving up")


def _fresh(path: Path) -> bool:
    if not path.exists():
        return False
    age = datetime.now(timezone.utc) - datetime.fromtimestamp(path.stat().st_mtime, timezone.utc)
    return age < timedelta(days=MAX_AGE_DAYS)


def fetch(la_code: str, dest: str) -> str:
    """Pull every domestic and non-domestic certificate for the council into a
    JSONL cache (one line per record, tagged with its kind). Reused until it is
    MAX_AGE_DAYS old, matching the service's monthly refresh."""
    require_licence(LICENCE_ENV, DATASET, SOURCE_URL)
    council = EPC_COUNCIL.get(la_code)
    if not council:
        # Any other council: its official name, which the EPC API accepts as-is.
        from ..la_bbox import official

        got = official(la_code)
        if not got:
            raise EpcError(f"No council name for {la_code} on planning.data.gov.uk")
        council = got[0]

    folder = Path(dest) / "epc"
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / f"{la_code}.jsonl"
    if _fresh(target):
        return str(target)

    headers = {"Authorization": f"Bearer {_key()}", "Accept": "application/json", "User-Agent": UA}
    tmp = target.with_suffix(".jsonl.part")
    written = 0
    with httpx.Client(headers=headers, timeout=90.0) as client, open(tmp, "w", encoding="utf-8") as out:
        for kind in ("domestic", "non-domestic"):
            page, pages = 1, None
            while pages is None or page <= pages:
                body = _page(client, kind, council, page)
                pages = int((body.get("pagination") or {}).get("totalPages") or 0)
                for rec in body.get("data") or []:
                    rec["_kind"] = kind
                    out.write(json.dumps(rec) + "\n")
                    written += 1
                print(f"\r  EPC {kind} {council}: page {page}/{pages or '?'} ({written:,} records)", end="", flush=True)
                page += 1
                time.sleep(0.25)  # be polite; nothing here is latency-sensitive
            print()
    tmp.replace(target)
    return str(target)


def _property_type(rec: dict) -> str:
    """Inferred — see the module docstring."""
    if rec.get("_kind") == "non-domestic":
        return "Non-domestic"
    address = " ".join(str(rec.get(k) or "") for k in ("addressLine1", "addressLine2", "addressLine3"))
    if FLAT.search(address):
        return "Flat"
    if BUNGALOW.search(address):
        return "Bungalow"
    return "House"


def _row(rec: dict):
    uprn = rec.get("uprn")
    if uprn in (None, "", 0):
        return None  # cannot be joined to a polygon without one
    address = ", ".join(str(rec[k]).strip() for k in ("addressLine1", "addressLine2", "addressLine3", "addressLine4") if rec.get(k))
    return (int(uprn), rec.get("postcode"), address, _property_type(rec), rec.get("certificateNumber"))


def load(path: str, conn, la_code: str) -> int:
    from ..db import copy_rows, truncate

    truncate(conn, TABLE)

    def rows():
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                row = _row(json.loads(line))
                if row is not None:
                    yield row

    n = copy_rows(conn, TABLE, COLUMNS, rows())
    conn.commit()
    return n
