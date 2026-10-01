-- Per-company route autocomplete options, not a shared static list — one
-- company's own trade-lane list must not be visible to other tenants on
-- this multi-tenant platform. Demo build ships with no seed data.
CREATE TABLE company_routes (
    company_id  INTEGER NOT NULL REFERENCES companies(id),
    route       TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (company_id, route)
);
