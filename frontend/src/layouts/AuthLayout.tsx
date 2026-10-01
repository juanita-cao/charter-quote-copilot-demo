import { Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import illustration from "../assets/login-container-ship.png";
import logoWhite from "../assets/logo-mark-white.png";
import { LanguageSwitch } from "../components/LanguageSwitch";
import { MockBanner } from "../components/MockBanner";
import { USE_MOCK } from "../config/featureFlags";

export function AuthLayout() {
  const { t } = useTranslation();
  return (
    <div className="auth-shell">
      {USE_MOCK && <MockBanner />}
      <aside className="auth-left" aria-hidden="true">
        <div className="auth-brand">
          <img src={logoWhite} alt="" height={36} />
          <span>{t("app.name")}</span>
        </div>
        <img className="auth-illustration" src={illustration} alt="" />
      </aside>
      <section className="auth-right">
        <div className="auth-topbar">
          <LanguageSwitch />
        </div>
        <div className="auth-form-wrap">
          <Outlet />
        </div>
        <footer className="app-footer">{t("footer.copyright")}</footer>
      </section>
    </div>
  );
}
