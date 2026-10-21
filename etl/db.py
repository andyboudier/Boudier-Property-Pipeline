"""Postgres/PostGIS connection and bulk loading.

Uses COPY rather than INSERT: OS Open UPRN alone is ~40 million rows, and
row-by-row inserts would take hours.
"""

import os
import re
from contextlib import contextmanager
from typing import Iterable, Iterator, Sequence

import psycopg


def dsn() -> str:
    """Supabase → Project Settings → Database → Connection string (URI).

    The ETL always uses the SESSION pooler (port 5432), whatever port the URL
    names. On the transaction pooler (6543) Slough's derivation — a 44-second
    statement — completed on the server, but the result never reached the
    client, which then waited forever on an open socket. The session pooler is
    built for long statements and multi-statement transactions; the app's
    short queries don't touch this code, so they can stay on 6543.
    """
    url = os.environ.get("SUPABASE_DB_URL")
    if not url:
        raise RuntimeError(
            "SUPABASE_DB_URL is not set.\n"
            "  Supabase → Project Settings → Database → Connection string → URI."
        )
    return re.sub(r"(\.pooler\.supabase\.com):6543/", r"\1:5432/", url)


@contextmanager
def connect() -> Iterator[psycopg.Connection]:
    # TCP keepalives: if the connection dies mid-build, find out within about
    # a minute instead of waiting on a dead socket indefinitely.
    with psycopg.connect(dsn(), connect_timeout=30, keepalives=1, keepalives_idle=30,
                         keepalives_interval=10, keepalives_count=5) as conn:
        # The role's default (2 min on the pooler) is for app queries; a
        # council-wide derivation or enrichment can legitimately run longer.
        conn.execute("set statement_timeout = 0")
        conn.commit()
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
    """Run the SQL derivation (plan §4) for one local authority.

    First resolves UPRN-less leases by address (migration 0008), then clears
    this authority's previous candidates so a polygon that no longer qualifies
    — or was mis-tagged by an earlier bounding-box pull — does not linger. Rows
    already promoted to the Title Split pipeline are kept, so their links hold.
    """
    with conn.cursor() as cur:
        cur.execute("select resolve_lease_uprns()")
        resolved = cur.fetchone()[0]
        print(f"  resolved {resolved:,} UPRN-less leases by address")
        cur.execute("delete from freehold_candidates where la_code = %s and pipeline_property_id is null", (la_code,))
        cur.execute("select build_freehold_candidates(%s)", (la_code,))
        row = cur.fetchone()
        # Owner by address, EPC bands and last sale (migrations 0010-0011),
        # from the persistent tables.
        cur.execute("select save_ccod_titles()")
        cur.execute("select enrich_freehold_candidates(%s)", (la_code,))
    conn.commit()
    return int(row[0]) if row else 0
