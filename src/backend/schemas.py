from __future__ import annotations

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from src.backend.legacy import upgrade_legacy_snapshot


class OtherCost(BaseModel):
    """A custom voyage cost (client item 7, v1.1): a name and an amount. The amount may be
    negative (a credit / revenue adjustment) [AMENDMENT 2026-09-24, design_backend.md §15.8 D-1]."""

    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=60)
    amount: float = Field(allow_inf_nan=False)


class VoyagePort(BaseModel):
    """One row of the voyage port sequence (v1.2, design_backend.md §17.4, PT-21)."""

    model_config = ConfigDict(str_strip_whitespace=True)

    port: str = Field(min_length=1, max_length=60)
    role: Literal["load", "discharge", "waypoint"] = "waypoint"


class QuoteInput(BaseModel):
    route: str
    cargo_description: str = ""

    # v1.1 (design_backend.md §15.1): dates, ports and notes. Not calculation inputs.
    fill_in_date: date | None = None
    laycan_start: date | None = None
    laycan_end: date | None = None
    load_port: str = Field(default="", max_length=60)
    discharge_port: str = Field(default="", max_length=60)
    cargo_notes: str = Field(default="", max_length=4000)

    # v1.2 (design_backend.md §17.4, PT-21): the full port sequence for the voyage, in travel
    # order. `load_port`/`discharge_port` above are still what the calculation and Excel
    # export use — the frontend derives them from whichever row is tagged here and sends
    # both; this list exists for distance-only purposes (which legs are ballast vs laden) and
    # round-tripping the sequence itself. At most one "load" row and one "discharge" row, and
    # the discharge row (if any) must come after the load row — never a second commercial
    # load/discharge port.
    voyage_ports: list[VoyagePort] = Field(default_factory=list, max_length=12)

    quantity: float = Field(gt=0)  # cargo qty, RT
    freight_rate: float = Field(gt=0)  # USD/RT — quoted to cargo owner
    commission_rate: float = Field(ge=0, le=100)  # %

    # v1.1: per port the operator gives the days directly ("days") or a rate per day ("rate");
    # the calculation uses the effective days (E2). The field the mode does not use may be absent.
    loading_mode: Literal["days", "rate"] = "days"
    discharging_mode: Literal["days", "rate"] = "days"
    loading_days: float | None = Field(default=None, ge=0)
    discharging_days: float | None = Field(default=None, ge=0)
    loading_rate: float | None = Field(default=None, gt=0)  # same unit as quantity, per day
    discharging_rate: float | None = Field(default=None, gt=0)
    margin_days: float = Field(ge=0)  # port/weather buffer days

    ballast_distance: float = Field(ge=0)  # nm
    laden_distance: float = Field(ge=0)  # nm
    ballast_speed: float = Field(gt=0)  # knots
    laden_speed: float = Field(gt=0)  # knots

    hfo_price: float = Field(ge=0)
    mgo_price: float = Field(ge=0)
    hfo_ballast_consumption: float = Field(ge=0)
    hfo_laden_consumption: float = Field(ge=0)
    mgo_ballast_consumption: float = Field(ge=0)
    mgo_laden_consumption: float = Field(ge=0)
    hfo_port_consumption: float = Field(ge=0)
    mgo_port_consumption: float = Field(ge=0)

    load_port_pda: float = Field(ge=0)  # v1.1: replaces the single port_cost
    discharge_port_pda: float = Field(ge=0)
    other_costs: list[OtherCost] = Field(default_factory=list, max_length=20)
    loading_cost: float = Field(ge=0, default=0.0)  # 2026-07-24 client feedback
    discharging_cost: float = Field(ge=0, default=0.0)  # 2026-07-24 client feedback
    cev_cost: float = Field(ge=0, default=0.0)  # 2026-07-24 client feedback
    ilohc_cost: float = Field(ge=0, default=0.0)  # 2026-07-24 client feedback

    market_benchmark: float = Field(ge=0)  # manual entry — display reference only
    shipowner_asking_tce: float = Field(ge=0)  # manual entry — used in D1/D2 formulas
    # (shipowner hire cost, ADR-012), not display-only despite the field's name
    go_threshold_pct: float = Field(ge=0, le=100)  # company-configurable, pilot: 2.5

    # Special passage legs (ADR-024, supersedes ADR-022) — each passage may
    # be transited both laden and ballast within one voyage (e.g. a Yangtze
    # up-river port requires passing 长江口 both ways), split directly by
    # loading state rather than by direction+flag — no is_laden field, which
    # bucket a value goes in IS its loading state. Each bucket has its own
    # dedicated MGO consumption rate (narrow-channel/pilotage transit burns
    # fuel at a rate genuinely different from open-sea laden/ballast sailing
    # — not interchangeable with mgo_laden_consumption or
    # mgo_ballast_consumption). No HFO field — CJK/QZ transit is MGO-only
    # (regulated slow-steaming, emission-sensitive river-mouth/strait zones),
    # confirmed by the client. A bucket's loading state selects which speed
    # to use for that bucket's days AND which of ballast_distance/
    # laden_distance its nm is carved out of — carved out, not added on top,
    # since ballast_distance/laden_distance are entered as the full
    # point-to-point nm, already inclusive of any special-passage stretch
    # within that leg (2026-08-07 client bug report — see e_nodes.py E2 and
    # ADR-022 for the carve-out analysis; ADR-024 for the field-shape
    # simplification). 0 nm = that bucket not applicable (default).
    cjk_laden_nm: float = Field(ge=0, default=0.0)  # 长江口·满载, nm
    cjk_laden_mgo_consumption: float = Field(ge=0, default=0.0)  # own rate, t/day
    cjk_ballast_nm: float = Field(ge=0, default=0.0)  # 长江口·空载, nm
    cjk_ballast_mgo_consumption: float = Field(ge=0, default=0.0)
    qz_laden_nm: float = Field(ge=0, default=0.0)  # 琼州海峡·满载, nm
    qz_laden_mgo_consumption: float = Field(ge=0, default=0.0)
    qz_ballast_nm: float = Field(ge=0, default=0.0)  # 琼州海峡·空载, nm
    qz_ballast_mgo_consumption: float = Field(ge=0, default=0.0)

    # Charter party terms + lashing cost (P1, T16)
    # contract_terms: display/audit only, no calc impact. lashing_cost: real
    # E2 calc input, added to total_voyage_cost — the two are NOT both inert.
    contract_terms: str = "FIO"  # FIO | FILO | FICO | FLT | LIFO | free text
    lashing_cost: float = Field(ge=0, default=0.0)  # USD

    # Vessel info (P4, T17) — auto-fill trigger for Bunker & Speed; display/audit only
    vessel_name: str = ""
    vessel_dwt: int = Field(ge=0, default=0)  # 0 = not set; else matches lookup tier
    has_crane: bool = False  # only relevant for 8000/9000/10000t tiers

    # Bunkering port (P6, PT-09) — auto-fill trigger for hfo_price/mgo_price
    # via E7; display/audit only, no calculation impact
    bunkering_port: str = ""  # "" = not set / not bunkering this voyage

    @model_validator(mode="before")
    @classmethod
    def _upgrade_legacy_input(cls, data):
        # A request or snapshot still carrying `port_cost` becomes an even PDA split (legacy.py).
        return upgrade_legacy_snapshot(data)

    @field_validator("load_port", "discharge_port")
    @classmethod
    def _trim_port(cls, value: str) -> str:
        return value.strip()

    @model_validator(mode="after")
    def _cross_field_rules(self):
        for label, mode, days, rate in (
            ("loading", self.loading_mode, self.loading_days, self.loading_rate),
            ("discharging", self.discharging_mode, self.discharging_days, self.discharging_rate),
        ):
            if mode == "days" and days is None:
                raise ValueError(f"{label}_days is required when {label}_mode is 'days'")
            if mode == "rate" and rate is None:
                raise ValueError(f"{label}_rate is required when {label}_mode is 'rate'")
        if (self.laycan_start is None) != (self.laycan_end is None):
            raise ValueError("laycan_start and laycan_end must be given together")
        start, end = self.laycan_start, self.laycan_end
        if start is not None and end is not None and end < start:
            raise ValueError("laycan_end must not be before laycan_start")

        load_idx = [i for i, p in enumerate(self.voyage_ports) if p.role == "load"]
        discharge_idx = [i for i, p in enumerate(self.voyage_ports) if p.role == "discharge"]
        if len(load_idx) > 1:
            raise ValueError("voyage_ports must have at most one 'load' row")
        if len(discharge_idx) > 1:
            raise ValueError("voyage_ports must have at most one 'discharge' row")
        if load_idx and discharge_idx and discharge_idx[0] <= load_idx[0]:
            raise ValueError("the 'discharge' row must come after the 'load' row")
        return self

    @property
    def port_cost(self) -> float:
        """The PDA total (read-only convenience; v1.1 stores the two halves)."""
        return self.load_port_pda + self.discharge_port_pda


class TCEResult(BaseModel):
    total_days: float
    # v1.1: the effective loading / discharging days (typed, or calculated from the rate)
    loading_days: float
    discharging_days: float
    total_voyage_cost: float
    net_voyage_income: float
    # gross: quantity x freight_rate, at the precision mode's rounding (2026-09-20)
    freight_revenue: float
    tce: float


class DealDecision(BaseModel):
    decision: Literal["GO", "NO-GO"]
    reason: str
    reason_zh: str = ""  # the same sentence in Chinese; empty on records saved before 2026-09-21
    rule_triggered: str  # "R1" (GO) / "R2" (NO-GO)
    profit_margin_pct: float  # drives the decision
    operator_profit_usd: float  # net_voyage_income - shipowner_cost — display only (ADR-014)
    spread_vs_shipowner_ask: float  # tce - shipowner_asking_tce — display only
    spread_vs_market_benchmark: float  # tce - market_benchmark — display only
    inputs_snapshot: QuoteInput


class ReverseQuoteResult(BaseModel):
    break_even_rate: float
    minimum_safe_rate: float  # rate that hits target_tce; independent of go_threshold_pct (ADR-005)
    current_rate: float  # echoes QuoteInput.freight_rate


class QuotationSandboxResult(BaseModel):
    resolved_freight_rate: float
    resolved_freight_revenue: float  # quantity x resolved_freight_rate (2026-09-20)
    resolved_tce: float
    break_even_rate: float
    decision: DealDecision


class BunkerPriceResult(BaseModel):
    """E7 · get_bunker_price return type — latest daily-scraped row for a port
    from bunker_price_reference (PT-09). Both range endpoints are kept (the
    source publishes a price range, not a single figure); auto-fill uses
    vlsfo_high/lsmgo_high per direct client feedback (2026-07-17), not the
    midpoint originally proposed."""

    port: str
    vlsfo_low: float | None
    vlsfo_high: float | None
    lsmgo_low: float | None
    lsmgo_high: float | None
    report_date: date  # the report's own publish date (plain HTML title) —
    # not the internal MOPS-citation date (~1 day behind) or scrape time
    scraped_at: datetime
    vote_agreement: float  # sweep+vote agreement ratio, e.g. 4/5 = 0.8


class RegisterInput(BaseModel):
    """E8 · register_company input (P5, PT-11) — self-service signup, simple
    version (no email verification this round, per client 2026-07-19)."""

    company_name: str = Field(min_length=1)
    admin_email: EmailStr
    password: str = Field(min_length=8)
    password_confirm: str

    @model_validator(mode="after")
    def _passwords_match(self) -> RegisterInput:
        if self.password != self.password_confirm:
            raise ValueError("password and password_confirm must match")
        return self


class RegisterResult(BaseModel):
    success: bool
    company_id: int | None
    user_id: int | None
    error_message: str | None  # e.g. "Company name already exists" / "Email already registered"


class AuthResult(BaseModel):
    """D3 · authenticate_user output — error_message is always the same
    generic string on any failure (anti-enumeration, see design_backend.md §5.2)."""

    success: bool
    company_id: int | None
    user_id: int | None
    error_message: str | None


class RiskScenarioRow(BaseModel):
    scenario_name: str
    scenario_name_zh: str
    delta: float | None  # the perturbation applied; None for Base Case
    delta_step: float  # UI number_input step size for this scenario's delta
    delta_unit: str  # display unit, e.g. "USD", "%", "day", "USD/RT"; "" for Base Case
    estimated_tce: float
    tce_impact: float  # estimated_tce - base_tce
    profit_margin_pct: float
    decision: Literal["GO", "NO-GO"]


# --- Session / auth (React+FastAPI migration, design_backend.md §4.2) ---


class TokenPair(BaseModel):
    """E18 issue_session / E20 rotate_session return type."""

    access_token: str
    refresh_token: str
    family_id: UUID


class VerifiedRefreshClaims(BaseModel):
    """Output of verify_refresh_token (§9.2) — D4's only input, never a raw token
    string. user_id is NOT a separate JWT claim: verify_refresh_token reads the
    JWT standard claim `sub` (signed as str(user_id) by issue_session/
    rotate_session) and converts it to this field — one identity claim, not two."""

    user_id: int
    company_id: int
    family_id: UUID
    jti: UUID
    exp: datetime


class AuthSessionState(BaseModel):
    """E21 get_auth_session return type — D4's other input, alongside
    VerifiedRefreshClaims. previous_refresh_jti/previous_rotated_at exist so D4
    can distinguish "rotated a moment ago" (grace) from "rotated days ago"
    (compromise) — see design_backend.md §9.3."""

    family_id: UUID
    user_id: int
    company_id: int
    absolute_expires_at: datetime
    current_refresh_jti: UUID
    previous_refresh_jti: UUID | None
    previous_rotated_at: datetime | None
    revoked_at: datetime | None


class RefreshDecision(BaseModel):
    """D4 evaluate_refresh_request return type. Exactly 4 outcomes — see
    design_backend.md §3.1 for the 7-rule precedence that resolves to one of
    these, and §9.3/§12 for what each outcome obligates the caller to do."""

    outcome: Literal["rotate", "reject_grace", "reject_compromise", "reject_expired"]
    family_id: UUID | None


class CurrentUser(BaseModel):
    """get_current_company dependency return type (design_backend.md §8/§9.2a)
    — the resolved identity every "Auth required" route uses in place of any
    client-supplied user_id/company_id (ADR-026 point 1, tenant isolation)."""

    user_id: int
    company_id: int


class CurrentUserProfile(BaseModel):
    """GET /api/v1/auth/me response (T2.24) — the caller's own identity (from
    the verified access token, never client input) plus the company's display
    name. company_name is None when the SOFT lookup fails.

    dashboards_eligible (design_backend.md §24, T2.35): whether this company is
    entitled to the /dashboards page at all — a planned paid feature, not on by
    default. The frontend hides the nav item/route when this is false; the backend
    routes enforce the same allow-list independently either way, so this is a UX
    convenience, never the actual access control."""

    user_id: int
    company_id: int
    company_name: str | None
    dashboards_eligible: bool


class VesselConsumptionProfile(BaseModel):
    """GET /api/v1/company/vessel-consumption response (T2.25, PT-08) — the
    speed + consumption fields a DWT tier auto-fills into the quote form."""

    ballast_speed: float
    laden_speed: float
    hfo_ballast_consumption: float
    hfo_laden_consumption: float
    mgo_ballast_consumption: float
    mgo_laden_consumption: float
    hfo_port_consumption: float
    mgo_port_consumption: float


class QuoteCalculationResult(BaseModel):
    """POST /api/v1/quotes/calculate response (T2.11) — bundles E2+D1's
    outputs; DealDecision.inputs_snapshot already carries E1's validated/
    normalized QuoteInput back to the caller, so it isn't duplicated here."""

    tce_result: TCEResult
    deal_decision: DealDecision


class BulkDeleteRequest(BaseModel):
    """POST .../bulk-delete request body (T2.16/T2.19, §8) — shared by
    quotes/bulk-delete (E14) and drafts/bulk-delete (E17), same shape for
    both."""

    record_ids: list[int]
