import { InputNumber } from "antd";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useApi } from "../app/contexts";
import { DecisionPill, SectionHeader, Stacked } from "../components/MetricCard";
import { useRiskScenarios } from "../hooks/queries";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { buildRiskRowsVM } from "../vm/risk";
import { SectionBoundary } from "./SectionBoundary";
import { useWorkspace } from "./context";
import { money, percent, signedMoney } from "./format";

const DELTA_DEBOUNCE_MS = 400;
const COLUMNS = ["risk.scenario", "risk.adjust", "risk.estTce", "risk.tceImpact", "risk.margin", "risk.decision"] as const;

function Body() {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const { calc, calcBody, runPrecision } = useWorkspace();
  const stale = calc.status === "STALE";
  const [edits, setEdits] = useState<Record<string, number>>({});
  const debounced = useDebouncedValue(edits, DELTA_DEBOUNCE_MS);
  const deltas = useMemo(() => (Object.keys(debounced).length > 0 ? debounced : undefined), [debounced]);

  const q = useRiskScenarios(api, calc.seq, calcBody, deltas, runPrecision);
  const rows = useMemo(() => (q.data ? buildRiskRowsVM(q.data, i18n.language === "zh" ? "zh" : "en") : []), [q.data, i18n.language]);
  const error = q.isError && !q.isPlaceholderData ? q.error : null;

  return (
    <>
      {error && <p className="panel-empty" role="alert">{error.message}</p>}
      {rows.length > 0 && (
        <table className={stale ? "risk-table verdict stale" : "risk-table"} data-testid="risk">
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c} scope="col">
                  <Stacked labelKey={c} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} data-testid={`risk-row-${r.key}`}>
                <th scope="row">
                  {r.name}
                </th>
                <td>
                  {r.isBase ? (
                    "—"
                  ) : (
                    <InputNumber
                      aria-label={`${r.name} ${t("risk.adjust")}`}
                      size="small"
                      disabled={stale}
                      step={r.deltaStep}
                      value={edits[r.key] ?? r.delta}
                      onChange={(v) =>
                        setEdits((e) => {
                          const next = { ...e };
                          if (typeof v === "number") next[r.key] = v;
                          else delete next[r.key];
                          return next;
                        })
                      }
                    />
                  )}
                </td>
                <td className="num">{money(r.tce)}</td>
                <td className="num">{signedMoney(r.tceImpact)}</td>
                <td className="num">{percent(r.marginPct)}</td>
                <td>
                  <DecisionPill decision={r.decision} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

export function RiskPanel() {
  const { t } = useTranslation();
  return (
    <section aria-label={t("sections.riskAnalysis")}>
      <SectionHeader labelKey="sections.riskAnalysis" />
      <div className="panel">
        <SectionBoundary>
          <Body />
        </SectionBoundary>
      </div>
    </section>
  );
}
