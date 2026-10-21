"""Shared HTTP retry for every source.

Public APIs fail in two ways, and both are transient: a status code (429
rate limiting, 5xx) and a transport error (read timeout, dropped
connection). Slough's first build died on an EPC read timeout because the
EPC client retried the first kind but not the second. Every source now
goes through here instead of rolling its own.
"""

import time

import httpx

RETRY_STATUS = {429, 500, 502, 503, 504}


def get(client: httpx.Client, url: str, *, attempts: int = 6, **kw) -> httpx.Response:
    """GET with backoff on transient failures. Returns the final response —
    a non-retryable status (404, 403…) comes back for the caller to judge."""
    last: Exception | None = None
    for attempt in range(attempts):
        try:
            r = client.get(url, **kw)
        except (httpx.TimeoutException, httpx.TransportError) as e:
            last = e
            time.sleep(min(60, 3 * (attempt + 1)))
            continue
        if r.status_code in RETRY_STATUS and attempt < attempts - 1:
            time.sleep(min(60, 5 * (attempt + 1)))
            continue
        return r
    raise RuntimeError(f"GET {url.split('?')[0]} failed after {attempts} attempts: {last}")


def download(url: str, target, *, attempts: int = 4, headers: dict | None = None, progress: str = "") -> None:
    """Stream a large file to disk, restarting it on a transient failure.
    Writes to a .part file so an interrupted download never looks complete."""
    from pathlib import Path

    target = Path(target)
    part = target.with_name(target.name + ".part")
    last: Exception | None = None
    for attempt in range(attempts):
        try:
            with httpx.stream("GET", url, headers=headers or {}, timeout=300.0, follow_redirects=True) as r:
                r.raise_for_status()
                total = int(r.headers.get("content-length") or 0)
                done = 0
                with open(part, "wb") as fh:
                    for chunk in r.iter_bytes(1 << 20):
                        fh.write(chunk)
                        done += len(chunk)
                        if total and progress:
                            print(f"\r  {progress} {done / 1e6:,.0f}/{total / 1e6:,.0f} MB", end="", flush=True)
                if progress and total:
                    print()
            part.replace(target)
            return
        except (httpx.TimeoutException, httpx.TransportError, httpx.HTTPStatusError) as e:
            last = e
            print(f"\n  {progress or 'download'}: attempt {attempt + 1} failed ({type(e).__name__}), retrying")
            time.sleep(10 * (attempt + 1))
    raise RuntimeError(f"download of {url.split('?')[0]} failed after {attempts} attempts: {last}")
