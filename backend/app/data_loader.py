import json
from pathlib import Path
from .models import Investigation, Source

DATA = Path(__file__).resolve().parent.parent / "data"
DATASET_VERSION = "starter-kb-0.1"

SCENARIOS = {
    "iss": "International Space Station",
    "lunar_habitat": "Lunar surface habitat",
    "lunar_rover": "Pressurized lunar rover",
    "mars_transit": "Mars transit habitat",
}
DOMAINS = {
    "prevention": "Fire prevention",
    "material_flammability": "Material flammability",
    "smoke_detection": "Smoke detection",
    "suppression": "Fire suppression",
}


def load():
    inv = [Investigation(**r) for r in json.loads((DATA / "investigations.json").read_text())]
    src = [Source(**r) for r in json.loads((DATA / "sources.json").read_text())]
    return inv, src


INVESTIGATIONS, SOURCES = load()
INV = {i.id: i for i in INVESTIGATIONS}
SRC = {s.id: s for s in SOURCES}

# integrity check: every referenced source exists
for _i in INVESTIGATIONS:
    for _s in _i.source_ids + [f.source_id for f in _i.findings]:
        assert _s in SRC, f"{_i.id} references unknown source {_s}"
