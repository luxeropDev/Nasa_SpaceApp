"""Transparent research RELEVANCE score. NOT a probability of fire, ignition or failure."""
from .data_loader import INVESTIGATIONS
from .i18n_data import invs
from .scenarios import scenario_gaps
from .texts import T, table

WEIGHTS = {"domain": 30, "environment": 20, "fuel_material": 15, "evidence": 15, "scenario": 20}

DOMAIN_FUEL_PREF = {
    "material_flammability": {"solid": 1.0, "liquid": 0.3, "gas": 0.3, "aerosol": 0.2},
    "smoke_detection": {"aerosol": 1.0, "gas": 0.6, "solid": 0.5, "liquid": 0.3},
    "suppression": {"liquid": 0.9, "gas": 0.6, "solid": 0.7, "aerosol": 0.1},
    "prevention": {"solid": 0.8, "liquid": 0.6, "gas": 0.5, "aerosol": 0.3},
}
ADJACENT = {("prevention", "material_flammability"), ("material_flammability", "prevention"), ("suppression", "prevention"), ("prevention", "suppression"), ("smoke_detection", "prevention"), ("prevention", "smoke_detection")}


def score(inv, scenario: str, domain: str) -> dict:
    d = 1.0 if inv.fire_safety_domain == domain else (0.4 if (inv.fire_safety_domain, domain) in ADJACENT else 0.1)
    # environment: all KB records are microgravity; partial-gravity scenarios are not directly covered
    scenario_partial = scenario.startswith("lunar")
    env = 0.55 if scenario_partial else 0.85
    if "free-flying" in inv.gravity_environment: env += 0.1 if scenario != "iss" else 0.05
    if scenario == "lunar_rover" and inv.fuel_type != "solid": env -= 0.1
    fuel = DOMAIN_FUEL_PREF[domain].get(inv.fuel_type, 0.2)
    ev = min(1.0, 0.25 * len(inv.findings) + 0.15 * len(inv.source_ids) + 0.1 * (1 if inv.measurement_types else 0))
    ev *= 0.8 if inv.numeric_data_status.startswith("No numerical") else 1.0
    sc = 1.0 if scenario in inv.relevance else 0.15
    dims = {"domain": d, "environment": min(env, 1), "fuel_material": fuel, "evidence": ev, "scenario": sc}
    factors = [{"dimension": k, "weight": WEIGHTS[k], "value": round(v, 2), "points": round(v * WEIGHTS[k], 1)} for k, v in dims.items()]
    return {"total": round(sum(f["points"] for f in factors), 1), "factors": factors}


DIM_WEIGHTS = [("domain", 30), ("environment", 20), ("fuel_material", 15), ("evidence", 15), ("scenario", 20)]


def method(lang: str) -> dict:
    dim = table(lang, "dim")
    return {"title": T(lang, "score_title"), "disclaimer": T(lang, "score_disclaimer"),
            "dimensions": [{"key": k, "weight": w, "desc": dim[k]} for k, w in DIM_WEIGHTS]}


def analyze(scenario: str, domain: str, lang: str = "en") -> dict:
    scen_l, dom_l = table(lang, "scenario"), table(lang, "domain")
    loc, _ = invs(lang)
    rows = []
    for inv, li in zip(INVESTIGATIONS, loc):
        s = score(inv, scenario, domain)
        rows.append({"id": inv.id, "acronym": li.acronym, "full_name": li.full_name, "fire_safety_domain": inv.fire_safety_domain,
                     "score": s["total"], "factors": s["factors"], "evidence": [f.model_dump() for f in li.findings[:2]],
                     "limitations": li.limitations, "source_ids": inv.source_ids})
    rows.sort(key=lambda r: -r["score"])
    top = rows[:6]
    direct = [r for r in rows if r["fire_safety_domain"] == domain]
    gaps = scenario_gaps(scenario, lang)
    if len(direct) < 3: gaps.append(T(lang, "sc_gap_thin", n=len(direct), domain=dom_l[domain]))
    recs = [T(lang, "sc_rec1"), T(lang, "sc_rec2", domain=dom_l[domain].lower(), scenario=scen_l[scenario])]
    if scenario.startswith("lunar"): recs.append(T(lang, "sc_rec3"))
    return {"scenario": scenario, "scenario_label": scen_l[scenario], "domain": domain, "domain_label": dom_l[domain],
            "results": top, "knowledge_gaps": gaps, "recommendations": recs, "methodology": method(lang)}
