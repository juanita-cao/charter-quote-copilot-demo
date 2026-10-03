import { Outlet } from "react-router-dom";
import logoWhite from "../assets/logo-mark-white.png";
import { useTranslation } from "react-i18next";
import { LanguageSwitch } from "../components/LanguageSwitch";
import { MockBanner } from "../components/MockBanner";
import { USE_MOCK } from "../config/featureFlags";

export function AuthLayout() {
  const { t } = useTranslation();
  return (
    <div className="auth-shell">
      {USE_MOCK && <MockBanner />}
      <div className="auth-bg" aria-hidden="true">
        <video autoPlay muted loop playsInline poster="/videos/login-bg-poster.jpg">
          <source src="/videos/login-bg.mp4" type="video/mp4" />
        </video>
        <div className="auth-bg-overlay" />
      </div>
      <header className="auth-topbar">
        <div className="auth-brand">
          <img src={logoWhite} alt="" height={28} />
          <span>{t("app.name")}</span>
        </div>
        <LanguageSwitch />
      </header>
      <main className="auth-center">
        <div className="auth-card">
          <Outlet />
        </div>
      </main>
      <footer className="app-footer">{t("footer.copyright")}</footer>
    </div>
  );
}
