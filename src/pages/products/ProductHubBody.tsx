import { useProductsHub } from "@/pages/products/ProductsLayout";
import { CategoriesPage } from "@/pages/products/CategoriesPage";
import { ProductsPage } from "@/pages/products/ProductsPage";
import { LotsPage } from "@/pages/lots/LotsPage";
import { UnitsPage } from "@/pages/units/UnitsPage";
import { TransfersPage } from "@/pages/transfers/TransfersPage";

export function ProductHubBody() {
  const { section } = useProductsHub();
  if (section === "lots") return <LotsPage />;
  if (section === "units") return <UnitsPage />;
  if (section === "categories") return <CategoriesPage />;
  if (section === "transfers") return <TransfersPage />;
  return <ProductsPage />;
}
