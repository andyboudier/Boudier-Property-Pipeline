"""Shared loader for the sources that arrive as bulk CSV.

These all sit behind a signed-in download, so the ETL ingests a file you have
already downloaded under your own account rather than fetching it itself.
"""

import csv
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
                        yield from csv.DictReader(io.TextIOWrapper(fh, "utf-8", errors="replace"))
    else:
        with open(path, newline="", encoding="utf-8", errors="replace") as fh:
            yield from csv.DictReader(fh)


def get(rec: dict, *names: str) -> str | None:
    """Column names drift between releases — try several spellings."""
    for n in names:
        for key in (n, n.upper(), n.lower(), n.replace("_", "-"), n.replace("-", "_")):
            if key in rec and rec[key] not in (None, ""):
                return str(rec[key]).strip()
    return None


def load_csv(
    path: str,
    conn,
    table: str,
    columns: Sequence[str],
    row_fn: Callable[[dict], Sequence | None],
) -> int:
    """Truncate the staging table and COPY the mapped rows in."""
    from ..db import copy_rows, truncate

    truncate(conn, table)

    def rows():
        for rec in read_rows(path):
            out = row_fn(rec)
            if out is not None:
                yield out

    return copy_rows(conn, table, columns, rows())
