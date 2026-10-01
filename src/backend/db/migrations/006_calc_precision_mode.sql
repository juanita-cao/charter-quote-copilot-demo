-- PT-13 (design_problem.md §8, ADR-018) — per-company calculation precision
-- mode. Default 'full' preserves current behavior for every existing
-- company unless someone deliberately flips it to 'display'.
ALTER TABLE companies
  ADD COLUMN calc_precision_mode TEXT NOT NULL DEFAULT 'full'
  CHECK (calc_precision_mode IN ('full', 'display'));
