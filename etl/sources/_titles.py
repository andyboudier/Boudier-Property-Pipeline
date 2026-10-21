"""House numbers in CCOD/OCOD property addresses.

A council or housing association title often covers many houses at once:

    134 and 136 Corwen Road, Tilehurst, Reading
    123, 125 and 129 to 153 (odd) Corwen Road, Tilehurst, Reading (RG30 4TH)
    2, 4, 9, 15 and 16 Ash Road, 2 to 16 (even) and 24 Corwen Road and ...
    1 to 12 (inclusive) and 14 to 17 (inclusive) Monmouth Court, Northfield Road

address_keys() expands those into one key per house — "134 corwen road",
"136 corwen road" — so a building matches its owner's title by house number
and street (migration 0014) rather than only when the title happens to spell
out that one address. Many such titles also have no postcode at all, so
in_scope_title() keeps a postcode-less title when it names one of the
council's post towns as an address component (", Reading").
"""

import re

from .. import context

NUM = r"\d+[A-Z]?"
# A run of house numbers: "2", "2A", "129 to 153 (odd)", "5-9", joined by
# commas, "and" or "&".
ITEM = rf"{NUM}(?:\s*(?:to|-)\s*{NUM})?(?:\s*\((?:odd|even|inclusive|both inclusive)\))?"
SEP = r"(?:\s*(?:,|\band\b|&|/)\s*)+"  # "42 and, 44" and "8/10" are lists
GROUP = re.compile(
    rf"(?<![\w/-])((?:{ITEM})(?:{SEP}(?:{ITEM}))*)\s+([A-Za-z][A-Za-z'.\- ]*?[A-Za-z])(?=\s*(?:,|\(|\band\b|$))",
    re.I,
)
RANGE = re.compile(rf"({NUM})\s*(to|-)\s*({NUM})(?:\s*\((odd|even|inclusive|both inclusive)\))?", re.I)
MAX_SPAN = 200  # "1 to 9999" is a typo, not an estate


def _norm(t: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", t.lower()).strip()


def _numbers(group: str) -> list[str]:
    out: list[str] = []
    for part in re.split(SEP, group, flags=re.I):
        part = part.strip()
        if not part:
            continue
        m = RANGE.fullmatch(part)
        if not m:
            out.append(re.sub(r"\s*\(.*\)$", "", part).lower())
            continue
        a, _, b, kind = m.groups()
        out += [a.lower(), b.lower()]  # "5-9" is also a building called 5-9
        ia, ib = int(re.match(r"\d+", a)[0]), int(re.match(r"\d+", b)[0])
        if ib <= ia or ib - ia > MAX_SPAN:
            continue
        kind = (kind or "").lower()
        step = 2 if kind in ("odd", "even") else 1
        out += [str(n) for n in range(ia, ib + 1, step)]
    return out


def address_keys(address: str | None) -> list[str]:
    """Every "number street" the title names, normalised, in order, distinct."""
    if not address:
        return []
    text = re.sub(r"\([A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}\)", "", address, flags=re.I)  # the "(RG30 4TH)"
    keys: list[str] = []
    for m in GROUP.finditer(text):
        street = _norm(m.group(2))
        if not street or street in ("and", "to") or len(street) < 3:
            continue
        for n in _numbers(m.group(1)):
            k = f"{n} {street}"
            if k not in keys:
                keys.append(k)
    return keys[:500]


def in_scope_title(postcode: str | None, address: str | None) -> bool:
    """A title in this council's postcode districts, or with no postcode but
    one of its post towns as an address component."""
    if postcode:
        return context.in_scope(postcode)
    if context.TOWNS is None:
        return True
    if not address:
        return False
    parts = {_norm(p) for p in re.split(r"[,(]", address)}
    return bool(parts & context.TOWNS)
