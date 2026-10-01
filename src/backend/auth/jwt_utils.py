"""
Auth Boundary — cryptographic verification before D4 (design_backend.md §9.2).

Not a DEP node: sign_token/verify_refresh_token are pure auth infrastructure,
no business decision. verify_refresh_token's contract and failure behavior
are part of the design, not left implicit — see §9.2 for the 4 ordered checks.
"""

from __future__ import annotations

import os
from datetime import UTC, datetime
from typing import Literal
from uuid import UUID

import jwt as pyjwt

from src.backend.configs.feature_flags import JWT_ALGORITHM
from src.backend.schemas import CurrentUser, VerifiedRefreshClaims


class TokenVerificationError(Exception):
    """Raised by verify_refresh_token on any failure — signature, token_type
    mismatch, malformed/missing claims, or JWT-level exp. Callers must return
    401 and must never call D4 when this is raised (§9.2, AUTH-S01/AUTH-S02)."""


def _jwt_secret() -> str:
    return os.environ["JWT_SECRET_KEY"]


def sign_token(
    *,
    user_id: int,
    company_id: int,
    family_id: UUID,
    jti: UUID,
    token_type: Literal["access", "refresh"],
    expires_at: datetime,
) -> str:
    """Signs one access or refresh JWT — design_backend.md §3.1 E18/E20 rows.
    Identity claim is the JWT standard `sub` (= str(user_id)), not a separate
    user_id claim."""
    payload = {
        "sub": str(user_id),
        "company_id": company_id,
        "family_id": str(family_id),
        "jti": str(jti),
        "exp": expires_at,
        "token_type": token_type,
    }
    return pyjwt.encode(payload, _jwt_secret(), algorithm=JWT_ALGORITHM)


def verify_refresh_token(raw_token: str, *, allow_expired: bool = False) -> VerifiedRefreshClaims:
    """§9.2's four ordered checks: (1) signature, (2) token_type == "refresh",
    (3) required claims present and well-formed, (4) JWT-level exp not passed.

    allow_expired=True skips only check (4) — the logout relaxation (§9.3):
    revoking an already-expired family is harmless, but a forged or
    wrong-type token must still never be able to trigger a logout for a
    family it doesn't belong to, so checks (1)-(3) always apply regardless.
    """
    try:
        payload = pyjwt.decode(
            raw_token,
            _jwt_secret(),
            algorithms=[JWT_ALGORITHM],
            options={"verify_exp": not allow_expired},
        )
    except pyjwt.PyJWTError as e:
        raise TokenVerificationError(f"signature/exp check failed: {e}") from e

    if payload.get("token_type") != "refresh":
        raise TokenVerificationError("token_type is not 'refresh'")

    try:
        return VerifiedRefreshClaims(
            user_id=int(payload["sub"]),
            company_id=payload["company_id"],
            family_id=UUID(payload["family_id"]),
            jti=UUID(payload["jti"]),
            exp=datetime.fromtimestamp(payload["exp"], tz=UTC),
        )
    except (KeyError, ValueError, TypeError) as e:
        raise TokenVerificationError(f"malformed claims: {e}") from e


def verify_access_token(raw_token: str) -> CurrentUser:
    """Auth Boundary for `Depends(get_current_company)` (design_backend.md
    §9.2a) — mirrors verify_refresh_token's checks (signature, token_type,
    well-formed claims, exp) but for the access token, with no allow_expired
    escape hatch: an expired access token is always rejected, the client is
    expected to hit /auth/refresh instead (§9.1)."""
    try:
        payload = pyjwt.decode(raw_token, _jwt_secret(), algorithms=[JWT_ALGORITHM])
    except pyjwt.PyJWTError as e:
        raise TokenVerificationError(f"signature/exp check failed: {e}") from e

    if payload.get("token_type") != "access":
        raise TokenVerificationError("token_type is not 'access'")

    try:
        return CurrentUser(user_id=int(payload["sub"]), company_id=payload["company_id"])
    except (KeyError, ValueError, TypeError) as e:
        raise TokenVerificationError(f"malformed claims: {e}") from e
