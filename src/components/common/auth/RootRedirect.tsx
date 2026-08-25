import { Navigate } from "react-router-dom";
import { AUTH_ENABLED, useSession } from "@/shared/auth/session";
import { routes } from "@/shared/constants/routes";

export function RootRedirect() {
  const { session } = useSession();
  if (!AUTH_ENABLED) {
    return <Navigate to={routes.dashboard} replace />;
  }
  if (!session.shop || !session.owner) {
    return <Navigate to={routes.setup} replace />;
  }
  if (!session.loggedIn) {
    return <Navigate to={routes.login} replace />;
  }
  return <Navigate to={routes.dashboard} replace />;
}
