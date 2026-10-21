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


PDG = "https://www.planning.data.gov.uk/entity.json"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"


def official(la_code: str) -> tuple[str, str] | None:
    """(name, boundary WKT) for any council in England and Wales, from the
    planning.data.gov.uk local-authority-district dataset. The name is also
    the one the EPC API's council[] filter accepts — verified for awkward
    cases such as "Bristol, City of" and "Kingston upon Hull, City of"."""
    import httpx

    r = httpx.get(PDG, params={"dataset": "local-authority-district", "reference": la_code},
                  headers={"User-Agent": UA}, timeout=60, follow_redirects=True)
    if r.status_code != 200:
        return None
    ents = r.json().get("entities") or []
    if not ents or not ents[0].get("geometry"):
        return None
    return ents[0]["name"], ents[0]["geometry"]


def bbox_for(la_code: str) -> tuple[float, float, float, float]:
    """The table above for release-1 councils; any other council's box comes
    from its official boundary, so an on-demand import works anywhere."""
    if la_code in LA_BBOX:
        return LA_BBOX[la_code]
    got = official(la_code)
    if not got:
        raise RuntimeError(f"No boundary for {la_code} on planning.data.gov.uk — is it a valid ONS district code?")
    import re

    pts = [(float(x), float(y)) for x, y in re.findall(r"(-?\d+\.\d+)\s+(-?\d+\.\d+)", got[1])]
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    return min(xs), min(ys), max(xs), max(ys)
