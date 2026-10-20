"""Bounding boxes for the release-1 local authorities (plan §7).

OS Open UPRN is a 619 MB GB-wide CSV. Streaming it through a bounding box
filter keeps the staging table to the authority being built instead of loading
40 million points to use a few thousand.

Boxes are deliberately generous — the authoritative clip is the INSPIRE
polygon spatial join, not this.
"""

# (west, south, east, north) in WGS84.
LA_BBOX: dict[str, tuple[float, float, float, float]] = {
    "E06000038": (-1.09, 51.40, -0.90, 51.49),  # Reading
    "E06000037": (-1.62, 51.30, -1.03, 51.60),  # West Berkshire
    "E06000041": (-0.97, 51.32, -0.74, 51.47),  # Wokingham
    "E06000036": (-0.84, 51.33, -0.64, 51.46),  # Bracknell Forest
    "E06000040": (-0.84, 51.40, -0.53, 51.56),  # Windsor & Maidenhead
    "E06000039": (-0.66, 51.47, -0.48, 51.55),  # Slough
}


def bbox_for(la_code: str) -> tuple[float, float, float, float]:
    try:
        return LA_BBOX[la_code]
    except KeyError:
        raise RuntimeError(
            f"No bounding box for {la_code}. Add one to etl/la_bbox.py, or the "
            f"OS Open UPRN load would have to ingest all of Great Britain."
        ) from None
