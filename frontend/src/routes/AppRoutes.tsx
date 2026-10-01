import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "../app/contexts";
import { FullPageSpinner } from "../components/FullPageSpinner";
import { AuthLayout } from "../layouts/AuthLayout";
import { ProtectedLayout } from "../layouts/ProtectedLayout";
import { HelpPage } from "../help/HelpPage";
import { DashboardsPage } from "../dashboards/DashboardsPage";
import { HistoryPage } from "../history/HistoryPage";
import { LoginPage } from "../pages/LoginPage";
import { WorkspacePage } from "../pages/WorkspacePage";
import { RegisterPage } from "../pages/RegisterPage";
import { routeGuard } from "./routeGuard";

// One decision point for every route (F-Route-Guard, §6.1).
function Gate() {
  const { state } = useAuth();
  const { pathname } = useLocation();
  switch (routeGuard(state.status, pathname)) {
    case "SPINNER":
      return <FullPageSpinner />;
    case "REDIRECT_LOGIN":
      return <Navigate to="/login" replace />;
    case "REDIRECT_WORKSPACE":
      return <Navigate to="/workspace" replace />;
    case "RENDER":
      return <Outlet />;
  }
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Gate />}>
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Route>
        <Route element={<ProtectedLayout />}>
          <Route path="/" element={<WorkspacePage />} />
          <Route path="/workspace" element={<WorkspacePage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/dashboards" element={<DashboardsPage />} />
          <Route path="/guide" element={<HelpPage />} />
        </Route>
        <Route path="*" element={null} />
      </Route>
    </Routes>
  );
}
