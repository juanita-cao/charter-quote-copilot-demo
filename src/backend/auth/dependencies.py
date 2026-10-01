"""
get_current_company — FastAPI dependency, structural tenant isolation
(design_backend.md §8/§9.2a, ADR-026 point 1). Not a DEP node: like
verify_refresh_token/verify_access_token, this is pure Auth Boundary
verification, no business decision.
"""

from __future__ import annotations

from fastapi import HTTPException, Request, status

from src.backend.auth.jwt_utils import TokenVerificationError, verify_access_token
from src.backend.configs.feature_flags import ACCESS_COOKIE_NAME
from src.backend.schemas import CurrentUser


def get_current_company(request: Request) -> CurrentUser:
    """Every "Auth required" route (§8) depends on this instead of trusting
    any client-supplied user_id/company_id. Raises 401 on a missing cookie or
    any verify_access_token failure (signature, token_type, malformed claims,
    or expiry) — never falls back to an unauthenticated identity."""
    raw_token = request.cookies.get(ACCESS_COOKIE_NAME)
    if not raw_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing access token")

    try:
        return verify_access_token(raw_token)
    except TokenVerificationError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid access token"
        ) from None
