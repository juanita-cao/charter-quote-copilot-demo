"""
Runtime feature flags and security-contract constants. All switches in one
place — business logic imports from here, never reads os.getenv directly.
"""

from __future__ import annotations

# ── Auth / session (design_backend.md §9.1/§9.3) ────────────────────────────
ACCESS_TOKEN_TTL_MINUTES: int = 15
REFRESH_TOKEN_TTL_DAYS: int = 14
ABSOLUTE_SESSION_TTL_DAYS: int = 30
REFRESH_REUSE_GRACE_SECONDS: int = 5
JWT_ALGORITHM: str = "HS256"
ACCESS_COOKIE_NAME: str = "access_token"
REFRESH_COOKIE_NAME: str = "refresh_token"

# ── Login rate limiting (design_backend.md §9.4) ────────────────────────────
LOGIN_EMAIL_MAX_FAILURES: int = 5
LOGIN_EMAIL_WINDOW_MINUTES: int = 10
LOGIN_EMAIL_BLOCK_MINUTES: int = 15
LOGIN_IP_MAX_FAILURES: int = 20
LOGIN_IP_WINDOW_MINUTES: int = 10
LOGIN_IP_BLOCK_MINUTES: int = 15

# ── CORS (design_backend.md §10) ─────────────────────────────────────────────
# Fallback only — the real value is deployment-specific (ALLOWED_ORIGINS env
# var, not a fixed constant here). Common local React dev server ports, so
# CORS/Origin-validation work out of the box against localhost before a real
# domain exists (§10's "Prerequisite before deployment," not before coding).
DEFAULT_ALLOWED_ORIGINS: tuple[str, ...] = ("http://localhost:5173", "http://localhost:3000")

# ── Vessel-consumption auto-fill eligibility ────────────────────────────────
# company_ids allowed to receive the static DWT->consumption table
# (`configs/vessel_consumption.py`). In a real deployment this is one
# company's own real fleet data, gated so it is never served to another
# tenant; widening this set is a data-exposure decision, not a routine
# config edit. Demo build: company 1 only (the seeded demo tenant).
VESSEL_CONSUMPTION_ELIGIBLE_COMPANY_IDS: frozenset[int] = frozenset({2})

# ── Custom ports eligibility ─────────────────────────────────────────────────
# company_ids allowed to receive the custom-ports table
# (`configs/custom_ports.py`) — real trading points with no official
# UN/LOCODE entry, specific to one company's trade. Kept separate from
# VESSEL_CONSUMPTION_ELIGIBLE_COMPANY_IDS even when the values match —
# widening one is not a decision to widen the other.
CUSTOM_PORT_ELIGIBLE_COMPANY_IDS: frozenset[int] = frozenset({2})

# ── Distance-history eligibility ─────────────────────────────────────────────
# company_ids allowed to receive the historical port-pair distance table
# (`configs/route_distances.py`) — mined from one company's own real
# voyages. Kept separate from the other two allow-lists for the same
# reason: widening one is not a decision to widen the others.
DISTANCE_HISTORY_ELIGIBLE_COMPANY_IDS: frozenset[int] = frozenset({2})

# ── Dashboards eligibility ───────────────────────────────────────────────────
# company_ids allowed to see the /dashboards page and its routes at all — a
# different reason from the three lists above (those gate one company's
# real data from leaking to other tenants; this gates a paid feature, not a
# data-privacy boundary). Demo build: company 1 only.
DASHBOARDS_ELIGIBLE_COMPANY_IDS: frozenset[int] = frozenset({2})

# ── Demo-only passwordless entry (public demo deployment) ───────────────────
# When set, POST /api/v1/auth/demo-login logs the caller straight into this
# account — no credentials — so a sales demo has no login friction. None
# (the default) disables the route entirely (404), which is what a real
# deployment should have. Capped by DEMO_LOGIN_MAX_PER_IP so it is not an
# unbounded way to spin up sessions.
DEMO_LOGIN_EMAIL: str | None = "demo@meridian-bulk.example"
DEMO_LOGIN_MAX_PER_IP: int = 30
DEMO_LOGIN_WINDOW_MINUTES: int = 10
DEMO_LOGIN_BLOCK_MINUTES: int = 15
