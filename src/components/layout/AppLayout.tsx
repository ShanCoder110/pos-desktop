import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";

export function AppLayout() {
  const { pathname } = useLocation();
  const isPos = pathname === "/pos";

  if (isPos) {
    return (
      <div className="app" id="app">
        <Sidebar />
        <Outlet />
      </div>
    );
  }

  return (
    <div className="app is-page" id="app">
      <Sidebar />
      <section className="app-page">
        <TopBar />
        <div className="page-body" style={{ paddingTop: 0 }}>
          <Outlet />
        </div>
      </section>
    </div>
  );
}
