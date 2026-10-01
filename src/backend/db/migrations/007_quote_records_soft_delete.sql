-- PT-15 (design_problem.md §9, ADR-020) — soft delete for quote_records.
-- NULL = active (every existing row after this migration runs). Never
-- physically DELETE — E14 only ever sets this column.
ALTER TABLE quote_records ADD COLUMN deleted_at TIMESTAMPTZ NULL;
