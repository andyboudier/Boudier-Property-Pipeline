"""Postgres/PostGIS connection and bulk loading.

Uses COPY rather than INSERT: OS Open UPRN alone is ~40 million rows, and
row-by-row inserts would take hours.
"""

import os
from contextlib import contextmanager
from typing import Iterable, Iterator, Sequence

import psycopg


def dsn() -> str:
    """Supabase → Project Settings → Database → Connection string (URI)."""
    url = os.environ.get("SUPABASE_DB_URL")
    if not url:
        raise RuntimeError(
            "SUPABASE_DB_URL is not set.\n"
            "  Supabase → Project Settings → Database → Connection string → URI.\n"
            "  Use the pooled connection on port 6543 for bulk loads."
        )
    return url


@contextmanager
def connect() -> Iterator[psycopg.Connection]:
    with psycopg.connect(dsn()) as conn:
        yield conn


def copy_rows(conn: psycopg.Connection, table: str, columns: Sequence[str], rows: Iterable[Sequence]) -> int:
    """Bulk-load rows into a staging table. Returns the number written.

    Does NOT commit — the caller owns the transaction. Geometry columns are
    written as EWKT ("SRID=4326;POINT(...)"), which PostGIS parses on input, so
    no temp table or st_geomfromtext round-trip is needed. That also keeps the
    whole load inside one transaction, which the Supabase transaction pooler
    requires: a temp table created in one transaction is gone in the next.
    """
    n = 0
    cols = ", ".join(columns)
    with conn.cursor() as cur:
        with cur.copy(f"copy {table} ({cols}) from stdin") as copy:
            for row in rows:
                copy.write_row(row)
                n += 1
    return n


def truncate(conn: psycopg.Connection, table: str) -> None:
    """Staging tables are rebuilt per run, not appended to. Does not commit."""
    with conn.cursor() as cur:
        cur.execute(f"truncate {table}")


def build_candidates(conn: psycopg.Connection, la_code: str) -> int:
    """Run the SQL derivation (plan §4) for one local authority."""
    with conn.cursor() as cur:
        cur.execute("select build_freehold_candidates(%s)", (la_code,))
        row = cur.fetchone()
    conn.commit()
    return int(row[0]) if row else 0
