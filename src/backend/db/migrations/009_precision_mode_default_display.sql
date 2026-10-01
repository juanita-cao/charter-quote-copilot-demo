-- ADR-025 (amends ADR-018's default policy) — every company now defaults
-- to "display" precision mode, matching how an accountant actually
-- reconciles by hand. Two parts:
-- 1. Column default flips, governing every future signup (register_company's
--    INSERT never sets calc_precision_mode explicitly, relies on this
--    default).
-- 2. All existing companies are backfilled to 'display' too — a deliberate,
--    one-time, one-way data change confirmed directly with the client
--    (widened mid-conversation from "new signups only" after she noticed
--    her own existing test account still showed "full"). The per-calculation
--    override selectbox is unaffected either way — this only changes which
--    mode comes pre-selected.
ALTER TABLE companies
  ALTER COLUMN calc_precision_mode SET DEFAULT 'display';

UPDATE companies SET calc_precision_mode = 'display';
