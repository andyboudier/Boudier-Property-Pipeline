"""HMLR "Use land and property data" API client.

Covers CCOD, OCOD and Registered Leases — the three datasets the API serves
that this pipeline uses. INSPIRE is NOT on this API (``/datasets/inspire``
returns "not found" and it is absent from the dataset list); it stays a manual
download from the website.

Two things verified against the live API and worth knowing:

* **Cloudflare blocks non-browser clients.** A request without a browser
  user-agent returns HTTP 403 with Cloudflare error 1010,
  "browser_signature_banned" — before the API key is ever checked. It looks
  exactly like an authentication failure and is not one.
* **Access is per dataset.** A valid key still returns
  "You do not have access to this dataset" for anything you have not been
  granted, and "You have not yet signed the licence" for one awaiting signature.

Flow: GET /datasets/{name} lists resources, then
GET /datasets/{name}/{file_name} returns a short-lived signed S3 URL.
"""

import os
from pathlib import Path

import httpx

BASE = "https://use-land-property-data.service.gov.uk/api/v1/datasets"

# Required — see the Cloudflare note above.
BROWSER_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)


class HmlrError(RuntimeError):
    pass


def _key() -> str:
    key = os.environ.get("HMLR_API_KEY")
    if not key:
        raise HmlrError(
            "HMLR_API_KEY is not set.\n"
            "  Sign in at https://use-land-property-data.service.gov.uk and copy your API key."
        )
    return key


def _headers() -> dict:
    return {"Accept": "application/json", "Authorization": _key(), "User-Agent": BROWSER_UA}


def _get(path: str) -> dict:
    with httpx.Client(timeout=60.0, follow_redirects=True) as c:
        r = c.get(f"{BASE}{path}", headers=_headers())
    if r.status_code == 403 and "cloudflare" in r.text.lower():
        raise HmlrError(
            "Blocked by Cloudflare (error 1010), not by your API key — the request "
            "needs a browser user-agent. This client sends one; something stripped it."
        )
    try:
        body = r.json()
    except Exception:
        raise HmlrError(f"HMLR returned non-JSON ({r.status_code}) for {path}") from None
    if not body.get("success", r.status_code == 200):
        raise HmlrError(f"{path}: {body.get('error') or r.status_code}")
    return body.get("result") or body


def latest_file(dataset: str, full: bool = True) -> str:
    """Newest 'Full File' (or 'Change Only File') name for a dataset."""
    want = "Full File" if full else "Change Only File"
    resources = _get(f"/{dataset}").get("resources") or []
    for r in resources:
        if r.get("name") == want:
            return r["file_name"]
    raise HmlrError(f"{dataset}: no '{want}' listed (saw {[r.get('name') for r in resources]})")


def download(dataset: str, file_name: str, dest: Path) -> str:
    """Resolve the signed URL and stream the file to disk, skipping if cached."""
    dest.mkdir(parents=True, exist_ok=True)
    target = dest / file_name
    if target.exists() and target.stat().st_size > 1000:
        return str(target)

    url = _get(f"/{dataset}/{file_name}").get("download_url")
    if not url:
        raise HmlrError(f"{dataset}/{file_name}: no download_url returned")

    # The signed S3 URL carries its own auth — do not send the API key to it.
    with httpx.stream("GET", url, timeout=300.0, follow_redirects=True) as r:
        r.raise_for_status()
        total = int(r.headers.get("content-length") or 0)
        done = 0
        with open(target, "wb") as fh:
            for chunk in r.iter_bytes(1 << 20):
                fh.write(chunk)
                done += len(chunk)
                if total:
                    print(f"\r  {dataset} {done / 1e6:,.0f}/{total / 1e6:,.0f} MB", end="", flush=True)
        if total:
            print()
    return str(target)
