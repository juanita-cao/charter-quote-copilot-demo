import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

// One language at a time (user decision 2026-09-20): the label is the active language only.
export function Stacked({ labelKey }: { labelKey: string }) {
  const { t } = useTranslation();
  const label = t(labelKey);
  // A trailing "(unit)" / "（单位）" never wraps in the middle: a narrow card breaks between the name and its unit.
  const m = /^(.*?)\s*([（(][^）)]*[）)])$/.exec(label);
  return (
    <span className="stacked-main">
      {m ? m[1] : label}
      {m && <span className="label-unit">{label.startsWith(m[1] + " ") ? " " : ""}{m[2]}</span>}
    </span>
  );
}

export function MetricCard({ labelKey, children, tone }: { labelKey: string; children: ReactNode; tone?: "go" | "nogo" }) {
  return (
    <div className={`metric-card${tone ? ` ${tone}` : ""}`}>
      <Stacked labelKey={labelKey} />
      <div className="metric-value">{children}</div>
    </div>
  );
}

export function DecisionPill({ decision }: { decision: "GO" | "NO-GO" }) {
  return <span className={`decision-pill ${decision === "GO" ? "go" : "nogo"}`}>● {decision}</span>;
}

export function SectionHeader({ labelKey, helpKey }: { labelKey: string; helpKey?: string }) {
  const { t } = useTranslation();
  return (
    <div className="section-header">
      <Stacked labelKey={labelKey} />
      {helpKey && (
        <span className="section-help" title={t(helpKey)} aria-label={t(helpKey)} role="img">
          ?
        </span>
      )}
    </div>
  );
}
