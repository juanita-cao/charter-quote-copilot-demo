CREATE TABLE bunker_price_reference (
    id                SERIAL PRIMARY KEY,
    scraped_at        TIMESTAMPTZ DEFAULT now(),
    report_date       DATE,          -- the report's own publish date, not the internal MOPS-citation date or scrape time
    port               TEXT NOT NULL,
    vlsfo_low         NUMERIC,
    vlsfo_high        NUMERIC,
    lsmgo_low         NUMERIC,
    lsmgo_high        NUMERIC,
    vote_agreement    NUMERIC        -- sweep+vote agreement ratio, e.g. 0.8 for 4/5
);
