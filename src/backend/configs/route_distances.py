"""
Demo build. A real deployment mines a company's own real voyage history into
a port-pair distance table here (nautical miles + sample count), gated per
company (`feature_flags.DISTANCE_HISTORY_ELIGIBLE_COMPANY_IDS`): "has this
fleet actually sailed this pair, and how far did it measure?" — not a
routing estimate.

The demo ships with no company history. A route-distance field still works:
it falls back to the public sea-route estimate (the open-source routing
library, see `configs/route_estimate.py`), it is just never the "our own
fleet has sailed this exact pair" branch.
"""

from __future__ import annotations

# (port_a, port_b) as a sorted pair -> {nm, samples}; look up with lookup_distance().
ROUTE_DISTANCES: dict[tuple[str, str], dict[str, float | int]] = {}


def lookup_distance(port_a: str, port_b: str) -> dict[str, float | int] | None:
    """SOFT — an unknown pair (or either port blank) returns None, not an error."""
    if not port_a or not port_b:
        return None
    return ROUTE_DISTANCES.get(tuple(sorted((port_a, port_b))))
