"""planning.data.gov.uk — council and constraint data.

    The one source here with no key, no account and no licence gate: MHCLG
    Planning Data under the Open Government Licence. This is also what the
    GoPlanner appraisal app is built on, so the two share a data source
    without sharing credentials — there are none to share.

    Mirrors src/lib/planningData.ts in the app. Keep the two in step.
"""

from datetime import datetime, timezone

import httpx

BASE = "https://www.planning.data.gov.uk"
SOURCE = "planning.data.gov.uk (MHCLG, OGL)"

CONSTRAINT_DATASETS = [
    "conservation-area",
    "article-4-direction-area",
    "listed-building",
    "listed-building-outline",
    "flood-risk-zone",
    "tree-preservation-zone",
    "brownfield-land",
    "green-belt",
    "local-planning-authority",
]


def constraints_at(lat: float, lng: float, datasets=None, timeout: float = 20.0) -> dict:
    """Constraints intersecting a point.

    An empty list means "not identified", NOT "none" — coverage varies by local
    authority. `partial` is True when a dataset query failed, so a caller can
    tell an incomplete answer from a clean one.
    """
    datasets = datasets or CONSTRAINT_DATASETS
    by_dataset: dict[str, list[dict]] = {}
    checked: list[str] = []
    partial = False

    with httpx.Client(timeout=timeout) as client:
        for dataset in datasets:
            try:
                r = client.get(
                    f"{BASE}/entity.json",
                    params={
                        "longitude": lng,
                        "latitude": lat,
                        "geometry_relation": "intersects",
                        "dataset": dataset,
                        "limit": 50,
                    },
                )
                if r.status_code != 200:
                    partial = True
                    continue
                checked.append(dataset)
                entities = r.json().get("entities", [])
                if entities:
                    by_dataset[dataset] = entities
            except httpx.HTTPError:
                partial = True

    return {
        "by_dataset": by_dataset,
        "checked": sorted(checked),
        "partial": partial,
        "source": SOURCE,
        "read_at": datetime.now(timezone.utc).isoformat(),
    }
