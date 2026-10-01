import { CaretRightOutlined, FileAddOutlined, QuestionCircleOutlined } from "@ant-design/icons";
import { Button, Modal, Select, Tooltip, message } from "antd";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PrecisionMode } from "../api/types";
import type { SaveStatus } from "../state/saveMachine";
import { useWorkspace } from "./context";

// Toast when an instance of the save machine settles. The first value seen (e.g. coming back to the Workspace
// after a save finished elsewhere) is not announced again.
function useSettled(status: SaveStatus, onSettled: (status: SaveStatus) => void) {
  const previous = useRef(status);
  useEffect(() => {
    if (previous.current === status) return;
    previous.current = status;
    if (status === "SAVED" || status === "FAILED_SOFT" || status === "INVALID") onSettled(status);
  });
}

// Sticky bar at the bottom of the Workspace. Run is the only thing that starts a calculation (client decision,
// 2026-09-21); the precision chosen here is the one used by that Run. Save Quote needs a calculation of the current
// inputs (READY); Save Draft is always available (PT-14).
export function ActionBar() {
  const { t } = useTranslation();
  const { calc, run, clearAll, lifecycle, precisionMode, setPrecisionMode, save, saveQuote, saveDraft } = useWorkspace();
  const [confirmingNew, setConfirmingNew] = useState(false);
  const [messageApi, messageHolder] = message.useMessage();
  const label = t("precision.label");

  useSettled(save.quote, (status) => {
    if (status === "SAVED") void messageApi.success(t("save.quoteSaved"));
    else if (status === "INVALID") void messageApi.error(save.quoteError ?? t("save.notStored"));
    else void messageApi.warning(t("save.notStored"));
  });
  useSettled(save.draft, (status) => {
    if (status === "SAVED") void messageApi.success(t("save.draftSaved"));
    else void messageApi.warning(t("save.notStored"));
  });

  const canSaveQuote = calc.status === "READY" && save.quote !== "SAVING";
  return (
    <div className="action-bar" role="toolbar" aria-label={t("run.toolbar")}>
      {messageHolder}
      <div className="action-group">
        <Button icon={<FileAddOutlined aria-hidden />} onClick={() => (lifecycle.dirty ? setConfirmingNew(true) : clearAll())}>
          {t("newQuote.button")}
        </Button>
        <span className="action-label">
          {label}
          <Tooltip title={t("precision.help")} overlayStyle={{ maxWidth: 420 }}>
            <QuestionCircleOutlined className="action-help" aria-label={t("precision.help")} />
          </Tooltip>
        </span>
        <Select<PrecisionMode>
          aria-label={label}
          style={{ minWidth: 200 }}
          value={precisionMode}
          onChange={setPrecisionMode}
          options={[
            { value: "display", label: t("precision.display") },
            { value: "full", label: t("precision.full") },
          ]}
        />
        <Button type="primary" icon={<CaretRightOutlined aria-hidden />} loading={calc.status === "CALCULATING"} onClick={run}>
          {t("run.button")}
        </Button>
      </div>
      <div className="action-group" role="group" aria-label={t("save.toolbar")}>
        <Button onClick={saveDraft} loading={save.draft === "SAVING"}>
          {t("save.draft")}
        </Button>
        <Tooltip title={calc.status === "READY" ? undefined : t("save.needRun")}>
          <span>
            <Button type="primary" disabled={!canSaveQuote} loading={save.quote === "SAVING"} onClick={saveQuote}>
              {t("save.quote")}
            </Button>
          </span>
        </Tooltip>
      </div>
      <Modal
        open={confirmingNew}
        title={t("newQuote.title")}
        okText={t("newQuote.ok")}
        cancelText={t("newQuote.cancel")}
        onOk={() => {
          setConfirmingNew(false);
          clearAll();
        }}
        onCancel={() => setConfirmingNew(false)}
        maskClosable={false}
      >
        {t("newQuote.body")}
      </Modal>
    </div>
  );
}
