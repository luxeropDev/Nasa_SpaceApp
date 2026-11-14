import math, re
from collections import Counter
from . import psi
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


def fields(i) -> dict[str, str]:
    """Searchable fields of one record. PSI fields come from the linked, ingested PSI investigation(s)."""
    recs = [psi.PSI[a] for a in i.psi_accessions if a in psi.PSI]
    f = {
        "identifier": " ".join([i.id, i.acronym, *i.psi_accessions, *[r["doi"] or "" for r in recs], *[r["acronym"] or "" for r in recs]]),
        "name": i.full_name + " " + " ".join(r["title"] for r in recs),
        "objective": i.objective,
        "fuel": i.fuel_type + " " + i.fuel_material + (" droplet" if i.fuel_type == "liquid" else "") + (" gaseous" if i.fuel_type == "gas" else ""),
        "hardware": i.hardware + " " + " ".join(r["hardware"] or "" for r in recs),
        "environment": i.gravity_environment + " " + " ".join(i.known_conditions),
        "measurements": " ".join(i.measurement_types),
        "domain": i.research_domain + " " + i.fire_safety_domain + " " + " ".join(i.relevance),
        "findings": " ".join(f.text for f in i.findings) + " " + " ".join(i.limitations),
        "psi_text": " ".join(f"{r['objective']} {r['approach']} {r['sub_research_area'] or ''}" for r in recs),
        "psi_conditions": " ".join(f"{c['parameter']} {c['column']} {' '.join(map(str, c.get('examples', [])))}" for a in i.psi_accessions for c in psi.conditions(a)),
        "publications": " ".join(p["title"] for r in recs for p in r["publications"]),
    }
    return f


# field weights: identifiers and names count more than long PSI narrative text
FIELD_W = {"identifier": 3.0, "name": 2.0, "objective": 1.5, "fuel": 1.5, "hardware": 1.2, "environment": 1.0, "measurements": 1.2,
           "domain": 1.2, "findings": 1.0, "psi_text": 0.35, "psi_conditions": 0.8, "publications": 0.3}


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
        self.fields = {i.id: {k: Counter(tokenize(v)) for k, v in fields(i).items()} for i in INVESTIGATIONS}
        self.flen = {k: sum(sum(f[k].values()) for f in self.fields.values()) / len(self.fields) or 1 for k in FIELD_W}
        self.fdf = {k: Counter(t for f in self.fields.values() for t in f[k]) for k in FIELD_W}
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


    def search_explained(self, query: str, limit=10):
        """BM25 over the curated record + weighted per-field BM25 over linked PSI text, plus exact identifier matches.
        Returns (record, score, why) where `why` lists matched terms per field and any exact identifier hit."""
        q = list(dict.fromkeys(normalize(query)))
        raw = query.strip().lower()
        n = self.N
        out = []
        for inv, _ in self.docs:
            fl = self.fields[inv.id]
            s, why = 0.0, {}
            for t in q:
                for fname, tf in fl.items():
                    if t in tf:
                        df = self.fdf[fname][t]
                        idf = math.log(1 + (n - df + 0.5) / (df + 0.5))
                        ln = sum(tf.values()) / self.flen[fname]
                        s += FIELD_W[fname] * idf * tf[t] * (self.k1 + 1) / (tf[t] + self.k1 * (1 - self.b + self.b * ln))
                        why.setdefault(fname, []).append(t)
            exact = None
            ids = [inv.id, inv.acronym, *inv.psi_accessions] + [psi.PSI[a]["doi"] for a in inv.psi_accessions if a in psi.PSI and psi.PSI[a]["doi"]]
            for x in ids:
                if raw == x.lower() or re.search(r"(?<![a-z0-9])" + re.escape(x.lower()) + r"(?![a-z0-9])", raw):
                    exact = x
                    s += 25.0
                    break
            if exact:  # identifier fragments ("psi", "69") add nothing once the whole identifier matched
                why.pop("identifier", None)
            if s > 0:
                out.append((inv, s, {"fields": {k: sorted(set(v)) for k, v in why.items()}, "exact_identifier": exact,
                                     "expanded_terms": [t for t in q if t not in tokenize(query)]}))
        out.sort(key=lambda x: -x[1])
        if out:  # drop weak incidental matches (e.g. a shared DOI prefix) far below the best hit
            out = [o for o in out if o[1] >= 0.08 * out[0][1]]
        return out[:limit]


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
