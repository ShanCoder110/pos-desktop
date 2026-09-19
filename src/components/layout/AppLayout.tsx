import { Outlet, useLocation } from "react-router-dom";
import { MgmtLayoutProvider, useMgmtLayout } from "@/components/layout/MgmtLayoutContext";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { routes } from "@/shared/constants/routes";

function ManagementShell() {
  const { collapsed } = useMgmtLayout();
  return (
    <div
      className={
        collapsed
          ? "mgmt-shell [--mgmt-sidebar-w:210px] [height:100%] [min-height:0] [overflow:hidden] [display:grid] [grid-template-columns:var(--mgmt-sidebar-w)_minmax(0,_1fr)] [background:var(--shell)] [transition:grid-template-columns_0.22s_ease] is-collapsed"
          : "mgmt-shell [--mgmt-sidebar-w:210px] [height:100%] [min-height:0] [overflow:hidden] [display:grid] [grid-template-columns:var(--mgmt-sidebar-w)_minmax(0,_1fr)] [background:var(--shell)] [transition:grid-template-columns_0.22s_ease]"
      }
    >
      <Sidebar />
      <section className="mgmt-main [display:flex] [flex-direction:column] [min-width:0] [min-height:0]">
        <TopBar />
        <div className="mgmt-body [padding-left:20px] [padding-right:20px] [flex:1] [min-height:0] [overflow:hidden] [padding-top:16px] [padding-bottom:16px] [display:flex] [flex-direction:column]">
          <Outlet />
        </div>
      </section>
    </div>
  );
}

export function AppLayout() {
  const { pathname } = useLocation();
  const isPos = pathname === routes.pos || pathname.endsWith("/pos");

  if (isPos) {
    return (
      <div
        className="app is-pos [height:100%] [min-height:0] [display:grid] [grid-template-columns:minmax(0,_1fr)] [grid-template-rows:minmax(0,_1fr)_40px] [overflow:hidden]"
        id="app"
      >
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
