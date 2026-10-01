# Charter Quote Copilot — Demo

A decision-support tool for a ship charterer: given one voyage's details (cargo, ports, speeds,
bunker consumption, port costs), it computes the time-charter-equivalent (TCE) day rate, whether
the deal clears a profit-margin threshold, what freight rate to quote to hit a target margin, and
how sensitive the result is to common risks — port cost, bunker price, schedule slippage, freight
rate. An operator can also paste a raw freight enquiry and have cargo, route, quantity, laycan and
charter terms recognised and proposed for review, never silently auto-filled.

**This is a demo build.** It ships with no company-specific history (no real fleet consumption
table, no real trade-lane distance table, no real custom-port list) and runs against a seeded,
entirely fictional dataset — see "What's not in this demo" below.

## Engineering approach

- **Schema-first.** Every calculation step takes and returns a typed, validated contract; the
  frontend never reimplements a calculation the backend already owns.
- **Recognition proposes, it never overwrites.** Pasting an enquiry fills blank fields and marks
  anything it found as "recognised — please check"; a field that already holds a different value
  is left alone, with the recognised value shown alongside it for the operator to accept or reject.
- **Two calculation precisions, by design.** A "full precision" mode (no intermediate rounding) and
  a "display precision" mode (every step rounded to 2 decimals, the way a spreadsheet set to
  "precision as displayed" behaves) are both first-class — not just a formatting choice at the end.
- **Tenant isolation.** Every row is scoped to the authenticated company; nothing company-specific
  (saved quotes, custom reference tables) is ever served across a tenant boundary.
- **Design-before-code.** Each calculation rule traces to a dated design decision, not an
  undocumented tweak.

## Stack

FastAPI (Python) backend, React + TypeScript + Vite frontend, PostgreSQL. `src/backend/e_nodes.py`
/ `d_nodes.py` hold the calculation and decision steps; `frontend/src/workspace` is the main input
form; `frontend/src/dashboards` the aggregate views (bunker price history, TCE by vessel size,
freight rate by cargo, port cost by port).

## What's not in this demo

- **No real company data.** `configs/custom_ports.py`, `configs/route_distances.py` and
  `configs/vessel_consumption.py` are placeholder/illustrative structures, not any real company's
  measured figures — a real deployment stores one company's own data there, gated so it is never
  served to another tenant.
- **No test suite yet.** The backend and frontend test suites from the private source repository
  are not included in this export; publishing them needs a separate pass to replace the fixtures
  that were built from real voyage data with synthetic ones.
- **Registration is open on the demo deployment** for convenience; a production deployment would
  gate it.
