import { Navigate, Outlet } from "react-router-dom";
import { AUTH_ENABLED, useSession } from "@/shared/auth/session";
import { routes } from "@/shared/constants/routes";

export function RequireAuth() {
  const { phase } = useSession();
  if (!AUTH_ENABLED) return <Outlet />;
  if (phase === "loading") {
    return (
      <div className="auth-loading [height:100%] [display:grid] [place-items:center] [color:var(--muted)] [font-size:14px]">
        Loading…
      </div>
    );
  }
  if (phase === "needs_setup") {
    return <Navigate to={routes.setup} replace />;
  }
  if (phase !== "authenticated") {
    return <Navigate to={routes.login} replace />;
  }
  return <Outlet />;
}
