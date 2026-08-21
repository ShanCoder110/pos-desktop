import { useState } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
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
import { ReorderPage } from "@/pages/reorder/ReorderPage";
import { RepairPage } from "@/pages/repair/RepairPage";
import { ReturnsPage } from "@/pages/returns/ReturnsPage";
import { SettingsPage } from "@/pages/settings/SettingsPage";
import { OnboardingPage } from "@/pages/setup/OnboardingPage";
import { ShopsPage } from "@/pages/shops/ShopsPage";
import { SuppliersPage } from "@/pages/suppliers/SuppliersPage";
import { TransactionsPage } from "@/pages/transactions/TransactionsPage";
import { defaultSettings, SettingsContext } from "@/shared/settings";
import type { ShopSettings } from "@/shared/types";

export default function App() {
  const [settings, setSettings] = useState<ShopSettings>(defaultSettings);

  return (
    <SettingsContext.Provider value={{ settings, setSettings }}>
      <HashRouter>
        <Routes>
          <Route path="/setup" element={<OnboardingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route element={<AppLayout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/pos" element={<PosPage />} />
            <Route path="/invoices" element={<InvoicesPage />} />
            <Route path="/credit" element={<CreditSalesPage />} />
            <Route path="/returns" element={<ReturnsPage />} />
            <Route path="/products" element={<ProductsPage />} />
            <Route path="/lots" element={<LotsPage />} />
            <Route path="/reorder" element={<ReorderPage />} />
            <Route path="/suppliers" element={<SuppliersPage />} />
            <Route path="/customers" element={<CustomersPage />} />
            <Route path="/employees" element={<EmployeesPage />} />
            <Route path="/repair" element={<RepairPage />} />
            <Route path="/expenses" element={<ExpensesPage />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/shops" element={<ShopsPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/pos" replace />} />
        </Routes>
      </HashRouter>
    </SettingsContext.Provider>
  );
}
