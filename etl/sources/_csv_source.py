"""Shared loader for the sources that arrive as bulk CSV.

These all sit behind a signed-in download, so the ETL ingests a file you have
already downloaded under your own account rather than fetching it itself.
"""

import csv
import re
import io
import zipfile
from pathlib import Path
from typing import Callable, Iterator, Sequence


def find_file(dest: str, folder: str, dataset: str, source_url: str) -> str:
    """Locate the downloaded file for a source."""
    d = Path(dest) / folder
    files = sorted([p for p in d.glob("*") if p.suffix.lower() in (".csv", ".zip")]) if d.exists() else []
    if not files:
        raise FileNotFoundError(
            f"{dataset}: nothing to load from {d}.\n"
            f"  Download it from {source_url} under your own account and save it there.\n"
            f"  The download needs a signed-in session, so it cannot be automated."
        )
    return str(files[0])


def read_rows(path: str) -> Iterator[dict]:
    """Stream a CSV, or every CSV inside a zip."""
    if path.lower().endswith(".zip"):
        with zipfile.ZipFile(path) as zf:
            for name in zf.namelist():
                if name.lower().endswith(".csv"):
                    with zf.open(name) as fh:
                        yield from csv.DictReader(io.TextIOWrapper(fh, "utf-8-sig", errors="replace"))
    else:
        with open(path, newline="", encoding="utf-8-sig", errors="replace") as fh:
            yield from csv.DictReader(fh)


def get(rec: dict, *names: str) -> str | None:
    """Column names drift between releases (LMK_KEY, lmk-key, "Lmk Key") —
    compare on a normalised form so any spelling matches."""
    norm = lambda k: re.sub(r"[^a-z0-9]", "", k.lower())
    index = {norm(k): v for k, v in rec.items() if k}
    for n in names:
        v = index.get(norm(n))
        if v not in (None, ""):
            return str(v).strip()
    return None


def load_csv(
    path: str,
    conn,
    table: str,
    columns: Sequence[str],
    row_fn: Callable[[dict], Sequence | None],
    truncate_first: bool = True,
) -> int:
    """Truncate the staging table and COPY the mapped rows in.

    OCOD sets truncate_first=False: it shares stg_ccod with CCOD and appends.
    """
    from ..db import copy_rows, truncate

    if truncate_first:
        truncate(conn, table)

    def rows():
        for rec in read_rows(path):
            out = row_fn(rec)
            if out is not None:
                yield out

    n = copy_rows(conn, table, columns, rows())
    conn.commit()
    return n
