from . import psi
from .data_loader import INV
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
    rows += psi_rows(ids, labels)
    rows += normalized_rows(ids, labels)
    same = [r["label"] for r in rows if r["status"] == "same"]
    diff = [r["label"] for r in rows if r["status"] == "different"]
    miss = [r["label"] for r in rows if r["status"] in ("missing", "partial_missing")]
    shared = set.intersection(*[set(i.relevance) for i in items])
    none = T(lang, "none")
    summary = T(lang, "cmp_summary", names=", ".join(i.acronym for i in items), ns=len(same), same=", ".join(same) or none, nd=len(diff),
                diff=", ".join(diff) or none, nm=len(miss), miss=", ".join(miss) or none, shared=", ".join(scen[s] for s in shared) or none)
    return {"investigations": [{"id": i.id, "acronym": i.acronym, "full_name": i.full_name} for i in items], "rows": rows, "summary": summary}


def _fmt_num(x: float) -> str:
    return f"{x:.4g}"


def psi_rows(ids: list[str], labels: dict) -> list[dict]:
    """Experimental-condition rows from the linked PSI experiment tables.

    Values are column ranges exactly as published, each with its own column header (unit). Ranges from different
    columns or units are never normalised; such rows get status "not_comparable" and missing tables stay "missing"."""
    rows = [{"key": "psi_dataset", "label": labels["psi_dataset"],
             "values": [[f"{a} · DOI {psi.PSI[a]['doi']}" for a in INV[i].psi_accessions] or None for i in ids], "status": "reference"}]
    for param in ("oxygen", "pressure", "flow", "other_gas", "fuel", "result"):
        vals, cols = [], []
        for i in ids:
            cs = [c for a in INV[i].psi_accessions for c in psi.conditions(a) if c["parameter"] == param]
            if not cs:
                vals.append(None)
                cols.append(None)
                continue
            out = []
            for c in cs[:4]:
                rng = f"{_fmt_num(c['min'])}–{_fmt_num(c['max'])}" if c.get("kind") == "numeric" else ", ".join(map(str, c.get("examples", [])[:4]))
                out.append(f"{rng} [{c['column']}] · {c['accession']}, {c['filled_rows']}/{c['total_rows']}")
            vals.append(out)
            cols.append(tuple(sorted(c["column"].lower() for c in cs)))
        if all(v is None for v in vals):
            status = "missing"
        elif any(v is None for v in vals):
            status = "partial_missing"
        elif len(set(cols)) == 1:
            status = "same_basis"
        else:
            status = "not_comparable"
        rows.append({"key": "psi_" + param, "label": labels["psi_" + param], "values": vals, "status": status})
    return rows


UNIT = {"oxygen_mole_fraction": "%", "total_pressure": "kPa", "oxygen_partial_pressure": "kPa", "flow_velocity": "cm/s", "specimen_thickness": "mm"}
NORM = [("oxygen_mole_fraction", "x_o2", 100.0), ("total_pressure", "p_kpa", 1.0), ("oxygen_partial_pressure", "po2_kpa", 1.0),
        ("flow_velocity", "flow_cm_s", 1.0), ("specimen_thickness", "thickness_mm", 1.0)]


def normalized_rows(ids: list[str], labels: dict) -> list[dict]:
    """Normalized-layer rows: canonical units, valid single values only, granularity stated.

    status: same (identical ranges) | similar (ranges overlap) | different (no overlap) | missing | partial_missing |
            incompatible_granularity (records of different granularity: e.g. per-test vs test-day summary)."""
    from .science import measurements as M
    obs = {i: [o for a in INV[i].psi_accessions for o in M.DATASETS[a]["observations"] if o["row_type"] != "duplicate"] for i in ids}
    grans = {i: sorted({M.DATASETS[a]["granularity"] for a in INV[i].psi_accessions}) for i in ids}
    rows = [{"key": "norm_granularity", "label": labels["norm_granularity"], "values": [grans[i] or None for i in ids], "status": "reference"}]
    for param, key, scale in NORM:
        vals, rngs, gs = [], [], []
        for i in ids:
            sel = [o for o in obs[i] if o.get(key) is not None]
            if not sel:
                vals.append(None)
                rngs.append(None)
                continue
            v = [o[key] * scale for o in sel]
            lo, hi = min(v), max(v)
            g = sorted({o["granularity"] for o in sel})
            gs.append(tuple(g))
            accs = sorted({o["accession"] for o in sel})
            calc = " (calculated)" if param == "oxygen_partial_pressure" else ""
            vals.append([f"{lo:.4g}–{hi:.4g}{calc} · n={len(v)} · {', '.join(accs)} · {', '.join(g)}"])
            rngs.append((lo, hi))
        present = [r for r in rngs if r]
        if not present:
            status = "missing"
        elif len(present) < len(rngs):
            status = "partial_missing"
        elif len(set(gs)) > 1:
            status = "incompatible_granularity"
        elif len(set(present)) == 1:
            status = "same"
        elif max(r[0] for r in present) <= min(r[1] for r in present):
            status = "similar"
        else:
            status = "different"
        rows.append({"key": "norm_" + param, "label": labels["norm_" + param], "values": vals, "status": status, "unit": UNIT[param]})
    g = [sorted({M.DATASETS[a]["gravity"]["condition"] or "unknown" for a in INV[i].psi_accessions}) or None for i in ids]
    rows.append({"key": "norm_gravity", "label": labels["norm_gravity"], "values": g, "status": "missing" if all(v is None for v in g) else ("same" if len({tuple(v or []) for v in g}) == 1 else "different")})
    mats = []
    for i in ids:
        ms = sorted({o["material"] for o in obs[i] if o.get("material")})
        mats.append(ms or None)
    ms_present = [set(m) for m in mats if m]
    st = "missing" if not ms_present else ("partial_missing" if len(ms_present) < len(mats) else ("same" if all(m == ms_present[0] for m in ms_present) else ("similar" if set.intersection(*ms_present) else "different")))
    rows.append({"key": "norm_material", "label": labels["norm_material"], "values": mats, "status": st})
    qv = []
    for i in ids:
        if not INV[i].psi_accessions:
            qv.append(None)
            continue
        q = [M.DATASETS[a]["quality"] for a in INV[i].psi_accessions]
        qv.append([f"{a}: {x['valid_numeric']} / {x['invalid']} / {x['ambiguous']}" for a, x in zip(INV[i].psi_accessions, q)])
    rows.append({"key": "norm_quality", "label": labels["norm_quality"], "values": qv, "status": "reference"})
    return rows
