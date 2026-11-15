"""Lossless parsing of a single published table cell.

`parse_cell(raw)` never discards the raw text. It returns a structural reading of the cell:

  kind            meaning
  ----            -------
  empty           blank cell
  missing         explicit "not available" token (N/A, n/a, NA, null, -, en/em dash)
  none_token      the word "none" — may be an observation ("no frames") or a missing reading; resolved by the column
  error           spreadsheet error token (#DIV/0!, #VALUE!, #N/A, #REF!, #NUM!)
  over_range      "OR" (instrument over-range indicator)
  censored        ">500", "< 2", ">= 10" — a bound, not a value
  number          plain number, optionally with an embedded unit ("20 cm/s", "0.27 mm", ".33 cm", "1 atm")
  range           "21.5 - 21.7", "1.5 - 5", "30%-40%", "22.1 to 22.0"
  list            "21; 26.5; 40", "0.5; 1.0; or 3.0", "0.85 and 0.37 mm"
  ambiguous       numeric-looking text whose meaning cannot be fixed safely (e.g. "037 mm": decimal point lost?)
  reference       value given elsewhere ("See Fig. 5")
  text            anything else (qualitative observations, identifiers, notes)

Negative numbers are kept with their sign. Approximation marks ("~", "approx") set `approximate`. Trailing note markers
like "(note 3)" are split off into `note` without changing the value.
"""
from __future__ import annotations

import re

MISSING = {"n/a", "na", "null", "nan", "-", "–", "—", "--", "not available", "not recorded"}
ERRORS = {"#div/0!", "#value!", "#n/a", "#ref!", "#num!", "#name?", "#null!"}
NUM = r"[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?"
UNIT = r"(?:%|[a-zA-Zµμ°][a-zA-Zµμ°/]*(?:\s*/\s*[a-zA-Z]+)?)"
_note = re.compile(r"\s*\((?:see\s+)?note\s*\d+\)\s*$", re.I)
_qual = re.compile(r"^(?P<body>.*?)\s*\((?P<q>[^()]*)\)\s*$")
_num_unit = re.compile(rf"^(?P<approx>~|approx\.?|ca\.?)?\s*(?P<n>{NUM})\s*(?P<u>{UNIT})?$", re.I)
_censor = re.compile(rf"^(?P<op>[<>]=?|≤|≥)\s*(?P<n>{NUM})\s*(?P<u>{UNIT})?$")
_range = re.compile(rf"^(?P<approx>~)?\s*(?P<a>{NUM})\s*(?P<ua>{UNIT})?\s*(?:-|–|—|to)\s*(?P<b>{NUM})\s*(?P<ub>{UNIT})?$", re.I)
_list_sep = re.compile(r"\s*(?:;|,\s*or\s|;\s*or\s|\bor\b|\band\b|&)\s*", re.I)
_lead_zero = re.compile(r"^0\d+(?:\s*[a-zA-Zµ]+)?$")
_ref = re.compile(r"^(see\s+(fig|figure|table|note)|note\s*\d+$)", re.I)
_approx_q = re.compile(r"^(est\.?|estimated?|approx\.?|approximate)$", re.I)


def _f(s: str) -> float:
    return float(s)


def parse_cell(raw: str | None) -> dict:
    text = "" if raw is None else str(raw)
    s = text.strip()
    out: dict = {"raw": text, "kind": "text", "approximate": False, "unit": None, "note": None, "qualifier": None}
    if s == "":
        out["kind"] = "empty"
        return out
    low = s.lower()
    if low in MISSING:
        out["kind"] = "missing"
        return out
    if low in ERRORS:
        out["kind"] = "error"
        return out
    if low == "none":
        out["kind"] = "none_token"
        return out
    if s == "OR":
        out["kind"] = "over_range"
        return out
    if _ref.match(s):
        out["kind"] = "reference"
        return out
    m = _note.search(s)
    if m:
        out["note"] = m.group(0).strip(" ()")
        s = s[: m.start()].strip()
    # qualifier in trailing parentheses, e.g. "n/a (Nomex)" or "~ 0 (Nomex)"
    mq = _qual.match(s)
    if mq and not re.search(r"\d", mq.group("q")):
        out["qualifier"] = mq.group("q").strip()
        if _approx_q.match(out["qualifier"]):
            out["approximate"] = True
        s = mq.group("body").strip()
        if s.lower() in MISSING:
            out["kind"] = "missing"
            return out
    if _lead_zero.match(s):
        out["kind"] = "ambiguous"
        out["reason"] = "leading_zero_integer"  # e.g. "037 mm": decimal point possibly lost; not reinterpreted
        mu = re.match(r"^(\d+)\s*(.*)$", s)
        out["unit"] = (mu.group(2) or None) if mu else None
        return out
    m = _censor.match(s)
    if m:
        out.update(kind="censored", op=m.group("op").replace("≤", "<=").replace("≥", ">="), bound=_f(m.group("n")), unit=m.group("u"))
        return out
    m = _num_unit.match(s)
    if m and (m.group("u") or "").lower() != "e":  # "5e" is a broken exponent, not a unit
        out.update(kind="number", value=_f(m.group("n")), unit=m.group("u"), approximate=bool(m.group("approx")) or out["approximate"])
        return out
    if m:
        out.update(kind="ambiguous", reason="malformed_number")
        return out
    m = _range.match(s)
    if m:
        ua, ub = m.group("ua"), m.group("ub")
        if ua and ub and ua.lower() != ub.lower():
            out.update(kind="ambiguous", reason="range_unit_mismatch")
            return out
        out.update(kind="range", low=_f(m.group("a")), high=_f(m.group("b")), unit=ub or ua, approximate=bool(m.group("approx")))
        if out["low"] > out["high"]:
            out["reversed"] = True  # e.g. "22.1 to 22.0" (a decrease during the test); kept as an interval
        return out
    parts = [p for p in _list_sep.split(s) if p.strip()]
    if len(parts) >= 2:
        vals, units, ok = [], set(), True
        for p in parts:
            mp = _num_unit.match(p.strip())
            if not mp:
                ok = False
                break
            vals.append(_f(mp.group("n")))
            if mp.group("u"):
                units.add(mp.group("u").lower())
        if ok and len(units) <= 1:
            out.update(kind="list", values=vals, unit=(units.pop() if units else None))
            return out
    return out


def is_numeric_kind(c: dict) -> bool:
    return c["kind"] in ("number", "range", "list", "censored")
