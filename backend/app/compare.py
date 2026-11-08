from .i18n_data import invs
from .texts import T, table

KEYS = ["objective", "fuel_type", "fuel_material", "hardware", "gravity_environment", "oxygen_concentration", "airflow_speed",
        "measurement_types", "research_domain", "fire_safety_domain", "relevance", "findings", "limitations"]


def fmt(v):
    if v is None or v == [] or v == "":
        return None
    if isinstance(v, list):
        return [x if isinstance(x, str) else x.text for x in v]
    return v


def compare(ids: list[str], lang: str = "en") -> dict:
    _, inv = invs(lang)
    _, en = invs("en")
    items = [inv[i] for i in ids]
    en_items = [en[i] for i in ids]
    labels = table(lang, "field")
    scen = table(lang, "scenario")
    dom = table(lang, "domain")
    fuel = table(lang, "fuel")
    rows = []
    for key in KEYS:
        vals = [fmt(getattr(i, key)) for i in items]
        # sameness is decided on canonical English values so translation never affects the status
        canon = [fmt(getattr(i, key)) for i in en_items]
        if key == "relevance":
            vals = [[scen[r] for r in v] if v else None for v in canon]
        elif key == "fire_safety_domain":
            vals = [dom[v] if v else None for v in canon]
        elif key == "fuel_type":
            vals = [fuel.get(v, v) if v else None for v in canon]
        if all(v is None for v in canon): status = "missing"
        elif any(v is None for v in canon): status = "partial_missing"
        elif all(v == canon[0] for v in canon): status = "same"
        else: status = "different"
        rows.append({"key": key, "label": labels[key], "values": vals, "status": status})
    same = [r["label"] for r in rows if r["status"] == "same"]
    diff = [r["label"] for r in rows if r["status"] == "different"]
    miss = [r["label"] for r in rows if r["status"] in ("missing", "partial_missing")]
    shared = set.intersection(*[set(i.relevance) for i in items])
    none = T(lang, "none")
    summary = T(lang, "cmp_summary", names=", ".join(i.acronym for i in items), ns=len(same), same=", ".join(same) or none, nd=len(diff),
                diff=", ".join(diff) or none, nm=len(miss), miss=", ".join(miss) or none, shared=", ".join(scen[s] for s in shared) or none)
    return {"investigations": [{"id": i.id, "acronym": i.acronym, "full_name": i.full_name} for i in items], "rows": rows, "summary": summary}
