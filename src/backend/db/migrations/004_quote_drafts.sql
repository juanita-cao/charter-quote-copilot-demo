-- PT-14 (design_problem.md §8) — Save Draft / Resume Draft.
-- One row per user by design (PRIMARY KEY on user_id, not a surrogate id):
-- at most one active draft per user, saving again overwrites the previous one.
CREATE TABLE quote_drafts (
    user_id          INTEGER PRIMARY KEY REFERENCES users(id),
    company_id       INTEGER NOT NULL REFERENCES companies(id),
    raw_input_json   JSONB NOT NULL,
    updated_at       TIMESTAMPTZ DEFAULT now()
);
