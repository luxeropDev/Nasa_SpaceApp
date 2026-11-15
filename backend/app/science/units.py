"""Deterministic unit normalization.

Canonical units (SI-oriented, chosen so that values stay readable):
  pressure      -> kPa          (absolute; gauge pressures are never converted)
  velocity      -> cm/s         (PSI tables use cm/s; m/s and mm/s are converted)
  length        -> mm
  fraction      -> fraction     (dimensionless 0..1; percent and ppm are converted)
  time          -> s
  temperature   -> K
  power         -> W
  mass_rate     -> mg/s

Rules:
  * A unit is never inferred from a number alone. `normalize(value, None, dim)` returns status "unit_unresolved".
  * Unknown unit strings return "unit_unresolved"; the raw value is kept by the caller.
  * Every conversion is a single multiplication (or + offset for temperature) named in `method`.
"""
from __future__ import annotations

import re

# dimension -> unit alias -> (canonical unit, factor, offset, method)
_U: dict[str, dict[str, tuple[str, float, float, str]]] = {
    "pressure": {
        "pa": ("kPa", 1e-3, 0.0, "Pa_to_kPa"), "kpa": ("kPa", 1.0, 0.0, "identity"), "mpa": ("kPa", 1e3, 0.0, "MPa_to_kPa"),
        "bar": ("kPa", 100.0, 0.0, "bar_to_kPa"), "mbar": ("kPa", 0.1, 0.0, "mbar_to_kPa"),
        "atm": ("kPa", 101.325, 0.0, "atm_to_kPa"), "psi": ("kPa", 6.894757293168361, 0.0, "psi_to_kPa"),
        "psia": ("kPa", 6.894757293168361, 0.0, "psia_to_kPa"),
        "mmhg": ("kPa", 0.133322387415, 0.0, "mmHg_to_kPa"), "torr": ("kPa", 0.133322368421, 0.0, "torr_to_kPa"),
    },
    "velocity": {
        "m/s": ("cm/s", 100.0, 0.0, "m_per_s_to_cm_per_s"), "cm/s": ("cm/s", 1.0, 0.0, "identity"),
        "mm/s": ("cm/s", 0.1, 0.0, "mm_per_s_to_cm_per_s"),
    },
    "length": {
        "m": ("mm", 1000.0, 0.0, "m_to_mm"), "cm": ("mm", 10.0, 0.0, "cm_to_mm"), "mm": ("mm", 1.0, 0.0, "identity"),
        "um": ("mm", 1e-3, 0.0, "um_to_mm"), "µm": ("mm", 1e-3, 0.0, "um_to_mm"), "micron": ("mm", 1e-3, 0.0, "um_to_mm"),
        "microns": ("mm", 1e-3, 0.0, "um_to_mm"), "micrometer": ("mm", 1e-3, 0.0, "um_to_mm"),
    },
    "fraction": {
        "fraction": ("fraction", 1.0, 0.0, "identity"), "mole fraction": ("fraction", 1.0, 0.0, "identity"),
        "volume fraction": ("fraction", 1.0, 0.0, "identity"),
        "%": ("fraction", 0.01, 0.0, "percent_to_fraction"), "percent": ("fraction", 0.01, 0.0, "percent_to_fraction"),
        "% by vol": ("fraction", 0.01, 0.0, "volume_percent_to_fraction"), "ppm": ("fraction", 1e-6, 0.0, "ppm_to_fraction"),
    },
    "time": {
        "s": ("s", 1.0, 0.0, "identity"), "sec": ("s", 1.0, 0.0, "identity"), "ms": ("s", 1e-3, 0.0, "ms_to_s"),
        "min": ("s", 60.0, 0.0, "min_to_s"), "minutes": ("s", 60.0, 0.0, "min_to_s"),
    },
    "temperature": {
        "k": ("K", 1.0, 0.0, "identity"), "c": ("K", 1.0, 273.15, "celsius_to_kelvin"), "°c": ("K", 1.0, 273.15, "celsius_to_kelvin"),
    },
    "power": {"w": ("W", 1.0, 0.0, "identity"), "kw": ("W", 1e3, 0.0, "kW_to_W")},
    "mass_rate": {"mg/s": ("mg/s", 1.0, 0.0, "identity"), "mg/min": ("mg/s", 1 / 60, 0.0, "mg_per_min_to_mg_per_s"),
                  "g/s": ("mg/s", 1e3, 0.0, "g_per_s_to_mg_per_s")},
    "volume_rate": {"sccm": ("sccm", 1.0, 0.0, "identity"), "slpm": ("sccm", 1e3, 0.0, "slpm_to_sccm")},
    "count": {"count": ("count", 1.0, 0.0, "identity")},
    "dimensionless": {"ratio": ("ratio", 1.0, 0.0, "identity"), "1": ("ratio", 1.0, 0.0, "identity")},
}

CANONICAL = {d: next(iter(v.values()))[0] for d, v in _U.items()}
CANONICAL["pressure"] = "kPa"
CANONICAL["fraction"] = "fraction"


def clean_unit(u: str | None) -> str | None:
    if u is None:
        return None
    s = u.strip().lower().replace("μ", "µ")
    s = re.sub(r"\s+", " ", s).strip(" ()[];,")
    return s or None


def normalize(value: float, unit: str | None, dimension: str) -> dict:
    """Convert `value` in `unit` to the canonical unit of `dimension`.

    Returns {normalized_value, normalized_unit, conversion_method, conversion_status} where status is one of
    "converted", "identity", "unit_unresolved", "dimension_unknown".
    """
    table = _U.get(dimension)
    if table is None:
        return {"normalized_value": None, "normalized_unit": None, "conversion_method": None, "conversion_status": "dimension_unknown"}
    u = clean_unit(unit)
    if u is None or u not in table:
        return {"normalized_value": None, "normalized_unit": CANONICAL.get(dimension), "conversion_method": None, "conversion_status": "unit_unresolved"}
    canon, factor, offset, method = table[u]
    out = value * factor + offset
    return {"normalized_value": float(round(out, 10)), "normalized_unit": canon, "conversion_method": method,
            "conversion_status": "identity" if method == "identity" else "converted"}


def is_known(unit: str | None, dimension: str) -> bool:
    return clean_unit(unit) in _U.get(dimension, {})


def from_canonical(value: float, dimension: str, unit: str) -> float:
    """Inverse conversion (canonical -> `unit`), used only for display of user targets."""
    canon, factor, offset, _ = _U[dimension][clean_unit(unit)]  # type: ignore[index]
    return (value - offset) / factor


def oxygen_partial_pressure(x_o2: float, p_total_kpa: float) -> float:
    """pO2 = xO2 * P_total (Dalton's law, ideal-gas mixture). Inputs must already be normalized and validated."""
    if not (0.0 <= x_o2 <= 1.0):
        raise ValueError("oxygen mole fraction must be within [0, 1]")
    if p_total_kpa <= 0:
        raise ValueError("total pressure must be positive (absolute)")
    return x_o2 * p_total_kpa
