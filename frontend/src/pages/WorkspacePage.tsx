import { Alert } from "antd";
import { useTranslation } from "react-i18next";
import { ActionBar } from "../workspace/ActionBar";
import { DraftBanner } from "../workspace/DraftBanner";
import { EnquiryBox } from "../workspace/EnquiryBox";
import { PreviousQuoteSearch } from "../workspace/PreviousQuoteSearch";
import { EstimatedTcePanel } from "../workspace/EstimatedTcePanel";
import { ReverseQuotePanel } from "../workspace/ReverseQuotePanel";
import { RiskPanel } from "../workspace/RiskPanel";
import { WorkspaceForm } from "../workspace/WorkspaceForm";
import { useWorkspace } from "../workspace/context";

export function WorkspacePage() {
  const { t } = useTranslation();
  const { calc, verdictData, loadNotice, dismissLoadNotice } = useWorkspace();
  // The sandbox and the risk table need a calculated result: before the first Run (or after a Run on an incomplete
  // form) only the prompt in "Estimated TCE" is shown.
  const calculated = verdictData !== undefined && calc.status !== "IDLE" && calc.status !== "INCOMPLETE";
  return (
    <>
      <DraftBanner />
      {loadNotice && <Alert className="load-notice" type="info" showIcon closable onClose={dismissLoadNotice} message={t(`notice.${loadNotice}`)} />}
      <div className="workspace">
        <div className="workspace-inputs" role="region" aria-label={t("regions.inputs")} tabIndex={0}>
          <EnquiryBox />
          <PreviousQuoteSearch />
          <WorkspaceForm />
        </div>
        <div className="workspace-results" role="region" aria-label={t("regions.results")} tabIndex={0}>
          <EstimatedTcePanel />
          {calculated && <ReverseQuotePanel />}
          {calculated && <RiskPanel />}
        </div>
      </div>
      <ActionBar />
    </>
  );
}
