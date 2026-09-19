import { Navigate } from "react-router-dom";
import { productsHref } from "@/shared/constants/products";

export function ReorderPage() {
  return <Navigate to={productsHref("lots")} replace />;
}
