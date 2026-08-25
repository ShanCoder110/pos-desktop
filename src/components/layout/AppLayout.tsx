import { Outlet, useLocation } from "react-router-dom";
import { MgmtLayoutProvider, useMgmtLayout } from "@/components/layout/MgmtLayoutContext";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { routes } from "@/shared/constants/routes";

function ManagementShell() {
  const { collapsed } = useMgmtLayout();
  return (
    <div className={collapsed ? "mgmt-shell is-collapsed" : "mgmt-shell"}>
      <Sidebar />
      <section className="mgmt-main">
        <TopBar />
        <div className="mgmt-body">
          <Outlet />
        </div>
      </section>
    </div>
  );
}

export function AppLayout() {
  const { pathname } = useLocation();
  const isPos = pathname === routes.pos;

  if (isPos) {
    return (
      <div className="app is-pos" id="app">
        <Outlet />
      </div>
    );
  }

  return (
    <MgmtLayoutProvider>
      <ManagementShell />
    </MgmtLayoutProvider>
  );
}
