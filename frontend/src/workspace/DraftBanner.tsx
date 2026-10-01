import { Alert, Button } from "antd";
import { useTranslation } from "react-i18next";
import { buildDraftBannerVM } from "../vm/draft";
import { useWorkspace } from "./context";

// Offers the operator's latest draft once per session. Resume does not dismiss it: the banner goes only when the
// replacement is really applied (a cancelled overwrite keeps it).
export function DraftBanner() {
  const { t, i18n } = useTranslation();
  const { latestDraft, lifecycle, dispatchLifecycle, requestLoad } = useWorkspace();
  const vm = buildDraftBannerVM(latestDraft, lifecycle.banner);
  if (!vm.visible || vm.values === null) return null;
  const when = vm.savedAtIso
    ? new Date(vm.savedAtIso).toLocaleString(i18n.language === "zh" ? "zh-CN" : "en-GB", { dateStyle: "medium", timeStyle: "short" })
    : "";
  const values = vm.values;
  return (
    <Alert
      className="draft-banner"
      type="info"
      showIcon
      message={t("draftBanner.text", { when })}
      action={
        <>
          <Button
            size="small"
            type="primary"
            onClick={() => {
              dispatchLifecycle({ type: "resumeClicked" });
              requestLoad({ source: "draft-banner", kind: "draft", values, notice: vm.notice });
            }}
          >
            {t("draftBanner.resume")}
          </Button>
          <Button size="small" onClick={() => dispatchLifecycle({ type: "dismissClicked" })}>
            {t("draftBanner.dismiss")}
          </Button>
        </>
      }
    />
  );
}
