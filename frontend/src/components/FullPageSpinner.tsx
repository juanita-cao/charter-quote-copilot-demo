import { Button, Result, Spin } from "antd";
import { useTranslation } from "react-i18next";
import { useAuth } from "../app/contexts";

// Shown while the bootstrap probe (GET /auth/me) is unresolved — never a flash of the login page or of protected content.
export function FullPageSpinner() {
  const { t } = useTranslation();
  const { state, retryBootstrap } = useAuth();
  if (state.bootstrapError) {
    return (
      <Result
        status="warning"
        title={t("bootstrap.unreachable")}
        extra={
          <Button type="primary" onClick={retryBootstrap}>
            {t("bootstrap.retry")}
          </Button>
        }
      />
    );
  }
  return (
    <div className="full-page-center" role="status" aria-label="loading">
      <Spin size="large" />
    </div>
  );
}
