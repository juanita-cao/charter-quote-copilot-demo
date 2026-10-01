import { Alert, Button, Collapse, Progress } from "antd";
import { useTranslation } from "react-i18next";
import { DecisionPill, MetricCard, SectionHeader, Stacked } from "../components/MetricCard";
import { buildVerdictVM } from "../vm/verdict";
import { SectionBoundary } from "./SectionBoundary";
import { useWorkspace } from "./context";
import { money, percent, signedMoney } from "./format";

function Cards() {
  const { t, i18n } = useTranslation();
  const { calc, verdictData, run } = useWorkspace();
  // an error, or inputs changed since the last Run, greys the previous result (it no longer describes the inputs)
  const stale = calc.status === "INVALID" || calc.status === "UNAVAILABLE" || calc.status === "STALE";
  const vm = verdictData ? buildVerdictVM(verdictData) : null; // throws on a contract violation -> the section boundary
  return (
    <>
      {calc.status === "CALCULATING" && <Progress percent={100} status="active" showInfo={false} size="small" aria-label={t("workspace.calculating")} />}
      {calc.status === "STALE" && <Alert type="info" showIcon message={t("workspace.stale")} style={{ marginBottom: 12 }} />}
      {calc.status === "INVALID" && <Alert type="error" showIcon message={calc.errorMessage} style={{ marginBottom: 12 }} />}
      {calc.status === "UNAVAILABLE" && (
        <Alert
          type="warning"
          showIcon
          message={t("workspace.calcFailed")}
          action={<Button size="small" onClick={run}>{t("workspace.retry")}</Button>}
          style={{ marginBottom: 12 }}
        />
      )}
      {vm && (
        <div className={stale ? "verdict stale" : "verdict"} data-testid="verdict">
          <div className="metric-grid">
            <MetricCard labelKey="cards.freightRate">{money(vm.freightRate)}</MetricCard>
            <MetricCard labelKey="cards.totalFreight">{money(vm.totalFreightUsd)}</MetricCard>
            <MetricCard labelKey="cards.netProfit">{signedMoney(vm.operatorProfitUsd)}</MetricCard>
            <MetricCard labelKey="cards.margin">{percent(vm.marginPct)}</MetricCard>
            <MetricCard labelKey="cards.estTce">{money(vm.kpis.tce)}</MetricCard>
            <MetricCard labelKey="cards.ownerAsk">{money(vm.ownerAskTce)}</MetricCard>
            <MetricCard labelKey="cards.hireSpread">{signedMoney(vm.spreads.vsOwnerAsk)}</MetricCard>
            <MetricCard labelKey="cards.decision" tone={vm.decision === "GO" ? "go" : "nogo"}>
              <DecisionPill decision={vm.decision} />
            </MetricCard>
          </div>
          <p className="verdict-reason">{i18n.language === "zh" && vm.reasonZh ? vm.reasonZh : vm.reason}</p>
          <Collapse
            ghost
            size="small"
            className="details-collapse"
            items={[
              {
                key: "details",
                label: t("details.title"),
                children: (
                  <dl className="details-list" data-testid="details">
                    <div><dt><Stacked labelKey="details.totalDays" /></dt><dd>{money(vm.kpis.totalDays)}</dd></div>
                    <div><dt><Stacked labelKey="details.voyageCost" /></dt><dd>{money(vm.kpis.voyageCost)}</dd></div>
                    <div><dt><Stacked labelKey="details.netIncome" /></dt><dd>{money(vm.kpis.netIncome)}</dd></div>
                    <div><dt><Stacked labelKey="details.vsMarket" /></dt><dd>{signedMoney(vm.spreads.vsMarket)}</dd></div>
                  </dl>
                ),
              },
            ]}
          />
          {vm.ownerAskNegative && <Alert type="warning" showIcon message={t("workspace.negativeAsk")} />}
        </div>
      )}
    </>
  );
}

export function EstimatedTcePanel() {
  const { t } = useTranslation();
  const { calc } = useWorkspace();
  return (
    <section aria-label={t("sections.estimatedTce")}>
      <SectionHeader labelKey="sections.estimatedTce" />
      <div className="panel">
        {calc.status === "IDLE" ? (
          <p className="panel-empty">{t("workspace.runPrompt")}</p>
        ) : calc.status === "INCOMPLETE" ? (
          <p className="panel-empty">{t("workspace.fillIn")}</p>
        ) : (
          <SectionBoundary>
            <Cards />
          </SectionBoundary>
        )}
      </div>
    </section>
  );
}
