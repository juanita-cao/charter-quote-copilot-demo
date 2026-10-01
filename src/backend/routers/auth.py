"""
Auth routes — T2.9 (design_backend.md §8). Every route wraps an existing
node with zero logic changes; this file is the thin adapter layer itself.

Refresh flow is exactly §9.2's chain: raw cookie -> verify_refresh_token ->
get_auth_session (E21) -> D4 -> E20 (rotate) or E19 (compromise). D4 never
sees a raw token; D4 never reads the DB itself.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel

from src.backend.auth.audit import write_audit_log_soft
from src.backend.auth.dependencies import get_current_company
from src.backend.auth.jwt_utils import TokenVerificationError, verify_refresh_token
from src.backend.auth.rate_limit import InMemoryLoginRateLimiter
from src.backend.auth.sessions import (
    RotationConflict,
    evaluate_refresh_request,
    get_auth_session,
    issue_session,
    revoke_session_family,
    rotate_session,
)
from src.backend.configs.feature_flags import (
    ACCESS_COOKIE_NAME,
    ACCESS_TOKEN_TTL_MINUTES,
    DASHBOARDS_ELIGIBLE_COMPANY_IDS,
    DEMO_LOGIN_BLOCK_MINUTES,
    DEMO_LOGIN_EMAIL,
    DEMO_LOGIN_MAX_PER_IP,
    DEMO_LOGIN_WINDOW_MINUTES,
    LOGIN_EMAIL_BLOCK_MINUTES,
    LOGIN_EMAIL_MAX_FAILURES,
    LOGIN_EMAIL_WINDOW_MINUTES,
    LOGIN_IP_BLOCK_MINUTES,
    LOGIN_IP_MAX_FAILURES,
    LOGIN_IP_WINDOW_MINUTES,
    REFRESH_COOKIE_NAME,
    REFRESH_TOKEN_TTL_DAYS,
)
from src.backend.d_nodes import authenticate_user
from src.backend.e_nodes import get_company_name, get_user_by_email, register_company
from src.backend.schemas import CurrentUser, CurrentUserProfile, RegisterInput, TokenPair

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

# Two independent instances of the same class — not special-cased branches
# (design_backend.md §9.4).
_email_limiter = InMemoryLoginRateLimiter(
    max_failures=LOGIN_EMAIL_MAX_FAILURES,
    window_minutes=LOGIN_EMAIL_WINDOW_MINUTES,
    block_minutes=LOGIN_EMAIL_BLOCK_MINUTES,
)
_ip_limiter = InMemoryLoginRateLimiter(
    max_failures=LOGIN_IP_MAX_FAILURES,
    window_minutes=LOGIN_IP_WINDOW_MINUTES,
    block_minutes=LOGIN_IP_BLOCK_MINUTES,
)
# Counts demo-login calls, not failures — same class, reused for "how many
# times has this IP called the passwordless demo route" instead.
_demo_login_limiter = InMemoryLoginRateLimiter(
    max_failures=DEMO_LOGIN_MAX_PER_IP,
    window_minutes=DEMO_LOGIN_WINDOW_MINUTES,
    block_minutes=DEMO_LOGIN_BLOCK_MINUTES,
)


class LoginRequest(BaseModel):
    """HTTP-layer only — not a DEP node contract. E9/D3 take plain
    email/password args, not this model."""

    email: str
    password: str


def _set_token_cookies(response: Response, pair: TokenPair) -> None:
    response.set_cookie(
        ACCESS_COOKIE_NAME,
        pair.access_token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=ACCESS_TOKEN_TTL_MINUTES * 60,
    )
    response.set_cookie(
        REFRESH_COOKIE_NAME,
        pair.refresh_token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=REFRESH_TOKEN_TTL_DAYS * 24 * 3600,
    )


def _clear_token_cookies(response: Response) -> None:
    response.delete_cookie(ACCESS_COOKIE_NAME)
    response.delete_cookie(REFRESH_COOKIE_NAME)


def _client_ip(request: Request) -> str:
    return request.client.host if request.client is not None else "unknown"


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(reg_input: RegisterInput):
    result = register_company(reg_input)
    if not result.success:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=result.error_message)
    return result


@router.post("/login")
def login(body: LoginRequest, request: Request, response: Response):
    email_key = f"email:{body.email}"
    ip_key = f"ip:{_client_ip(request)}"

    if _email_limiter.is_blocked(email_key) or _ip_limiter.is_blocked(ip_key):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many login attempts"
        )

    user_row = get_user_by_email(body.email)
    auth_result = authenticate_user(user_row, body.password)

    if not auth_result.success:
        _email_limiter.record_failure(email_key)
        _ip_limiter.record_failure(ip_key)
        write_audit_log_soft(user_id=None, company_id=None, action="login_failure")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=auth_result.error_message
        )

    _email_limiter.reset(email_key)  # IP counter intentionally NOT reset (§9.4)

    pair = issue_session(user_id=auth_result.user_id, company_id=auth_result.company_id)
    _set_token_cookies(response, pair)
    write_audit_log_soft(
        user_id=auth_result.user_id, company_id=auth_result.company_id, action="login_success"
    )
    return {"success": True}


@router.post("/demo-login")
def demo_login(request: Request, response: Response):
    """Passwordless entry into the fixed demo account (DEMO_LOGIN_EMAIL) for a public sales
    demo — no credentials, no password-failure limiter (there is nothing to fail), only an
    IP call-count cap so the route is not an unbounded way to spin up sessions. 404s outright
    when DEMO_LOGIN_EMAIL is unset (a real deployment should leave it unset)."""
    if DEMO_LOGIN_EMAIL is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    ip_key = f"ip:{_client_ip(request)}"
    if _demo_login_limiter.is_blocked(ip_key):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many demo-login attempts"
        )
    _demo_login_limiter.record_failure(ip_key)

    user_row = get_user_by_email(DEMO_LOGIN_EMAIL)
    if user_row is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Demo account not seeded"
        )

    pair = issue_session(user_id=user_row["id"], company_id=user_row["company_id"])
    _set_token_cookies(response, pair)
    write_audit_log_soft(
        user_id=user_row["id"], company_id=user_row["company_id"], action="demo_login_success"
    )
    return {"success": True}


@router.post("/refresh")
def refresh(request: Request, response: Response):
    raw_token = request.cookies.get(REFRESH_COOKIE_NAME)
    if not raw_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing refresh token"
        )

    try:
        claims = verify_refresh_token(raw_token)
    except TokenVerificationError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token"
        ) from None

    try:
        session = get_auth_session(claims.family_id)
    except Exception:
        # E21 HARD FAIL (DB unavailable) — D4 is never called on this path.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Service unavailable"
        ) from None

    decision = evaluate_refresh_request(claims, session)

    if decision.outcome == "rotate":
        try:
            pair = rotate_session(session)
        except RotationConflict:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Refresh conflict, please log in again",
            ) from None
        _set_token_cookies(response, pair)
        return {"success": True}

    if decision.outcome == "reject_grace":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Please retry")

    if decision.outcome == "reject_expired":
        _clear_token_cookies(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired, please log in again"
        )

    # reject_compromise: revoke + audit, per §12's SEC.8 table. The revoke
    # (E19) is not wrapped in try/except here — its HARD FAIL + ALERT means a
    # write failure must propagate (500), not be silently treated as success.
    if decision.family_id is not None:
        revoke_session_family(decision.family_id)
        write_audit_log_soft(
            user_id=claims.user_id,
            company_id=claims.company_id,
            action="refresh_token_reuse_detected",
            target_type="auth_sessions",
        )
    _clear_token_cookies(response)
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED, detail="Session compromised, please log in again"
    )


@router.post("/logout")
def logout(request: Request, response: Response):
    """Works even with an expired access token (§9.3) — uses the refresh
    cookie only, with the JWT-level exp check relaxed (allow_expired=True);
    signature/token_type checks still apply. Does not use
    Depends(get_current_company) (that decodes the access token)."""
    raw_token = request.cookies.get(REFRESH_COOKIE_NAME)
    if not raw_token:
        _clear_token_cookies(response)
        return {"success": True}  # nothing to revoke, already logged out

    try:
        claims = verify_refresh_token(raw_token, allow_expired=True)
    except TokenVerificationError:
        _clear_token_cookies(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token"
        ) from None

    # Not wrapped in try/except: a failed revoke must not report "logged
    # out" (§9.3) — HARD FAIL propagates as 500, cookies are NOT cleared,
    # so the client doesn't believe a session died that's still alive.
    revoke_session_family(claims.family_id)
    _clear_token_cookies(response)
    return {"success": True}


@router.get("/me", response_model=CurrentUserProfile)
def me(current_user: CurrentUser = Depends(get_current_company)):
    """Auth bootstrap probe + header company name (design_frontend.md §5.1
    GAP-1). Identity is the verified access token's, never client input.
    company_name is SOFT (get_company_name returns None on any DB failure)."""
    return CurrentUserProfile(
        user_id=current_user.user_id,
        company_id=current_user.company_id,
        company_name=get_company_name(current_user.company_id),
        dashboards_eligible=current_user.company_id in DASHBOARDS_ELIGIBLE_COMPANY_IDS,
    )
