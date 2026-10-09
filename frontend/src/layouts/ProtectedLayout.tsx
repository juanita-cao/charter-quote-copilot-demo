import {
  BarChartOutlined,
  CalculatorOutlined,
  DownOutlined,
  HistoryOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  QuestionCircleOutlined,
  ReadOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Alert, Button, Dropdown, Tooltip, message } from "antd";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, NavLink, Outlet } from "react-router-dom";
import logoDark from "../assets/logo-mark-dark.png";
import { useApi, useAuth } from "../app/contexts";
import { LanguageSwitch } from "../components/LanguageSwitch";
import { MockBanner } from "../components/MockBanner";
import { USE_MOCK } from "../config/featureFlags";
import { useLogout } from "../hooks/mutations";
import { loadUiPrefs, saveUiPrefs } from "../prefs/uiPrefs";
import { buildAccountVM } from "../vm/draft";
import { WorkspaceProvider } from "../workspace/WorkspaceProvider";

function AppHeader() {
  const { t } = useTranslation();
  const api = useApi();
  const { me, dispatch } = useAuth();
  const logout = useLogout(api);
  const account = buildAccountVM(me);

  const onLogout = () =>
    logout.mutate(undefined, {
      onSuccess: () => dispatch({ type: "logoutSucceeded" }),
      onError: () => {
        dispatch({ type: "logoutFailed" });
        void message.error(t("header.logoutFailed"));
      },
    });

  return (
    <header className="app-header">
      <Link to="/workspace" className="app-header-brand">
        <img src={logoDark} alt="" height={32} />
        <span>{t("app.name")}</span>
      </Link>
      <div className="app-header-actions">
        <LanguageSwitch />
        <Link to="/guide" aria-label={t("header.help")} className="app-header-icon">
          <QuestionCircleOutlined />
        </Link>
        <Dropdown
          trigger={["click"]}
          menu={{ items: [{ key: "logout", icon: <LogoutOutlined />, label: t("header.logout"), onClick: onLogout }] }}
        >
          <Button type="text" aria-label={t("header.account")}>
            <UserOutlined /> <span className="app-account-label">{account.label}</span> <DownOutlined />
          </Button>
        </Dropdown>
      </div>
    </header>
  );
}

const NAV: { to: string; key: string; icon: ReactNode; requires: "dashboards" | null }[] = [
  { to: "/workspace", key: "nav.workspace", icon: <CalculatorOutlined />, requires: null },
  { to: "/history", key: "nav.history", icon: <HistoryOutlined />, requires: null },
  { to: "/dashboards", key: "nav.dashboards", icon: <BarChartOutlined />, requires: "dashboards" },
  { to: "/guide", key: "nav.guide", icon: <ReadOutlined />, requires: null },
];

// Dashboards is a planned paid feature (design_backend.md §24, T2.35) — hiding the nav item
// for an ineligible company is a UX convenience only; the backend routes enforce the same
// DASHBOARDS_ELIGIBLE_COMPANY_IDS allow-list independently, so this is never the real gate.
function Sidebar({
  collapsed,
  onToggle,
  dashboardsEligible,
}: {
  collapsed: boolean;
  onToggle: () => void;
  dashboardsEligible: boolean;
}) {
  const { t } = useTranslation();
  const items = NAV.filter((item) => item.requires !== "dashboards" || dashboardsEligible);
  return (
    <nav className={`app-sidebar${collapsed ? " collapsed" : ""}`} aria-label="main">
      <ul>
        {items.map((item) => (
          <li key={item.to}>
            <Tooltip title={collapsed ? t(item.key) : undefined} placement="right">
              <NavLink to={item.to} className={({ isActive }) => `app-nav-item${isActive ? " active" : ""}`}>
                {item.icon}
                {!collapsed && <span>{t(item.key)}</span>}
              </NavLink>
            </Tooltip>
          </li>
        ))}
      </ul>
      <Button
        size="small"
        className="app-sidebar-toggle"
        aria-label={collapsed ? t("nav.expand") : t("nav.collapse")}
        icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
        onClick={onToggle}
      />
    </nav>
  );
}

const NARROW_QUERY = "(max-width: 991.98px)"; // Ant Design's `lg` breakpoint is 992px

function useNarrowScreen(): boolean {
  const query = () => (typeof window.matchMedia === "function" ? window.matchMedia(NARROW_QUERY) : null);
  const [narrow, setNarrow] = useState(() => query()?.matches ?? false);
  useEffect(() => {
    const mq = query();
    if (!mq) return;
    const onChange = (e: MediaQueryListEvent) => setNarrow(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return narrow;
}

export function ProtectedLayout() {
  const { t } = useTranslation();
  const { state, me } = useAuth();
  const [preferCollapsed, setPreferCollapsed] = useState(() => loadUiPrefs().sidebarCollapsed);
  const narrow = useNarrowScreen();
  const collapsed = preferCollapsed || narrow; // below `lg` the rail is forced, without overwriting the saved preference
  const toggle = () => {
    setPreferCollapsed((c) => {
      saveUiPrefs({ sidebarCollapsed: !c });
      return !c;
    });
  };

  return (
    <WorkspaceProvider>
      <div className="app-shell">
        {USE_MOCK && <MockBanner />}
        <AppHeader />
        <div className="app-body">
          <Sidebar collapsed={collapsed} onToggle={toggle} dashboardsEligible={me?.dashboards_eligible ?? false} />
          <main className="app-main" tabIndex={-1}>
            {state.authUnavailable && <Alert type="warning" showIcon banner message={t("banner.authUnavailable")} />}
            <div className="app-content">
              <Outlet />
            </div>
            <footer className="app-footer">
          <div>{t("footer.aiNotice")}</div>
          <div style={{ marginTop: 4 }}>{t("footer.copyright")}</div>
        </footer>
          </main>
        </div>
      </div>
    </WorkspaceProvider>
  );
}
