import { Modal } from "antd";
import { useTranslation } from "react-i18next";
import { useWorkspace } from "./context";

// The overwrite guard (OQ-1): loading a quote or draft over a form with unsaved edits asks first. It lives with the
// provider, so it works from the Workspace and, later, from History.
export function ReplaceModal() {
  const { t } = useTranslation();
  const { lifecycle, confirmReplace, cancelReplace } = useWorkspace();
  return (
    <Modal
      open={lifecycle.pendingLoad !== null}
      title={t("replace.title")}
      okText={t("replace.ok")}
      cancelText={t("replace.cancel")}
      onOk={confirmReplace}
      onCancel={cancelReplace}
      maskClosable={false}
    >
      {t("replace.body")}
    </Modal>
  );
}
