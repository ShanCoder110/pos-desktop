import { lazy, Suspense } from "react";
import { useProductsHub } from "@/pages/products/ProductsLayout";

const CategoriesPage = lazy(() =>
  import("@/pages/products/CategoriesPage").then((m) => ({ default: m.CategoriesPage })),
);
const ProductSuppliersPage = lazy(() =>
  import("@/pages/products/ProductSuppliersPage").then((m) => ({
    default: m.ProductSuppliersPage,
  })),
);
const ProductsPage = lazy(() =>
  import("@/pages/products/ProductsPage").then((m) => ({ default: m.ProductsPage })),
);
const LotsPage = lazy(() => import("@/pages/lots/LotsPage").then((m) => ({ default: m.LotsPage })));
const UnitsPage = lazy(() =>
  import("@/pages/units/UnitsPage").then((m) => ({ default: m.UnitsPage })),
);
const TransfersPage = lazy(() =>
  import("@/pages/transfers/TransfersPage").then((m) => ({ default: m.TransfersPage })),
);
const ReordersPage = lazy(() =>
  import("@/pages/reorders/ReordersPage").then((m) => ({ default: m.ReordersPage })),
);

export function ProductHubBody() {
  const { section } = useProductsHub();
  const page =
    section === "lots" ? (
      <LotsPage />
    ) : section === "units" ? (
      <UnitsPage />
    ) : section === "categories" ? (
      <CategoriesPage />
    ) : section === "suppliers" ? (
      <ProductSuppliersPage />
    ) : section === "transfers" ? (
      <TransfersPage />
    ) : section === "reorders" ? (
      <ReordersPage />
    ) : (
      <ProductsPage />
    );
  return (
    <Suspense
      fallback={
        <div role="status" className="p-4 text-sm text-muted">
          Loading section…
        </div>
      }
    >
      {page}
    </Suspense>
  );
}
