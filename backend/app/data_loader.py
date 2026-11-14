import json
from pathlib import Path
from .models import Investigation, Source

DATA = Path(__file__).resolve().parent.parent / "data"
DATASET_VERSION = "kb-2.0+psi"

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

CONTEXT = json.loads((DATA / "context_records.json").read_text(encoding="utf-8"))

from . import psi as _psi  # noqa: E402
from .i18n_data import numeric_status as _ns  # noqa: E402

# PSI linkage: every accession must exist in the ingested PSI records; numeric status reflects PSI tables
for _i in INVESTIGATIONS:
    for _a in _i.psi_accessions:
        assert _a in _psi.PSI, f"{_i.id} references PSI accession {_a} that is not in psi_records.json"
    _i.numeric_data_status = _ns(_i, "en")

# integrity check: every referenced source exists
for _i in INVESTIGATIONS:
    for _s in _i.source_ids + [f.source_id for f in _i.findings]:
        assert _s in SRC, f"{_i.id} references unknown source {_s}"
