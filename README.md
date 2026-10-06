# Charter Quote Copilot

![Python 3.11+](https://img.shields.io/badge/Python-3.11%2B-blue)
![FastAPI](https://img.shields.io/badge/API-FastAPI-009688)
![React](https://img.shields.io/badge/UI-React%20%2B%20antd-1677ff)
![Data](https://img.shields.io/badge/data-fictional-orange)

**[Live demo →](https://charterquote-demo.innerdrivestudio.com)** &nbsp;·&nbsp; sign in with **View demo**, no password needed &nbsp;·&nbsp; English / 中文 switch at the top right

A decision-support tool for a **ship charterer**: given one voyage (cargo, ports, speeds, bunker consumption, port costs), it works out the time-charter-equivalent day rate (TCE), whether the deal clears the company's profit threshold, what freight rate to quote to hit a target, and how sensitive the result is to port costs, bunker prices and schedule slippage.

The company (*Meridian Bulk Chartering*), its voyages, prices and history are **fictional**. Ports are real public ports; everything else is generated.

---

## Screenshots

<p align="center"><img src="docs/assets/login.png" width="88%" alt="Sign-in page with the demo entry"></p>

<p align="center"><img src="docs/assets/dashboards.png" width="88%" alt="Dashboards: bunker price history and TCE by vessel size"></p>

<p align="center"><img src="docs/assets/workspace.png" width="88%" alt="Workspace: enquiry recognition and voyage inputs"></p>

## What you can do in the demo

| | |
|---|---|
| **Start from an enquiry** | Paste a broker's enquiry; cargo, ports, quantity, laycan and charter terms are recognised and proposed for review. Recognised fields are marked "please check"; a value you already entered is never silently overwritten. |
| **Calculate & decide** | Fill in the voyage and press Run: TCE, net voyage income, estimated day rate and a GO / NO-GO verdict with the reason spelled out. |
| **Reverse quote** | Set a target TCE and see the freight rate that achieves it, or edit the freight rate and watch the TCE respond. |
| **Risk analysis** | Four adjustable scenarios (port cost, bunker price, spare days, freight rate), each shown against the base case with its effect on TCE and margin. |
| **History** | Every saved quote, searchable, reloadable with one double-click, exportable to Excel. |
| **Dashboards** | Bunker price history by port (from published bunker reports), and TCE by vessel size, freight rate by cargo and port cost by port (from saved quotes). |
| **Others & special passages** | Any extra voyage cost (including a negative credit), and the Yangtze estuary and Qiongzhou Strait passages with their own light-oil rate. |

---

## What this demonstrates

- **Calculations you can check by hand.** Two precision modes: *display* rounds every step to two decimals the way a spreadsheet set to "precision as displayed" does, *full* keeps full precision. The default is display, so the numbers agree with a hand check.
- **Decision logic kept separate from calculation.** The TCE step produces numbers; the decision step applies the company's threshold; the reverse quote reuses the same rules. There is one place each rule lives.
- **Recognition proposes, it never overwrites.** Parsing an enquiry is a suggestion for the operator to accept, not an automatic fill.
- **Tenant isolation.** Every saved quote and every dashboard query is scoped to the signed-in company. Sessions are kept in httpOnly cookies with short-lived access tokens and rotating refresh tokens.
- **Contract-first API.** Inputs and outputs are typed Pydantic models; the frontend renders what the backend returns and never recomputes a number.

---

## Architecture

```
enquiry text ──► recognise (suggestions only)
                        │
voyage inputs ──► validate ──► TCE (display / full) ──► decision (GO / NO-GO)
                        │                                   │
                        ├──► reverse quote (target TCE → rate)
                        ├──► risk scenarios (4 adjustable rows)
                        └──► save ──► history · dashboards · Excel export
```

---

## Quickstart

```bash
git clone https://github.com/juanita-cao/charter-quote-copilot-demo.git
cd charter-quote-copilot-demo
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# database: a PostgreSQL URL (any Postgres works; the demo used Supabase)
export DATABASE_URL="postgresql://user:password@host:5432/dbname"
export JWT_SECRET_KEY="change-me"
export ALLOWED_ORIGINS="http://localhost:5173"

# apply the schema, then seed the fictional company and 48 voyages
for f in src/backend/db/migrations/[0-9]*.sql; do psql "$DATABASE_URL" -f "$f"; done
python -m scripts.seed_demo_data --live

uvicorn src.backend.main:app --port 8000                      # API
cd frontend && npm ci && VITE_API_BASE_URL=http://localhost:8000 npm run dev   # UI on http://localhost:5173
```

`scripts/seed_demo_data.py` defaults to `--dry-run`; pass `--live` only against a database you are happy to fill.

## Deploy

Two services: a Python web service for the API (`pip install -r requirements.txt`, start `uvicorn src.backend.main:app --host 0.0.0.0 --port $PORT`) and a static site for the frontend (`npm ci && npm run build`, publish `frontend/dist`, rewrite `/*` → `/index.html`). Environment variables:

| Variable | Meaning |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (use a pooled URL on hosts without IPv6) |
| `JWT_SECRET_KEY` | Signing key for session tokens |
| `ALLOWED_ORIGINS` | The frontend origin allowed to call the API |
| `VITE_API_BASE_URL` | (frontend, build time) the API base URL |

---

## Project structure

```
src/backend/          calculation & decision steps, auth, routers, schemas, Excel export
src/backend/db/       SQL migrations (applied in order)
frontend/src/         React + TypeScript + Vite + antd (EN / 中文), workspace, history, dashboards
scripts/              demo data seeding
```

## Current scope

Implemented: enquiry recognition, TCE and decision (both precisions), reverse quote, risk scenarios, saved quotes and drafts, history with Excel export, four dashboards, special passages, other costs, sign-in with the seeded demo company, bilingual UI.

Not included yet: the bunker-price scraper (the demo's bunker history is a copy of public reports, loaded once), real authentication beyond the demo tenant, and per-customer handling-time sensitivity.

Not included in this public copy: the automated test suite (its fixtures were built from real voyage data and need replacing with synthetic ones before publishing), and any company-specific reference tables (custom ports, route distances, fleet fuel profiles) — the feature code is here, the data is not.

The calculation rules were checked against a real operator's voyage workbook; those figures are not published. Demo prices and voyages are assumptions for illustration, not market data.
