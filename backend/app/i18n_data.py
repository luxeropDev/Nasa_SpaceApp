"""Localization overlay for knowledge-base records and sources (Russian).

Structural codes (fuel_type, fire_safety_domain, relevance keys, ids, URLs) are never translated;
the frontend maps codes to labels. English is the canonical source data.
"""
import json
from pathlib import Path

from .models import Investigation, Source

DATA = Path(__file__).resolve().parent.parent / "data"
_REC: dict = {}
for _f in sorted(DATA.glob("i18n_ru_records_*.json")):
    _REC.update(json.loads(_f.read_text(encoding="utf-8")))
_MISC = json.loads((DATA / "i18n_ru_misc.json").read_text(encoding="utf-8"))

NUMERIC_STATUS_RU = "Числовые результаты не включены; см. связанные источники NASA."


def localize_inv(inv: Investigation, lang: str) -> Investigation:
    if lang != "ru":
        return inv
    r = _REC.get(inv.id)
    if r is None:
        raise KeyError(f"Missing Russian translation for {inv.id}")
    d = inv.model_dump()
    d["full_name"] = r["full_name"]
    d["objective"] = r["objective"]
    d["fuel_material"] = r["fuel_material"]
    d["known_conditions"] = r["known_conditions"] if inv.known_conditions else []
    d["limitations"] = r["limitations"]
    d["relevance_note"] = r["relevance_note"]
    d["findings"] = [{"text": t, "source_id": f.source_id} for t, f in zip(r["findings"], inv.findings)]
    d["hardware"] = _MISC["hardware"][inv.hardware]
    d["gravity_environment"] = _MISC["gravity"][inv.gravity_environment]
    d["research_domain"] = _MISC["research_domain"][inv.research_domain]
    d["measurement_types"] = [_MISC["measure"][m] for m in inv.measurement_types]
    d["numeric_data_status"] = NUMERIC_STATUS_RU
    return Investigation(**d)


def localize_source(s: Source, lang: str) -> Source:
    if lang != "ru":
        return s
    t = _MISC["sources"][s.id]
    return Source(id=s.id, title=t["title"], publisher=s.publisher, type=t["type"], url=s.url, note=t["note"])


def localize_domain(name: str, lang: str) -> str:
    return _MISC["research_domain"][name] if lang == "ru" else name


def verify(investigations, sources) -> None:
    """Fail fast at import time if the RU overlay is incomplete or misaligned."""
    for i in investigations:
        r = _REC[i.id]
        assert len(r["findings"]) == len(i.findings), i.id
        assert len(r["limitations"]) == len(i.limitations), i.id
        assert len(r["known_conditions"]) == len(i.known_conditions), i.id
        localize_inv(i, "ru")
    for s in sources:
        localize_source(s, "ru")


_CACHE: dict = {}


def invs(lang: str):
    """Localized investigations list + id map, cached per language."""
    from .data_loader import INVESTIGATIONS
    if lang not in _CACHE:
        lst = [localize_inv(i, lang) for i in INVESTIGATIONS]
        _CACHE[lang] = (lst, {i.id: i for i in lst})
    return _CACHE[lang]


def srcs(lang: str):
    from .data_loader import SOURCES
    key = "s_" + lang
    if key not in _CACHE:
        lst = [localize_source(s, lang) for s in SOURCES]
        _CACHE[key] = (lst, {s.id: s for s in lst})
    return _CACHE[key]
