-- 011_audit_log.sql
-- Action-level audit trail — distinct from quote_records (a passive record of
-- *what was quoted*). See design_backend.md §11.
-- Additive only: no existing table is touched.

CREATE TABLE audit_log (
    id           BIGSERIAL PRIMARY KEY,
    user_id      BIGINT REFERENCES users(id),
    company_id   BIGINT REFERENCES companies(id),
    action       TEXT NOT NULL,
    target_type  TEXT,
    target_id    BIGINT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON audit_log (company_id, created_at);
