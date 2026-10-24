import { lazy, Suspense, useCallback, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth } from "@/components/common/auth/RequireAuth";
import { AppUpdateAgent } from "@/components/common/AppUpdateAgent";
import { RootRedirect } from "@/components/common/auth/RootRedirect";
import { SessionProvider } from "@/components/common/auth/SessionProvider";
import { AppLayout } from "@/components/layout/AppLayout";
const AnalyticsPage = lazy(() =>
  import("@/pages/analytics/AnalyticsPage").then((m) => ({ default: m.AnalyticsPage })),
);
const CreditCustomerPage = lazy(() =>
  import("@/pages/credit/CreditCustomerPage").then((m) => ({ default: m.CreditCustomerPage })),
);
const CreditSalesPage = lazy(() =>
  import("@/pages/credit/CreditSalesPage").then((m) => ({ default: m.CreditSalesPage })),
);
const CustomersPage = lazy(() =>
  import("@/pages/customers/CustomersPage").then((m) => ({ default: m.CustomersPage })),
);
const DashboardPage = lazy(() =>
  import("@/pages/dashboard/DashboardPage").then((m) => ({ default: m.DashboardPage })),
);
const EmployeesPage = lazy(() =>
  import("@/pages/employees/EmployeesPage").then((m) => ({ default: m.EmployeesPage })),
);
const UsersPage = lazy(() =>
  import("@/pages/users/UsersPage").then((m) => ({ default: m.UsersPage })),
);
const ExpensesPage = lazy(() =>
  import("@/pages/expenses/ExpensesPage").then((m) => ({ default: m.ExpensesPage })),
);
const InvoicesPage = lazy(() =>
  import("@/pages/invoices/InvoicesPage").then((m) => ({ default: m.InvoicesPage })),
);
const LoginPage = lazy(() =>
  import("@/pages/login/LoginPage").then((m) => ({ default: m.LoginPage })),
);
const PosPage = lazy(() => import("@/pages/pos/PosPage").then((m) => ({ default: m.PosPage })));
const ProductHubBody = lazy(() =>
  import("@/pages/products/ProductHubBody").then((m) => ({ default: m.ProductHubBody })),
);
const ProductsLayout = lazy(() =>
  import("@/pages/products/ProductsLayout").then((m) => ({ default: m.ProductsLayout })),
);
const RepairPage = lazy(() =>
  import("@/pages/repair/RepairPage").then((m) => ({ default: m.RepairPage })),
);
const ClaimsPage = lazy(() =>
  import("@/pages/sales/ClaimsPage").then((m) => ({ default: m.ClaimsPage })),
);
const ProductSalesPage = lazy(() =>
  import("@/pages/sales/ProductSalesPage").then((m) => ({ default: m.ProductSalesPage })),
);
const SalesLayout = lazy(() =>
  import("@/pages/sales/SalesLayout").then((m) => ({ default: m.SalesLayout })),
);
const ReturnsPage = lazy(() =>
  import("@/pages/returns/ReturnsPage").then((m) => ({ default: m.ReturnsPage })),
);
const SettingsLayout = lazy(() =>
  import("@/pages/settings/SettingsLayout").then((m) => ({ default: m.SettingsLayout })),
);
const DevicesSection = lazy(() =>
  import("@/pages/settings/sections/DevicesSection").then((m) => ({ default: m.DevicesSection })),
);
const LocalizationSection = lazy(() =>
  import("@/pages/settings/sections/LocalizationSection").then((m) => ({
    default: m.LocalizationSection,
  })),
);
const PrinterSection = lazy(() =>
  import("@/pages/settings/sections/PrinterSection").then((m) => ({ default: m.PrinterSection })),
);
const ProductsSection = lazy(() =>
  import("@/pages/settings/sections/ProductsSection").then((m) => ({ default: m.ProductsSection })),
);
const ProfileSection = lazy(() =>
  import("@/pages/settings/sections/ProfileSection").then((m) => ({ default: m.ProfileSection })),
);
const ReceiptSection = lazy(() =>
  import("@/pages/settings/sections/ReceiptSection").then((m) => ({ default: m.ReceiptSection })),
);
const SyncSection = lazy(() =>
  import("@/pages/settings/sections/SyncSection").then((m) => ({ default: m.SyncSection })),
);
const SetupPage = lazy(() =>
  import("@/pages/setup/SetupPage").then((m) => ({ default: m.SetupPage })),
);
const ShopsPage = lazy(() =>
  import("@/pages/shops/ShopsPage").then((m) => ({ default: m.ShopsPage })),
);
const SuppliersPage = lazy(() =>
  import("@/pages/suppliers/SuppliersPage").then((m) => ({ default: m.SuppliersPage })),
);
const TransactionsPage = lazy(() =>
  import("@/pages/transactions/TransactionsPage").then((m) => ({ default: m.TransactionsPage })),
);
const TrashPage = lazy(() =>
  import("@/pages/trash/TrashPage").then((m) => ({ default: m.TrashPage })),
);
import { productsHref } from "@/shared/constants/products";
import { routes } from "@/shared/constants/routes";
import { defaultSettings, SettingsContext } from "@/shared/settings";
import type { ShopSettings } from "@/shared/types";

export default function App() {
  const [settings, setSettingsState] = useState<ShopSettings>(() => {
    try {
      const saved = window.localStorage.getItem("dukan:shop-settings");
      return saved
        ? { ...defaultSettings, ...(JSON.parse(saved) as Partial<ShopSettings>) }
        : defaultSettings;
    } catch {
      return defaultSettings;
    }
  });
  const setSettings = useCallback((next: ShopSettings) => {
    setSettingsState(next);
    window.localStorage.setItem("dukan:shop-settings", JSON.stringify(next));
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, setSettings }}>
      <AppUpdateAgent />
      <SessionProvider>
        <BrowserRouter>
          <Suspense
            fallback={
              <div role="status" className="p-6 text-sm text-muted">
                Loading…
              </div>
            }
          >
            <Routes>
              <Route path={routes.setup} element={<SetupPage />} />
              <Route path={routes.login} element={<LoginPage />} />
              <Route element={<RequireAuth />}>
                <Route element={<AppLayout />}>
                  <Route path={routes.dashboard} element={<DashboardPage />} />
                  <Route path={routes.pos} element={<PosPage />} />
                  <Route path={routes.sales} element={<SalesLayout />}>
                    <Route index element={<InvoicesPage />} />
                    <Route path="returns" element={<ReturnsPage />} />
                    <Route path="claims" element={<ClaimsPage />} />
                    <Route path="products" element={<ProductSalesPage />} />
                  </Route>
                  <Route path={routes.invoices} element={<Navigate to={routes.sales} replace />} />
                  <Route path={routes.credit} element={<CreditSalesPage />} />
                  <Route path={`${routes.credit}/:customerId`} element={<CreditCustomerPage />} />
                  <Route
                    path={routes.returns}
                    element={<Navigate to={routes.salesReturns} replace />}
                  />
                  <Route
                    path={routes.productsClaims}
                    element={<Navigate to={routes.salesClaims} replace />}
                  />
                  <Route path={routes.products} element={<ProductsLayout />}>
                    <Route index element={<ProductHubBody />} />
                  </Route>
                  <Route path="/stock" element={<Navigate to={routes.products} replace />} />
                  <Route
                    path="/products/stock"
                    element={<Navigate to={routes.products} replace />}
                  />
                  <Route
                    path="/products/sold"
                    element={<Navigate to={routes.products} replace />}
                  />
                  <Route
                    path="/products/lots"
                    element={<Navigate to={productsHref("lots")} replace />}
                  />
                  <Route
                    path="/products/units"
                    element={<Navigate to={productsHref("units")} replace />}
                  />
                  <Route
                    path="/products/categories"
                    element={<Navigate to={productsHref("categories")} replace />}
                  />
                  <Route
                    path="/products/transfers"
                    element={<Navigate to={productsHref("transfers")} replace />}
                  />
                  <Route
                    path="/products/low"
                    element={<Navigate to={productsHref("low")} replace />}
                  />
                  <Route path="/lots" element={<Navigate to={productsHref("lots")} replace />} />
                  <Route path="/units" element={<Navigate to={productsHref("units")} replace />} />
                  <Route
                    path="/transfers"
                    element={<Navigate to={productsHref("transfers")} replace />}
                  />
                  <Route
                    path={routes.categories}
                    element={<Navigate to={productsHref("categories")} replace />}
                  />
                  <Route
                    path={routes.reorder}
                    element={<Navigate to={productsHref("reorders")} replace />}
                  />
                  <Route path={routes.suppliers} element={<SuppliersPage />} />
                  <Route path={routes.trash} element={<TrashPage />} />
                  <Route path={routes.customers} element={<CustomersPage />} />
                  <Route path={routes.employees} element={<EmployeesPage />} />
                  <Route path={routes.users} element={<UsersPage />} />
                  <Route path={routes.production} element={<RepairPage />} />
                  <Route path={routes.repair} element={<RepairPage />} />
                  <Route path={`${routes.repair}/:repairShopId`} element={<RepairPage />} />
                  <Route path={routes.expenses} element={<ExpensesPage />} />
                  <Route path={routes.transactions} element={<TransactionsPage />} />
                  <Route path={routes.shops} element={<ShopsPage />} />
                  <Route path={routes.reports} element={<AnalyticsPage />} />
                  <Route path={routes.analytics} element={<AnalyticsPage />} />
                  <Route path={routes.settings} element={<SettingsLayout />}>
                    <Route index element={<ProfileSection />} />
                    <Route path="receipt" element={<ReceiptSection />} />
                    <Route path="products" element={<ProductsSection />} />
                    <Route path="localization" element={<LocalizationSection />} />
                    <Route path="printer" element={<PrinterSection />} />
                    <Route path="devices" element={<DevicesSection />} />
                    <Route path="sync" element={<SyncSection />} />
                  </Route>
                </Route>
              </Route>
              <Route path="*" element={<RootRedirect />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </SessionProvider>
    </SettingsContext.Provider>
  );
}
