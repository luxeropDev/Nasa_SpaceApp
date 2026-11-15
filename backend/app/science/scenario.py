"""Engineering scenario targets: validation and presets.

A scenario value is a TARGET, never an observation. Each field carries its origin:
  user_defined          typed by the user
  curated_assumption    a PyroLens demonstration assumption (stated with its reason; not an official specification)
  official_specification only if an authoritative document in the collection states it (none is claimed today)
"""
from __future__ import annotations

import json
from typing import Literal, Optional

from pydantic import BaseModel, Field

from .. import psi
from . import materials, physics, units

Gravity = Literal["microgravity", "lunar", "martian", "earth"]
Origin = Literal["user_defined", "curated_assumption", "official_specification"]
GRAVITY_G = {"microgravity": 0.0, "lunar": 1.62 / 9.80665, "martian": 3.71 / 9.80665, "earth": 1.0}


class Quantity(BaseModel):
    value: float
    unit: str
    origin: Origin = "user_defined"
    note: Optional[str] = None
    uncertainty: Optional[float] = Field(None, ge=0, description="Standard uncertainty in the same unit as value (user-stated)")


class Category(BaseModel):
    value: str
    origin: Origin = "user_defined"
    note: Optional[str] = None


class ScenarioTarget(BaseModel):
    name: str = Field("Custom scenario", max_length=120)
    preset: Optional[str] = None
    oxygen_mole_fraction: Optional[Quantity] = None
    total_pressure: Optional[Quantity] = None
    oxygen_partial_pressure: Optional[Quantity] = None
    flow_velocity: Optional[Quantity] = None
    flow_direction: Optional[Category] = None
    gravity: Optional[Category] = None
    material: Optional[Category] = None
    specimen_thickness: Optional[Quantity] = None
    diluent: Optional[Category] = None
    gas_composition: Optional[dict[str, float]] = Field(None, description="Diluent mole fractions by gas, e.g. {'N2': 0.66}")
    flow_configuration: Optional[Category] = None
    specimen_geometry: Optional[Category] = None
    ignition_power: Optional[Quantity] = None
    ignition_duration: Optional[Quantity] = None


class ScenarioRequest(BaseModel):
    scenario: ScenarioTarget
    lang: Literal["en", "ru"] = "en"
    limit: int = Field(12, ge=1, le=30)


DIMS = {"oxygen_mole_fraction": "fraction", "total_pressure": "pressure", "oxygen_partial_pressure": "pressure", "flow_velocity": "velocity",
        "specimen_thickness": "length", "ignition_power": "power", "ignition_duration": "time"}
LEGACY_DIRECTION = {"concurrent": "concurrent_flow_over_solid", "opposed": "opposed_flow_over_solid"}
# what the PSI collection can be compared on (shown to users before they run an analysis)
COMPARABILITY = {
    "oxygen_mole_fraction": "comparable", "total_pressure": "comparable", "oxygen_partial_pressure": "comparable (calculated from table rows)",
    "diluent": "comparable where the source states it (numeric columns, row text, campaign lists, source terms)",
    "flow_configuration": "comparable (dataset-specific profiles)", "flow_velocity": "comparable only within the same flow configuration",
    "gravity": "investigation-level metadata only; no partial-gravity records exist in the collection",
    "material": "comparable (keyword material table)", "specimen_thickness": "comparable (few specimen tables)",
    "specimen_geometry": "investigation-level metadata", "ignition_power": "comparable (PSI-98, PSI-99 only)", "ignition_duration": "comparable (PSI-98, PSI-99 only)",
}

PRESETS: dict = json.loads((psi.DATA / "scenario_presets.json").read_text(encoding="utf-8"))


def validate(t: ScenarioTarget) -> dict:
    """Normalize every target field. Returns {targets, errors, warnings}. Missing fields stay missing (no defaults)."""
    errors, warnings, out = [], [], {}
    for f, dim in DIMS.items():
        q: Quantity | None = getattr(t, f)
        if q is None:
            continue
        n = units.normalize(q.value, q.unit, dim)
        if n["conversion_status"] == "unit_unresolved":
            errors.append({"field": f, "code": "unknown_unit", "detail": q.unit})
            continue
        v = n["normalized_value"]
        if dim == "fraction" and not (0 < v <= 1):
            errors.append({"field": f, "code": "fraction_out_of_range", "detail": str(q.value)})
            continue
        if dim in ("pressure", "length") and v <= 0:
            errors.append({"field": f, "code": "non_positive", "detail": str(q.value)})
            continue
        if dim == "velocity" and v < 0:
            errors.append({"field": f, "code": "negative_velocity", "detail": str(q.value)})
            continue
        if f == "total_pressure" and v > 1000:
            warnings.append({"field": f, "code": "pressure_unusually_high", "detail": f"{v:.0f} kPa"})
        unc = None
        if q.uncertainty is not None:
            unc = abs(units.normalize(q.value + q.uncertainty, q.unit, dim)["normalized_value"] - v)
        out[f] = {"value": v, "unit": n["normalized_unit"], "raw_value": q.value, "raw_unit": q.unit, "origin": q.origin, "note": q.note,
                  "conversion": n["conversion_method"], "derived": False, "uncertainty": unc,
                  "uncertainty_status": "user_stated" if unc is not None else physics.UNCERTAINTY_NOT_REPORTED}
    x, p = out.get("oxygen_mole_fraction"), out.get("total_pressure")
    if x and p:
        po2 = units.oxygen_partial_pressure(x["value"], p["value"])
        if "oxygen_partial_pressure" in out:
            given = out["oxygen_partial_pressure"]["value"]
            if abs(given - po2) / po2 > 0.02:
                warnings.append({"field": "oxygen_partial_pressure", "code": "inconsistent_po2", "detail": f"given {given:.2f} kPa vs xO2·P = {po2:.2f} kPa"})
        else:
            prop = physics.propagate_product(x["value"], x.get("uncertainty"), p["value"], p.get("uncertainty"))
            out["oxygen_partial_pressure"] = {"value": round(po2, 4), "unit": "kPa", "raw_value": None, "raw_unit": None,
                                              "origin": "calculated_from_scenario", "note": "pO2 = xO2 × P_total from the scenario inputs", "conversion": None, "derived": True,
                                              "uncertainty": prop["value"], "uncertainty_status": prop["status"], "uncertainty_propagation": prop,
                                              "calculation_inputs": ["oxygen_mole_fraction", "total_pressure"]}
    for f in ("flow_direction", "gravity", "material", "diluent", "flow_configuration", "specimen_geometry"):
        c: Category | None = getattr(t, f)
        if c is None or not c.value.strip():
            continue
        v = c.value.strip()
        e = {"value": v, "origin": c.origin, "note": c.note}
        if f == "gravity":
            if v not in GRAVITY_G:
                errors.append({"field": f, "code": "unknown_gravity", "detail": v})
                continue
            e["g"] = round(GRAVITY_G[v], 4)
        if f == "flow_direction":
            v = v.lower()
            if v not in ("concurrent", "opposed"):
                errors.append({"field": f, "code": "unknown_flow_direction", "detail": v})
                continue
            e["value"] = v
        if f == "diluent":
            g = physics.canonical_gas(v)
            if not g:
                errors.append({"field": f, "code": "unknown_diluent", "detail": v})
                continue
            e["value"] = g
        if f == "flow_configuration":
            if v not in physics.FLOW_CONFIGS or v == "unknown":
                errors.append({"field": f, "code": "unknown_flow_configuration", "detail": v})
                continue
            e.update(family=physics.flow_family(v), label=physics.FLOW_CONFIGS[v]["label"])
        if f == "specimen_geometry":
            if v not in physics.GEOMETRIES:
                errors.append({"field": f, "code": "unknown_specimen_geometry", "detail": v})
                continue
        if f == "material":
            m = materials.canonical(v)
            e.update(canonical=m["canonical"], fuel_class=m["fuel_class"])
            if not m["canonical"]:
                warnings.append({"field": f, "code": "material_not_recognized", "detail": v})
        out[f] = e
    # legacy flow_direction -> flow_configuration (one physical dimension, never counted twice)
    if "flow_direction" in out:
        fd = out.pop("flow_direction")
        cfg = LEGACY_DIRECTION[fd["value"]]
        if "flow_configuration" in out and out["flow_configuration"]["value"] != cfg:
            errors.append({"field": "flow_direction", "code": "conflicting_flow_direction", "detail": f"{fd['value']} vs {out['flow_configuration']['value']}"})
        elif "flow_configuration" not in out:
            out["flow_configuration"] = {"value": cfg, "origin": fd["origin"], "note": (fd.get("note") or "") + " [mapped from flow_direction]",
                                         "family": physics.flow_family(cfg), "label": physics.FLOW_CONFIGS[cfg]["label"]}
    # gas composition (diluent mole fractions)
    if t.gas_composition:
        comp = {}
        for k, val in t.gas_composition.items():
            g = physics.canonical_gas(k)
            if not g or g == "air":
                errors.append({"field": "gas_composition", "code": "unknown_gas", "detail": k})
                continue
            if not (0 <= val <= 1):
                errors.append({"field": "gas_composition", "code": "fraction_out_of_range", "detail": f"{k}={val}"})
                continue
            comp[g] = val
        if comp:
            tot = sum(comp.values()) + (x["value"] if x else 0)
            if tot > 1.02:
                errors.append({"field": "gas_composition", "code": "composition_exceeds_unity", "detail": f"O2 + diluents = {tot:.3f}"})
            elif x and tot < 0.98:
                warnings.append({"field": "gas_composition", "code": "composition_incomplete", "detail": f"O2 + diluents = {tot:.3f}"})
            primary = max(comp, key=comp.get)
            if "diluent" in out and out["diluent"]["value"] != primary and out["diluent"]["value"] != "air":
                warnings.append({"field": "diluent", "code": "diluent_differs_from_composition", "detail": f"{out['diluent']['value']} vs {primary}"})
            if "diluent" not in out:
                out["diluent"] = {"value": primary, "origin": "derived_from_gas_composition", "note": "largest diluent mole fraction"}
            out["diluent"]["composition"] = comp
    # physical consistency between flow fields
    fc, fv = out.get("flow_configuration"), out.get("flow_velocity")
    if fc and fc["value"] == "quiescent" and fv and fv["value"] > 0:
        errors.append({"field": "flow_velocity", "code": "quiescent_with_flow_velocity", "detail": f"{fv['value']} cm/s"})
    if fv and not fc:
        warnings.append({"field": "flow_configuration", "code": "flow_velocity_without_configuration",
                         "detail": "velocity comparisons are capped at partial until the flow configuration is defined"})
    if x and "diluent" not in out:
        warnings.append({"field": "diluent", "code": "diluent_not_specified",
                         "detail": "equal oxygen fractions with different diluents are not equivalent environments"})
    if not out:
        warnings.append({"field": None, "code": "empty_scenario", "detail": None})
    comparability = {f: {"defined": f in out, "collection_support": COMPARABILITY.get(f)} for f in COMPARABILITY}
    return {"targets": out, "errors": errors, "warnings": warnings, "comparability": comparability}


def preset(key: str) -> dict | None:
    return PRESETS["presets"].get(key)
