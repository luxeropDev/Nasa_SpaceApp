"""Russian query support: map Russian word stems to English index terms (BM25 index stays English)."""
import re

# prefix (stem) -> English terms appended to the normalized query
RU_STEMS = {
    "дым": ["smoke", "aerosol"], "аэрозол": ["aerosol"], "обнаруж": ["smoke", "detection"], "датчик": ["smoke", "aerosol"],
    "подавлен": ["suppression", "extinction"], "туше": ["extinguishment", "extinction"], "тушен": ["extinguishment", "extinction"],
    "погасан": ["extinction"], "лунн": ["lunar_habitat", "lunar_rover"], "луна": ["lunar_habitat"], "луны": ["lunar_habitat"],
    "марс": ["mars_transit"], "ровер": ["lunar_rover"], "мкс": ["iss"], "станци": ["iss"],
    "горюч": ["flammability"], "воспламен": ["flammability"], "пламен": ["flame"], "пламя": ["flame"], "горен": ["combustion"],
    "твёрд": ["solid"], "тверд": ["solid"], "материал": ["solid", "flammability"], "жидк": ["liquid", "droplet"], "капл": ["droplet", "liquid"],
    "газ": ["gas", "gaseous"], "холодн": ["cool", "flame"], "сажа": ["soot"], "саж": ["soot"], "кислород": ["oxygen"],
    "пожар": ["flammability", "combustion"], "ограничен": ["limitation"], "пробел": ["limitation"],
    "микрогравит": ["microgravity"], "невесом": ["microgravity"], "электрическ": ["electric"],
    "перчаточ": ["glovebox"], "насос": [],
}


def ru_terms(query: str) -> list[str]:
    out: list[str] = []
    for w in re.findall(r"[а-яё]+", query.lower()):
        for stem, terms in RU_STEMS.items():
            if w.startswith(stem):
                out += terms
    return out


def is_limit_ru(query: str) -> bool:
    q = query.lower()
    return any(k in q for k in ("огранич", "пробел", "неизвестн", "недостающ"))


def ru_scenario(query: str) -> str | None:
    q = query.lower()
    if "лунн" in q or "луна" in q or "луны" in q or "луне" in q: return "lunar_habitat"
    if "марс" in q: return "mars_transit"
    if "ровер" in q: return "lunar_rover"
    if "мкс" in q or "станци" in q: return "iss"
    return None


def ru_families(query: str) -> list[str]:
    q = query.lower()
    out = []
    for fam in ("bass", "saffire", "flex", "same", "acme", "cfi", "spice", "slice"):
        if fam in q: out.append(fam)
    if "саффайр" in q or "сэффайр" in q: out.append("saffire")
    return out
