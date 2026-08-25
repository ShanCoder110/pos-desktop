import { Navigate } from "react-router-dom";
import { routes } from "@/shared/constants/routes";

export function ReorderPage() {
  return <Navigate to={routes.lots} replace />;
}
