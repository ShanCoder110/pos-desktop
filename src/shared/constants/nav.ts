import type { LucideIcon } from "lucide-react";
import { routes } from "@/shared/constants/routes";
import {
  ArrowLeftRight,
  BarChart3,
  BookOpen,
  Building2,
  Factory,
  LayoutDashboard,
  Package,
  Receipt,
  Trash2,
  Truck,
  Users,
  Wallet,
  UserCog,
  UserRound,
} from "lucide-react";

export type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
};

export const managementNav: { label: string; items: NavItem[] }[] = [
  {
    label: "MAIN",
    items: [{ to: routes.dashboard, label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "SALES",
    items: [
      { to: routes.sales, label: "Sales", icon: Receipt },
      { to: routes.credit, label: "Customer credit", icon: BookOpen },
    ],
  },
  {
    label: "INVENTORY",
    items: [{ to: routes.products, label: "Products", icon: Package }],
  },
  {
    label: "CONTACTS",
    items: [
      { to: routes.customers, label: "Customers", icon: Users },
      { to: routes.suppliers, label: "Suppliers", icon: Truck },
      { to: routes.employees, label: "Employees", icon: UserCog },
    ],
  },
  {
    label: "OPERATIONS",
    items: [
      { to: routes.trash, label: "Trash", icon: Trash2 },
      { to: routes.shops, label: "Branches", icon: Building2 },
      { to: routes.production, label: "Production", icon: Factory },
      { to: routes.expenses, label: "Expenses", icon: Wallet },
      { to: routes.transactions, label: "Transactions", icon: ArrowLeftRight },
    ],
  },
  {
    label: "REPORTING",
    items: [{ to: routes.reports, label: "Reports", icon: BarChart3 }],
  },
  {
    label: "MANAGEMENT",
    items: [{ to: routes.users, label: "Users", icon: UserRound }],
  },
];

export const pageMeta: Record<string, { title: string; subtitle?: string }> = {
  [routes.dashboard]: { title: "Dashboard", subtitle: "Today’s sales, stock, and jobs" },
  [routes.sales]: { title: "Sales", subtitle: "Invoices, returns, and claims" },
  [routes.salesReturns]: { title: "Sales", subtitle: "Refunds and replacements against invoices" },
  [routes.salesClaims]: { title: "Sales", subtitle: "Products with claims" },
  [routes.salesProducts]: { title: "Sales", subtitle: "Paid, credit, partial, and repair sales" },
  [routes.invoices]: { title: "Sales", subtitle: "Completed bills from the counter" },
  [routes.returns]: { title: "Sales", subtitle: "Refunds and replacements against invoices" },
  [routes.credit]: { title: "Customer credit", subtitle: "Customer balance. + owes, − advance" },
  [routes.products]: { title: "Products", subtitle: "Catalog, lots, units, and transfers" },
  [routes.productsClaims]: { title: "Sales", subtitle: "Products with claims" },
  [routes.productsLow]: { title: "Products", subtitle: "Plan stock replenishment" },
  [routes.stock]: { title: "Products", subtitle: "On-hand from lots. FIFO on every sale" },
  [routes.lots]: { title: "Products", subtitle: "Each supplier delivery is a new lot" },
  [routes.units]: { title: "Products", subtitle: "Meter, piece, pack, box conversions" },
  [routes.productsCategories]: { title: "Products", subtitle: "Groups used on the catalog" },
  [routes.categories]: { title: "Products", subtitle: "Groups used on the catalog" },
  [routes.transfers]: { title: "Products", subtitle: "Move lots between branches" },
  [routes.reorder]: { title: "Reorders", subtitle: "Pending purchase orders" },
  [routes.customers]: { title: "Customers", subtitle: "Balance, credit sales, and collections" },
  [routes.suppliers]: { title: "Suppliers", subtitle: "Purchasing contacts and stock sources" },
  [routes.employees]: {
    title: "Employees",
    subtitle: "Staff payouts and ledger. Owner is under Users.",
  },
  [routes.users]: { title: "Users", subtitle: "Sign-in accounts and roles" },
  [routes.trash]: { title: "Trash", subtitle: "Restore or permanently delete removed records" },
  [routes.production]: { title: "Production", subtitle: "BOM jobs, damage, and commission" },
  [routes.repair]: { title: "Production", subtitle: "BOM jobs, damage, and commission" },
  [routes.expenses]: { title: "Expenses", subtitle: "Money leaving the shop" },
  [routes.transactions]: { title: "Transactions", subtitle: "Cash in and cash out" },
  [routes.shops]: { title: "Branches", subtitle: "Store, warehouse, repair, production" },
  [routes.reports]: { title: "Reports", subtitle: "Period sales, expenses, stock, and PDF export" },
  [routes.analytics]: {
    title: "Reports",
    subtitle: "Period sales, expenses, stock, and PDF export",
  },
  [routes.settings]: { title: "Settings", subtitle: "Shop profile, receipt, printer, and sync" },
  [routes.settingsReceipt]: {
    title: "Settings",
    subtitle: "Shop profile, receipt, printer, and sync",
  },
  [routes.settingsProducts]: {
    title: "Settings",
    subtitle: "Shop profile, receipt, printer, and sync",
  },
  [routes.settingsLocalization]: {
    title: "Settings",
    subtitle: "Shop profile, receipt, printer, and sync",
  },
  [routes.settingsPrinter]: {
    title: "Settings",
    subtitle: "Shop profile, receipt, printer, and sync",
  },
  [routes.settingsDevices]: {
    title: "Settings",
    subtitle: "Shop profile, receipt, printer, and sync",
  },
  [routes.settingsSync]: {
    title: "Settings",
    subtitle: "Shop profile, receipt, printer, and sync",
  },
};

export const navGroups = managementNav;
