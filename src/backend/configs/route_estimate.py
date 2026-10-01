"""
Distance estimate, Phase 2 (design_backend.md §17.5, PT-21): a fallback for a port pair with
no match in the client's own history (`route_distances.py`). Uses `searoute` (Apache-2.0, free
— already licence-checked and approved by the client, design_problem.md PT-21), which computes
an actual sea route between two coordinates over a maritime route network, not a straight line.

Coordinates come from `port_coordinates.py` (generated from the standard port list — a custom
port, config/custom_ports.py, has no official coordinates and is never estimable).
"""

from __future__ import annotations

import logging

import searoute as sr

from src.backend.configs.port_coordinates import PORT_COORDINATES

logger = logging.getLogger(__name__)


def estimate_distance(port_a: str, port_b: str) -> float | None:
    """SOFT — returns None (never raises) when either port has no known coordinates, the two
    ports are the same, or the route computation itself fails for any reason."""
    if not port_a or not port_b or port_a == port_b:
        return None
    a, b = PORT_COORDINATES.get(port_a), PORT_COORDINATES.get(port_b)
    if a is None or b is None:
        return None
    try:
        route = sr.searoute(list(a), list(b), units="naut")
        return round(route.properties["length"], 1)
    except Exception:
        logger.exception("searoute distance estimate failed for %s -> %s", port_a, port_b)
        return None
