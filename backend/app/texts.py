from typing import Literal

from .texts_en import EN
from .texts_ru import RU_A
from .texts_ru_gaps import RU_B

Lang = Literal["en", "ru"]
RU = {**RU_A, **RU_B}
TEXTS = {"en": EN, "ru": RU}


def T(lang: str, key: str, **kw) -> str:
    """Localized template lookup (falls back to English)."""
    s = TEXTS.get(lang, EN).get(key, EN[key])
    return s.format(**kw) if kw else s


def table(lang: str, key: str) -> dict:
    return TEXTS.get(lang, EN).get(key, EN[key])
