"""
Demo build. A real deployment can store a specific fleet's own measured
consumption-by-DWT profile here, gated per company
(`feature_flags.VESSEL_CONSUMPTION_ELIGIBLE_COMPANY_IDS`) so one company's
fleet data is never served to another tenant, and never bundled into the
frontend where any tenant's browser could read it.

The table below is illustrative demo data, not a real fleet's measured
figures — plausible bulk-carrier speeds/consumption by size tier, shaped the
same way the lookup expects, so the "pick a DWT, see the form fill in" flow
has something to show. Key: (vessel_dwt, has_crane); tiers with no crane
variant are looked up with has_crane=False. Speeds in knots, consumption in
MT/day, HFO port = 0 for every tier.
"""

from __future__ import annotations


def _vc(
    bs: float, ls: float, hb: float, hl: float, mb: float, ml: float, hp: float, mp: float
) -> dict[str, float]:
    return {
        "ballast_speed": bs,
        "laden_speed": ls,
        "hfo_ballast_consumption": hb,
        "hfo_laden_consumption": hl,
        "mgo_ballast_consumption": mb,
        "mgo_laden_consumption": ml,
        "hfo_port_consumption": hp,
        "mgo_port_consumption": mp,
    }


_TABLE: dict[tuple[int, bool], dict[str, float]] = {
    (2000, False): _vc(9.0, 9.0, 3.0, 3.0, 0.30, 0.30, 0.0, 0.30),
    (3000, False): _vc(9.0, 9.0, 3.0, 3.0, 0.30, 0.30, 0.0, 0.30),
    (5000, False): _vc(9.5, 9.5, 4.5, 4.5, 0.35, 0.35, 0.0, 0.35),
    (8000, False): _vc(9.5, 9.5, 7.0, 7.0, 0.60, 0.60, 0.0, 0.60),
    (8000, True): _vc(9.5, 9.5, 8.0, 8.0, 0.90, 0.90, 0.0, 0.90),
    (10000, False): _vc(10.0, 9.5, 8.5, 8.5, 1.00, 1.00, 0.0, 1.50),
    (10000, True): _vc(10.5, 10.0, 9.5, 10.0, 1.00, 1.00, 0.0, 1.50),
    (20000, False): _vc(11.0, 10.5, 12.0, 12.5, 1.00, 1.00, 0.0, 1.50),
}

_CRANE_VARIANT_TIERS = (8000, 10000)


def lookup_vessel_consumption(dwt: int, has_crane: bool) -> dict[str, float] | None:
    """Same rule as the real deployment: the crane flag only matters for the
    tiers that have a crane variant; every other tier is looked up with
    has_crane=False. Unknown DWT (including 0) -> None."""
    key = (dwt, has_crane) if dwt in _CRANE_VARIANT_TIERS else (dwt, False)
    profile = _TABLE.get(key)
    return dict(profile) if profile is not None else None
