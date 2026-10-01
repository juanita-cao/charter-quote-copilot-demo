-- 010_auth_sessions.sql
-- Backs E18 issue_session / E21 get_auth_session / D4 evaluate_refresh_request /
-- E19 revoke_session_family / E20 rotate_session — see design_backend.md §3.1, §9.3.
-- Additive only: no existing table is touched.

CREATE TABLE auth_sessions (
    id                    BIGSERIAL PRIMARY KEY,
    family_id             UUID NOT NULL UNIQUE,
    user_id               BIGINT NOT NULL REFERENCES users(id),
    company_id            BIGINT NOT NULL REFERENCES companies(id),
    session_start         TIMESTAMPTZ NOT NULL DEFAULT now(),
    absolute_expires_at   TIMESTAMPTZ NOT NULL,
    current_refresh_jti   UUID NOT NULL,
    previous_refresh_jti  UUID,
    previous_rotated_at   TIMESTAMPTZ,
    revoked_at            TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON auth_sessions (company_id);
CREATE INDEX ON auth_sessions (user_id);
