"""
Seeds the demo deployment with one fictional company and a batch of synthetic voyage quotes, so
History and the Dashboards aren't empty on a fresh database. Entirely fictional: no real company's
cargo, routes, rates or fleet data — port names are real (public geography), everything else
(dates, quantities, rates, cargo pairing, vessel sizes, bunker prices, margins) is generated.

Every record is built through the real pipeline (QuoteInput -> calculate_tce -> analyze_deal ->
save_quote_record), the same functions the live app uses, so what dashboards and history show is
internally consistent (the same way a real saved quote would be).

Default is --dry-run (prints what would be inserted, opens no DB connection). --live requires
DATABASE_URL in the environment (a *demo* database — never point this at a production one).

    set -a; source .env.demo; set +a
    python -m scripts.seed_demo_data --dry-run
    python -m scripts.seed_demo_data --live
"""

from __future__ import annotations

import argparse
import random
import sys
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

DEMO_COMPANY_NAME = "Meridian Bulk Chartering"
DEMO_ADMIN_EMAIL = "demo@meridian-bulk.example"
DEMO_ADMIN_PASSWORD = "DemoPass123!"  # demo-only database; change before reusing this script elsewhere

# Real, public port names (ordinary geography, not any company's private trade-lane list).
PORTS = [
    "Singapore", "Qingdao", "Busan", "Ho Chi Minh City", "Shanghai", "Kaohsiung",
    "Manila", "Jakarta", "Laem Chabang", "Tianjin", "Nhava Sheva", "Colombo",
]
# Cargo concepts kept generic/industry-standard, same list the app's own recognition dictionary uses.
CARGOES = ["iron ore", "steel coil", "fertilizer", "coal", "cement", "wire rod", "soybean meal", "dolomite"]
DWT_TIERS = [2000, 3000, 5000, 6000, 8000, 10000, 15000, 20000]
CHARTER_TERMS = ["FIO", "FIOST", "FILO", "FLT"]


def _rng() -> random.Random:
    return random.Random(20260930)  # fixed seed: re-running regenerates the identical dataset


def build_cases(n: int = 48) -> list[dict]:
    rng = _rng()
    today = date(2026, 9, 30)
    cases = []
    for i in range(n):
        load_port, discharge_port = rng.sample(PORTS, 2)
        dwt = rng.choice(DWT_TIERS)
        quantity = round(dwt * rng.uniform(0.55, 0.85), -1)
        rate = round(rng.uniform(8, 45), 2)
        ballast_nm = rng.randint(150, 1800)
        laden_nm = rng.randint(300, 3200)
        speed = rng.choice([9.0, 9.5, 10.0, 10.5, 11.0])
        hfo_price = round(rng.uniform(480, 650), 0)
        mgo_price = round(rng.uniform(650, 900), 0)
        created = today - timedelta(days=rng.randint(0, 210))
        cases.append(
            {
                "route": f"{load_port}-{discharge_port}",
                "cargo_description": rng.choice(CARGOES),
                "fill_in_date": created.isoformat(),
                "load_port": load_port,
                "discharge_port": discharge_port,
                "quantity": quantity,
                "freight_rate": rate,
                "commission_rate": 2.5,
                "loading_mode": "days",
                "discharging_mode": "days",
                "loading_days": round(rng.uniform(2, 4), 1),
                "discharging_days": round(rng.uniform(2, 4), 1),
                "margin_days": 2.0,
                "ballast_distance": float(ballast_nm),
                "laden_distance": float(laden_nm),
                "ballast_speed": speed,
                "laden_speed": speed,
                "hfo_price": hfo_price,
                "mgo_price": mgo_price,
                "hfo_ballast_consumption": round(dwt / 1000 + rng.uniform(-1, 1), 1),
                "hfo_laden_consumption": round(dwt / 900 + rng.uniform(-1, 1), 1),
                "mgo_ballast_consumption": 0.4,
                "mgo_laden_consumption": 0.4,
                "hfo_port_consumption": 0.0,
                "mgo_port_consumption": 0.3,
                "load_port_pda": round(rng.uniform(4000, 18000), 0),
                "discharge_port_pda": round(rng.uniform(4000, 18000), 0),
                "loading_cost": 0.0,
                "discharging_cost": 0.0,
                "cev_cost": 0.0,
                "ilohc_cost": 0.0,
                "contract_terms": rng.choice(CHARTER_TERMS),
                "vessel_dwt": dwt,
                "has_crane": rng.random() < 0.3,
                "market_benchmark": round(rng.uniform(4000, 9000), 0),
                "shipowner_asking_tce": round(rng.uniform(4500, 9500), 0),
                "go_threshold_pct": 10.0,
                "created_at": created.isoformat(),
            }
        )
    return cases


def main() -> None:
    from src.backend.d_nodes import analyze_deal
    from src.backend.e_nodes import calculate_tce, register_company
    from src.backend.schemas import QuoteInput, RegisterInput

    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", default=True)
    parser.add_argument("--live", action="store_true")
    parser.add_argument("--count", type=int, default=48)
    args = parser.parse_args()

    cases = build_cases(args.count)
    print(f"{len(cases)} synthetic cases built for {DEMO_COMPANY_NAME!r}")
    for c in cases[:3]:
        print(f"  {c['fill_in_date']}  {c['route']}  {c['cargo_description']}  qty={c['quantity']}")

    if not args.live:
        print("\n--dry-run (default): no database connection opened, nothing inserted.")
        return

    print(f"\nregistering {DEMO_COMPANY_NAME!r} / {DEMO_ADMIN_EMAIL} ...")
    reg = register_company(
        RegisterInput(
            company_name=DEMO_COMPANY_NAME, admin_email=DEMO_ADMIN_EMAIL, password=DEMO_ADMIN_PASSWORD
        )
    )
    if not reg.success:
        print(f"  registration skipped/failed ({reg.error_message}) — assuming the company already exists")
    company_id = reg.company_id
    if company_id is None:
        print("no company_id returned — cannot seed quotes. Check the company already exists and "
              "look it up manually if this script needs to be re-run against the same database.")
        return

    inserted = 0
    for c in cases:
        inputs_kwargs = {k: v for k, v in c.items() if k != "created_at"}
        inputs = QuoteInput(**inputs_kwargs)
        for mode in ("display",):
            tce_result = calculate_tce(inputs, precision_mode=mode)
            decision = analyze_deal(tce_result, inputs, precision_mode=mode)
            from src.backend.e_nodes import save_quote_record

            ok = save_quote_record(
                inputs, tce_result, decision, reverse=None, company_id=company_id,
                created_at=c["created_at"],
            )
            inserted += 1 if ok else 0
    print(f"inserted {inserted} of {len(cases)} quote records for company_id={company_id}")
    print(f"\nDemo login: {DEMO_ADMIN_EMAIL} / {DEMO_ADMIN_PASSWORD}")


if __name__ == "__main__":
    main()
