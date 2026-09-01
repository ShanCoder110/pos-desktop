import { routes } from "@/shared/constants/routes";

export const SALES_SECTION_TABS = [
  { id: "invoices", to: routes.sales, label: "Invoices", end: true },
  { id: "products", to: routes.salesProducts, label: "Sales" },
  { id: "returns", to: routes.salesReturns, label: "Returns" },
  { id: "claims", to: routes.salesClaims, label: "Claims" },
] as const;
