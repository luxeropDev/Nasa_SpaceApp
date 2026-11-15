"""Grounded explanation text for match results. Every value in the text is read from the comparison fields."""
from __future__ import annotations

from .texts_sci import label, tx


def fmt(dim: str, v) -> str:
    if v is None:
        return "—"
    if isinstance(v, str):
        return v
    if dim == "oxygen_mole_fraction":
        return f"{v * 100:.3g} %"
    if dim in ("total_pressure", "oxygen_partial_pressure"):
        return f"{v:.3g} kPa"
    if dim == "flow_velocity":
        return f"{v:.3g} cm/s"
    if dim == "specimen_thickness":
        return f"{v:.3g} mm"
    return f"{v:.4g}"


def _join(lang: str, items: list[str]) -> str:
    if len(items) <= 1:
        return "".join(items)
    return ", ".join(items[:-1]) + f" {tx(lang, 'and')} " + items[-1]


def _item(lang: str, d: dict) -> str:
    name = label(lang, "param", d["dimension"])
    if d["dimension"] == "gravity":
        return f"{name} ({label(lang, 'gravity', str(d['experiment_value']))} vs {label(lang, 'gravity', str(d['target']))})"
    if d["dimension"] in ("material", "flow_direction"):
        return f"{name} ({d['experiment_value']} vs {d['target']})"
    return f"{name} ({fmt(d['dimension'], d['experiment_value'])} vs {fmt(d['dimension'], d['target'])})"


def explain(r: dict, lang: str = "en") -> str:
    dims = [d for d in r["dimensions"] if d["state"] != "MISSING_IN_SCENARIO"]
    by = lambda s: [d for d in dims if d["state"] == s]  # noqa: E731
    parts = []
    c = r["counts"]
    if r["ranking_status"] != "ranked":
        parts.append(tx(lang, "x_insufficient", n=c["comparable"], total=c["requested"]))
    gran = label(lang, "gran", r["granularity"])
    bo = r.get("best_observation") or {}
    where = tx(lang, "x_where", acc=r["accession"], row=bo.get("row", "—"), label=f" — {label(lang, 'rowlabel', r['row_label'])} {bo['label']}" if bo.get("label") and r.get("row_label") else "") if bo else r["accession"]
    m, p, x, miss, nc = by("MATCH"), by("PARTIAL_MATCH"), by("MISMATCH"), by("MISSING_IN_EXPERIMENT"), by("NOT_COMPARABLE")
    if m:
        parts.append(tx(lang, "x_selected", items=_join(lang, [_item(lang, d) for d in m]), verb=tx(lang, "are" if len(m) > 1 else "is"), where=where))
    if p:
        parts.append(tx(lang, "x_selected_partial", items=_join(lang, [_item(lang, d) for d in p]), verb=tx(lang, "are" if len(p) > 1 else "is"), where=where))
    if not m and not p and r["ranking_status"] == "ranked":
        parts.append(tx(lang, "x_none_match"))
    if x:
        parts.append(tx(lang, "x_mismatch", items=_join(lang, [_item(lang, d) for d in x]), verb=tx(lang, "are" if len(x) > 1 else "is")))
    if miss:
        parts.append(tx(lang, "x_missing", items=_join(lang, [label(lang, "param", d["dimension"]) for d in miss])))
    for d in nc:
        if r["study_type"] != "flight_experiment":
            why = tx(lang, "why_ground")
        elif d["dimension"] == "material" and not d.get("target_recognized", True):
            why = tx(lang, "why_material_target")
        elif d["dimension"] == "material":
            why = tx(lang, "why_material")
        else:
            why = tx(lang, "why_other")
        parts.append(tx(lang, "x_notcomp", items=label(lang, "param", d["dimension"]), why=why))
    if r.get("joint_dimensions") and r.get("joint_matches"):
        parts.append(tx(lang, "x_joint", n=r["joint_matches"], label=r["row_label"] or gran))
    if x or miss or nc:
        parts.append(tx(lang, "x_limit"))
    return " ".join(parts)
