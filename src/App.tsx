import { useState } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth } from "@/components/common/auth/RequireAuth";
import { RootRedirect } from "@/components/common/auth/RootRedirect";
import { SessionProvider } from "@/components/common/auth/SessionProvider";
import { AppLayout } from "@/components/layout/AppLayout";
import { AnalyticsPage } from "@/pages/analytics/AnalyticsPage";
import { CreditSalesPage } from "@/pages/credit/CreditSalesPage";
import { CustomersPage } from "@/pages/customers/CustomersPage";
import { DashboardPage } from "@/pages/dashboard/DashboardPage";
import { EmployeesPage } from "@/pages/employees/EmployeesPage";
import { ExpensesPage } from "@/pages/expenses/ExpensesPage";
import { InvoicesPage } from "@/pages/invoices/InvoicesPage";
import { LoginPage } from "@/pages/login/LoginPage";
import { LotsPage } from "@/pages/lots/LotsPage";
import { PosPage } from "@/pages/pos/PosPage";
import { ProductsPage } from "@/pages/products/ProductsPage";
import { RepairPage } from "@/pages/repair/RepairPage";
import { ReturnsPage } from "@/pages/returns/ReturnsPage";
import { SettingsPage } from "@/pages/settings/SettingsPage";
import { SetupPage } from "@/pages/setup/SetupPage";
import { ShopsPage } from "@/pages/shops/ShopsPage";
import { StockPage } from "@/pages/stock/StockPage";
import { SuppliersPage } from "@/pages/suppliers/SuppliersPage";
import { TransactionsPage } from "@/pages/transactions/TransactionsPage";
import { TransfersPage } from "@/pages/transfers/TransfersPage";
import { UnitsPage } from "@/pages/units/UnitsPage";
import { routes } from "@/shared/constants/routes";
import { defaultSettings, SettingsContext } from "@/shared/settings";
import type { ShopSettings } from "@/shared/types";

export default function App() {
  const [settings, setSettings] = useState<ShopSettings>(defaultSettings);

  return (
    <SettingsContext.Provider value={{ settings, setSettings }}>
      <SessionProvider>
        <HashRouter>
          <Routes>
            <Route path={routes.setup} element={<SetupPage />} />
            <Route path={routes.login} element={<LoginPage />} />
            <Route element={<RequireAuth />}>
              <Route element={<AppLayout />}>
                <Route path={routes.dashboard} element={<DashboardPage />} />
                <Route path={routes.pos} element={<PosPage />} />
                <Route path={routes.invoices} element={<InvoicesPage />} />
                <Route path={routes.credit} element={<CreditSalesPage />} />
                <Route path={routes.returns} element={<ReturnsPage />} />
                <Route path={routes.products} element={<ProductsPage />} />
                <Route path={routes.stock} element={<StockPage />} />
                <Route path={routes.lots} element={<LotsPage />} />
                <Route path={routes.categories} element={<Navigate to={routes.products} replace />} />
                <Route path={routes.units} element={<UnitsPage />} />
                <Route path={routes.transfers} element={<TransfersPage />} />
                <Route path={routes.reorder} element={<Navigate to={routes.lots} replace />} />
                <Route path={routes.suppliers} element={<SuppliersPage />} />
                <Route path={routes.customers} element={<CustomersPage />} />
                <Route path={routes.employees} element={<EmployeesPage />} />
                <Route path={routes.production} element={<RepairPage />} />
                <Route path={routes.repair} element={<RepairPage />} />
                <Route path={routes.expenses} element={<ExpensesPage />} />
                <Route path={routes.transactions} element={<TransactionsPage />} />
                <Route path={routes.shops} element={<ShopsPage />} />
                <Route path={routes.reports} element={<AnalyticsPage />} />
                <Route path={routes.analytics} element={<AnalyticsPage />} />
                <Route path={routes.settings} element={<SettingsPage />} />
              </Route>
            </Route>
            <Route path="*" element={<RootRedirect />} />
          </Routes>
        </HashRouter>
      </SessionProvider>
    </SettingsContext.Provider>
  );
}
