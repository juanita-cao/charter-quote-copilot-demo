-- P5: Auth / multi-tenant company accounts (design_backend.md ADR-016)
CREATE TABLE companies (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE users (
    id             SERIAL PRIMARY KEY,
    company_id     INTEGER NOT NULL REFERENCES companies(id),
    email          TEXT NOT NULL UNIQUE,
    password_hash  TEXT NOT NULL,
    created_at     TIMESTAMPTZ DEFAULT now()
);

-- Backfill: every quote_records row saved before login existed becomes owned
-- by a dedicated "Demo公司" tenant (design_problem.md §7, open question 2) —
-- company_id is NOT nullable; a nullable tenant key is a common source of
-- accidental cross-tenant leaks if a future query forgets to special-case NULL.
INSERT INTO companies (name) VALUES ('Demo公司');

ALTER TABLE quote_records ADD COLUMN company_id INTEGER REFERENCES companies(id);
UPDATE quote_records
   SET company_id = (SELECT id FROM companies WHERE name = 'Demo公司')
 WHERE company_id IS NULL;
ALTER TABLE quote_records ALTER COLUMN company_id SET NOT NULL;
