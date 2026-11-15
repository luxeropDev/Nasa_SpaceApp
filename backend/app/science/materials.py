"""Material / fuel name canonicalization (keyword table, deterministic).

Returns a canonical name and a fuel class. Unknown descriptions return canonical=None (never guessed).
Implausible chemical formulas (e.g. 'CH5', 'N3' in a fuel-bottle column, typical of spreadsheet autofill) are flagged.
"""
from __future__ import annotations

import re

# (pattern, canonical name, fuel class) — first match wins
TABLE: list[tuple[str, str, str]] = [
    (r"\bpmma\b|acrylic|plexiglas", "PMMA", "solid"),
    (r"sibal|cotton[- ]fiberglass", "SIBAL (cotton-fiberglass fabric)", "solid"),
    (r"silicone", "Silicone", "solid"),
    (r"nomex", "Nomex", "solid"),
    (r"kapton", "Kapton", "solid"),
    (r"teflon|ptfe", "Teflon (PTFE)", "solid"),
    (r"pyrell", "Pyrell (polyurethane foam)", "solid"),
    (r"lampwick", "Lampwick (cotton)", "solid"),
    (r"wax|paraffin|candle", "Paraffin / candle wax", "solid"),
    (r"ultem", "Ultem (PEI)", "solid"),
    (r"dibutyl phthalate|\bdbp\b", "Dibutyl phthalate", "liquid"),
    (r"delrin|polyoxymethylene", "Delrin (POM)", "solid"),
    (r"arizona (road|red) dust|\bard\b", "Arizona road dust (test aerosol)", "aerosol"),
    (r"\bdme\b|dimethyl ether", "Dimethyl ether", "gas"),
    (r"\bc2h4\b|ethylene", "Ethylene", "gas"),
    (r"propylene|\bc3h6\b", "Propylene", "gas"),
    (r"propane|\bc3h8\b", "Propane", "gas"),
    (r"butane|\bc4h10\b", "n-Butane", "gas"),
    (r"\bc2h6\b|\bethane\b", "Ethane", "gas"),
    (r"\bch4\b|methane", "Methane", "gas"),
    (r"\bh2\b|hydrogen", "Hydrogen", "gas"),
    (r"methanol", "Methanol", "liquid"),
    (r"ethanol", "Ethanol", "liquid"),
    (r"propanol", "Propanol (mixture)", "liquid"),
    (r"isooctane|iso-octane", "Isooctane", "liquid"),
    (r"n-octane|\boctane\b", "n-Octane", "liquid"),
    (r"heptane", "n-Heptane", "liquid"),
    (r"nonane", "n-Nonane", "liquid"),
    (r"decane", "n-Decane", "liquid"),
    (r"dodecane|\bc12h26\b", "n-Dodecane", "liquid"),
    (r"hexanol", "Hexanol", "liquid"),
]
KNOWN_FORMULAS = {"CH4", "C2H4", "C2H6", "C3H8", "C3H6", "H2", "N2", "He", "O2", "CO2", "C12H26", "O3", "SF6", "Ar"}
_formula = re.compile(r"\b(CH\d+|C2H\d+|N\d+)\b")


def canonical(text: str | None) -> dict:
    s = (text or "").strip()
    out = {"raw": s, "canonical": None, "fuel_class": None, "mixture": False, "flags": []}
    if not s:
        return out
    hits = []
    for pat, name, cls in TABLE:
        if re.search(pat, s, re.I) and name not in [h[0] for h in hits]:
            hits.append((name, cls))
    bad = [f for f in _formula.findall(s) if f not in KNOWN_FORMULAS]
    if bad:
        out["flags"].append({"code": "implausible_formula", "detail": f"formula(s) {', '.join(bad)} not a known species; suspected spreadsheet autofill artifact"})
    if hits:
        pct = [float(x) for x in re.findall(r"(\d+(?:\.\d+)?)\s*%", s)]
        diluted = any(v < 100 for v in pct) or bool(re.search(r"mixture|balance|\bwith\s+[A-Z]|\[\.\d+\]", s, re.I))
        out["components"] = [h[0] for h in hits]
        out["mixture"] = len(hits) > 1 or diluted
        classes = {h[1] for h in hits}
        # a multi-component blend has no single canonical material (never chosen by table order)
        out["canonical"] = hits[0][0] if len(hits) == 1 else None
        out["fuel_class"] = classes.pop() if len(classes) == 1 else None
    return out


def extract_geometry(text: str | None) -> list[dict]:
    """Specimen thickness/width stated inside a material description, e.g. '100 micron PMMA film 2 cm wide'.
    Only explicit patterns are read: '<n> micron' (thickness of a film) and '<n> <unit> wide' (width)."""
    s = text or ""
    out = []
    m = re.search(r"(\d+(?:\.\d+)?)\s*(micron|microns|µm|um)\b", s, re.I)
    if m:
        out.append({"parameter": "specimen_thickness", "value": float(m.group(1)), "unit": "micron", "match": m.group(0)})
    m = re.search(r"(\d+(?:\.\d+)?)\s*(mm|cm)\s+wide\b", s, re.I)
    if m:
        out.append({"parameter": "specimen_width", "value": float(m.group(1)), "unit": m.group(2).lower(), "match": m.group(0)})
    return out
