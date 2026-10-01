"""
Demo build. A real deployment can list trading points that have no official
UN/LOCODE entry (jetties, anchorages a particular fleet actually uses) here,
gated per company (`feature_flags.CUSTOM_PORT_ELIGIBLE_COMPANY_IDS`) so one
company's private list is never served to another tenant. The demo ships
with none — Port fields fall back to the bundled standard port list
(`frontend/src/data/ports.json`) and free-text entry.
"""

from __future__ import annotations

CUSTOM_PORTS: tuple[str, ...] = ()
