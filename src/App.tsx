import { useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth } from "@/components/common/auth/RequireAuth";
import { RootRedirect } from "@/components/common/auth/RootRedirect";
import { SessionProvider } from "@/components/common/auth/SessionProvider";
import { AppLayout } from "@/components/layout/AppLayout";
import { AnalyticsPage } from "@/pages/analytics/AnalyticsPage";
import { CreditSalesPage } from "@/pages/credit/CreditSalesPage";
import { CustomersPage } from "@/pages/customers/CustomersPage";
import { DashboardPage } from "@/pages/dashboard/DashboardPage";
import { EmployeesPage } from "@/pages/employees/EmployeesPage";
import { UsersPage } from "@/pages/users/UsersPage";
import { ExpensesPage } from "@/pages/expenses/ExpensesPage";
import { InvoicesPage } from "@/pages/invoices/InvoicesPage";
import { LoginPage } from "@/pages/login/LoginPage";
import { PosPage } from "@/pages/pos/PosPage";
import { ProductHubBody } from "@/pages/products/ProductHubBody";
import { ProductsLayout } from "@/pages/products/ProductsLayout";
import { RepairPage } from "@/pages/repair/RepairPage";
import { ClaimsPage } from "@/pages/sales/ClaimsPage";
import { ProductSalesPage } from "@/pages/sales/ProductSalesPage";
import { SalesLayout } from "@/pages/sales/SalesLayout";
import { ReturnsPage } from "@/pages/returns/ReturnsPage";
import { SettingsLayout } from "@/pages/settings/SettingsLayout";
import { DevicesSection } from "@/pages/settings/sections/DevicesSection";
import { LocalizationSection } from "@/pages/settings/sections/LocalizationSection";
import { PrinterSection } from "@/pages/settings/sections/PrinterSection";
import { ProductsSection } from "@/pages/settings/sections/ProductsSection";
import { ProfileSection } from "@/pages/settings/sections/ProfileSection";
import { ReceiptSection } from "@/pages/settings/sections/ReceiptSection";
import { SyncSection } from "@/pages/settings/sections/SyncSection";
import { SetupPage } from "@/pages/setup/SetupPage";
import { ShopsPage } from "@/pages/shops/ShopsPage";
import { SuppliersPage } from "@/pages/suppliers/SuppliersPage";
import { TransactionsPage } from "@/pages/transactions/TransactionsPage";
import { TrashPage } from "@/pages/trash/TrashPage";
import { productsHref } from "@/shared/constants/products";
import { routes } from "@/shared/constants/routes";
import { defaultSettings, SettingsContext } from "@/shared/settings";
import type { ShopSettings } from "@/shared/types";

export default function App() {
  const [settings, setSettings] = useState<ShopSettings>(defaultSettings);

  return (
    <SettingsContext.Provider value={{ settings, setSettings }}>
      <SessionProvider>
        <BrowserRouter>
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
                <Route path="/products/stock" element={<Navigate to={routes.products} replace />} />
                <Route path="/products/sold" element={<Navigate to={routes.products} replace />} />
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
                  element={<Navigate to={productsHref("lots")} replace />}
                />
                <Route path={routes.suppliers} element={<SuppliersPage />} />
                <Route path={routes.trash} element={<TrashPage />} />
                <Route path={routes.customers} element={<CustomersPage />} />
                <Route path={routes.employees} element={<EmployeesPage />} />
                <Route path={routes.users} element={<UsersPage />} />
                <Route path={routes.production} element={<RepairPage />} />
                <Route path={routes.repair} element={<RepairPage />} />
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
        </BrowserRouter>
      </SessionProvider>
    </SettingsContext.Provider>
  );
}
