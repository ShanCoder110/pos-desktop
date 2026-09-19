import { Navigate } from "react-router-dom";
import { AUTH_ENABLED, useSession } from "@/shared/auth/session";
import { routes } from "@/shared/constants/routes";

export function RootRedirect() {
  const { phase } = useSession();
  if (!AUTH_ENABLED) {
    return <Navigate to={routes.dashboard} replace />;
  }
  if (phase === "loading") {
    return <Navigate to={routes.login} replace />;
  }
  if (phase === "needs_setup") {
    return <Navigate to={routes.setup} replace />;
  }
  if (phase !== "authenticated") {
    return <Navigate to={routes.login} replace />;
  }
  return <Navigate to={routes.dashboard} replace />;
}
