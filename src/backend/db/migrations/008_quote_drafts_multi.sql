-- PT-17 / ADR-021 (design_backend.md) — multi-draft support.
-- Was PRIMARY KEY(user_id): one row per user, upsert-overwrite (ADR-019).
-- Surrogate id lets a user hold multiple drafts; route/cargo_description
-- denormalized from raw_input_json (same "empty string = not filtered/not
-- set" convention as quote_records + E6) so drafts are searchable the same
-- way saved quotes are, without needing a JSONB query for the two fields
-- the search bar actually filters on most.
ALTER TABLE quote_drafts DROP CONSTRAINT quote_drafts_pkey;
ALTER TABLE quote_drafts ADD COLUMN id SERIAL PRIMARY KEY;
ALTER TABLE quote_drafts
  ADD COLUMN route TEXT NOT NULL DEFAULT '',
  ADD COLUMN cargo_description TEXT NOT NULL DEFAULT '';
CREATE INDEX idx_quote_drafts_user_id ON quote_drafts (user_id);
