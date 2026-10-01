import { ReloadOutlined } from "@ant-design/icons";
import { Alert, Button, InputNumber } from "antd";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SandboxKnobs } from "../api/api";
import { useApi } from "../app/contexts";
import { DecisionPill, MetricCard, SectionHeader, Stacked } from "../components/MetricCard";
import { useSandbox } from "../hooks/queries";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { buildSandboxVM } from "../vm/verdict";
import { SectionBoundary } from "./SectionBoundary";
import { useWorkspace } from "./context";
import { money, percent, signedMoney } from "./format";

const KNOB_DEBOUNCE_MS = 400;
const STEP = 100;

function Body() {
  const { t } = useTranslation();
  const api = useApi();
  const { calc, calcBody, runPrecision } = useWorkspace();
  const stale = calc.status === "STALE"; // inputs changed since the last Run: shown greyed, not editable until Run again
  // ADR-009: Target TCE and Freight Rate are two ends of one relationship. The one edited last drives (and is what is
  // sent); the other displays the value it implies. Owner Ask is independent. `driver === null` = untouched.
  const [driver, setDriver] = useState<"target" | "rate" | null>(null);
  const [target, setTarget] = useState<number | null>(null);
  const [rate, setRate] = useState<number | null>(null);
  const [ask, setAsk] = useState<number | null>(null);
  const debounced = useDebouncedValue({ driver, target, rate, ask }, KNOB_DEBOUNCE_MS);

  // Exactly one of target_tce / sandbox_freight_rate is sent (backend rule); untouched, it starts from the form's own rate.
  const knobs = useMemo<SandboxKnobs | null>(() => {
    if (!calcBody) return null;
    const k: SandboxKnobs =
      debounced.driver === "target" && debounced.target !== null
        ? { target_tce: debounced.target }
        : debounced.driver === "rate" && debounced.rate !== null
          ? { sandbox_freight_rate: debounced.rate }
          : { sandbox_freight_rate: calcBody.freight_rate };
    if (debounced.ask !== null) k.sandbox_shipowner_ask = debounced.ask;
    return k;
  }, [calcBody, debounced]);

  const q = useSandbox(api, calc.seq, calcBody, knobs, runPrecision);
  const vm = q.data ? buildSandboxVM(q.data) : null;
  const error = q.isError && !q.isPlaceholderData ? q.error : null;

  return (
    <>
      <div className="sandbox-inputs">
        <label className="sandbox-field">
          <Stacked labelKey="cards.targetTce" />
          <InputNumber
            aria-label={t("cards.targetTce")}
            disabled={stale}
            style={{ width: "100%" }}
            step={STEP}
            precision={2}
            value={driver === "target" && target !== null ? target : (vm?.resolvedTce ?? null)}
            onChange={(v) => {
              setTarget(typeof v === "number" ? v : null);
              setDriver(typeof v === "number" ? "target" : null);
            }}
          />
        </label>
        <label className="sandbox-field">
          <Stacked labelKey="cards.ownerAsk" />
          <InputNumber
            aria-label={t("cards.ownerAsk")}
            disabled={stale}
            style={{ width: "100%" }}
            step={STEP}
            precision={2}
            value={ask ?? vm?.ownerAskTce ?? calcBody?.shipowner_asking_tce ?? null}
            onChange={(v) => setAsk(typeof v === "number" ? v : null)}
          />
        </label>
      </div>
      {error && <Alert type="error" showIcon message={error.message} style={{ margin: "12px 0" }} />}
      {vm && (
        <div className={error || stale ? "verdict stale" : "verdict"} data-testid="sandbox">
          <div className="metric-grid">
            <MetricCard labelKey="cards.freightRate">
              <InputNumber
                aria-label={t("cards.freightRate")}
                disabled={stale}
                className="card-input"
                step={0.5}
                precision={2}
                value={driver === "rate" && rate !== null ? rate : vm.resolvedRate}
                onChange={(v) => {
                  setRate(typeof v === "number" ? v : null);
                  setDriver(typeof v === "number" ? "rate" : null);
                }}
              />
            </MetricCard>
            <MetricCard labelKey="cards.totalFreight">{money(vm.totalFreightUsd)}</MetricCard>
            <MetricCard labelKey="cards.netProfit">{signedMoney(vm.operatorProfitUsd)}</MetricCard>
            <MetricCard labelKey="cards.margin">{percent(vm.marginPct)}</MetricCard>
            <MetricCard labelKey="cards.breakEven">{money(vm.breakEvenRate)}</MetricCard>
            <MetricCard labelKey="cards.hireSpreadShort">{signedMoney(vm.spreadVsOwnerAsk)}</MetricCard>
            <MetricCard labelKey="cards.decision" tone={vm.decision === "GO" ? "go" : "nogo"}>
              <DecisionPill decision={vm.decision} />
            </MetricCard>
            <div className="metric-card reset-cell">
              <Button
                icon={<ReloadOutlined />}
                disabled={stale}
                onClick={() => {
                  setDriver(null);
                  setTarget(null);
                  setRate(null);
                  setAsk(null);
                }}
              >
                <Stacked labelKey="cards.reset" />
              </Button>
            </div>
          </div>
          {vm.ownerAskNegative && <Alert type="warning" showIcon message={t("workspace.negativeAsk")} />}
        </div>
      )}
    </>
  );
}

export function ReverseQuotePanel() {
  const { t } = useTranslation();
  return (
    <section aria-label={t("sections.reverseQuote")}>
      <SectionHeader labelKey="sections.reverseQuote" helpKey="sections.reverseHelp" />
      <div className="panel">
        <SectionBoundary>
          <Body />
        </SectionBoundary>
      </div>
    </section>
  );
}
