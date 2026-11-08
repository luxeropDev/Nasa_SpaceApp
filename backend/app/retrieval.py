import math, re
from collections import Counter
from .data_loader import INVESTIGATIONS
from .retrieval_ru import ru_terms, ru_families

STOP = set("a an the of in on and or to for is are was were what which who how about with by from at as it its this that do does did be between difference studied study show me tell nasa research investigation investigations experiments experiment".split())
SYN = {
    "fire": ["flammability", "combustion"], "smoke": ["aerosol", "soot", "smoke"], "detector": ["smoke", "aerosol"],
    "detection": ["smoke", "aerosol"], "suppression": ["extinguishment", "extinction", "suppression"],
    "extinguish": ["extinguishment", "extinction"], "lunar": ["lunar_habitat", "lunar_rover"], "moon": ["lunar_habitat"],
    "mars": ["mars_transit"], "liquid": ["droplet", "liquid"], "gas": ["gaseous", "gas"], "solid": ["solid", "material"],
    "material": ["solid", "flammability"], "materials": ["solid", "flammability"], "droplet": ["droplet", "liquid"],
}


def tokenize(t: str) -> list[str]:
    return [w for w in re.findall(r"[a-z0-9_\-]+", t.lower().replace("-", " ")) if w not in STOP and len(w) > 1]


def normalize(q: str) -> list[str]:
    toks = tokenize(q)
    out = list(toks)
    for t in toks:
        out += SYN.get(t, [])
    for t in ru_terms(q):
        out += [t] + SYN.get(t, [])
    return out


def doc_text(i) -> str:
    parts = [i.id, i.acronym, i.acronym, i.acronym, i.full_name, i.full_name, i.fuel_type, i.fuel_material, i.gravity_environment,
             i.objective, i.hardware, " ".join(i.measurement_types), i.research_domain, i.fire_safety_domain,
             " ".join(i.relevance), " ".join(f.text for f in i.findings), " ".join(i.limitations), " ".join(i.known_conditions)]
    if i.fuel_type == "liquid": parts.append("droplet")
    if i.fuel_type == "gas": parts.append("gaseous")
    return " ".join(parts)


class BM25:
    def __init__(self, k1=1.5, b=0.75):
        self.docs = [(i, tokenize(doc_text(i))) for i in INVESTIGATIONS]
        self.k1, self.b = k1, b
        self.N = len(self.docs)
        self.avg = sum(len(d) for _, d in self.docs) / self.N
        self.df = Counter()
        for _, d in self.docs:
            for t in set(d): self.df[t] += 1

    def search(self, query: str, limit=10):
        q = normalize(query)
        res = []
        for inv, d in self.docs:
            tf = Counter(d); s = 0.0
            for t in q:
                if t not in tf: continue
                idf = math.log(1 + (self.N - self.df[t] + 0.5) / (self.df[t] + 0.5))
                s += idf * tf[t] * (self.k1 + 1) / (tf[t] + self.k1 * (1 - self.b + self.b * len(d) / self.avg))
            if s > 0: res.append((inv, s))
        res.sort(key=lambda x: -x[1])
        return res[:limit]


INDEX = BM25()


def families_in(query: str) -> list[str]:
    """Detect named investigation families (e.g. 'saffire' -> all Saffire records)."""
    q = " " + re.sub(r"[^a-z0-9]+", " ", query.lower()) + " "
    found = list(ru_families(query))
    for fam in ["bass", "saffire", "flex", "same", "acme", "cfi", "spice", "slice", "e field", "efield"]:
        if f" {fam} " in q or f" {fam}" in q and fam in ("bass", "saffire", "flex", "same", "acme", "cfi", "spice", "slice"):
            if fam not in found: found.append(fam)
    return found


def family_records(fam: str):
    key = {"e field": "efield"}.get(fam, fam).upper()
    return [i for i in INVESTIGATIONS if i.id.upper().startswith(key)]
