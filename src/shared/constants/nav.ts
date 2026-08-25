import type { LucideIcon } from "lucide-react";
import { routes } from "@/shared/constants/routes";
import {
  ArrowLeftRight,
  BarChart3,
  BookOpen,
  Boxes,
  Building2,
  ClipboardList,
  Factory,
  LayoutDashboard,
  Package,
  Receipt,
  Ruler,
  Truck,
  Users,
  Wallet,
  RotateCcw,
  ArrowRightLeft,
  UserCog,
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
      { to: routes.invoices, label: "Invoices", icon: Receipt },
      { to: routes.returns, label: "Returns", icon: RotateCcw },
      { to: routes.credit, label: "Credit / Udhaar", icon: BookOpen },
    ],
  },
  {
    label: "INVENTORY",
    items: [
      { to: routes.products, label: "Products", icon: Package },
      { to: routes.stock, label: "Stock", icon: ClipboardList },
      { to: routes.lots, label: "Lots", icon: Boxes },
      { to: routes.units, label: "Units", icon: Ruler },
      { to: routes.transfers, label: "Transfers", icon: ArrowRightLeft },
    ],
  },
  {
    label: "CONTACTS",
    items: [
      { to: routes.customers, label: "Customers", icon: Users },
      { to: routes.suppliers, label: "Suppliers", icon: Truck },
      { to: routes.employees, label: "Staff", icon: UserCog },
    ],
  },
  {
    label: "OPERATIONS",
    items: [
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
];

export const pageMeta: Record<string, { title: string; subtitle?: string }> = {
  [routes.dashboard]: { title: "Dashboard", subtitle: "Today’s money, stock, and jobs" },
  [routes.invoices]: { title: "Invoices", subtitle: "Completed bills from the counter" },
  [routes.returns]: { title: "Returns", subtitle: "Refunds and replacements against invoices" },
  [routes.credit]: { title: "Credit / Udhaar", subtitle: "Customer khata. + owes, − advance" },
  [routes.products]: { title: "Products", subtitle: "Catalog, categories, and prices" },
  [routes.stock]: { title: "Stock", subtitle: "On-hand from lots. FIFO on every sale" },
  [routes.lots]: { title: "Lots", subtitle: "Each supplier delivery is a new lot" },
  [routes.units]: { title: "Units", subtitle: "Meter, piece, pack, box conversions" },
  [routes.transfers]: { title: "Transfers", subtitle: "Move lots between branches" },
  [routes.reorder]: { title: "Lots", subtitle: "Receive stock as a new lot" },
  [routes.customers]: { title: "Customers", subtitle: "Khata, limit, and walk-in is no customer" },
  [routes.suppliers]: { title: "Suppliers", subtitle: "Who you buy from. No supplier ledger in V1" },
  [routes.employees]: { title: "Staff", subtitle: "Users, roles, and permissions" },
  [routes.production]: { title: "Production", subtitle: "BOM jobs, damage, and commission" },
  [routes.repair]: { title: "Production", subtitle: "BOM jobs, damage, and commission" },
  [routes.expenses]: { title: "Expenses", subtitle: "Money leaving the shop" },
  [routes.transactions]: { title: "Transactions", subtitle: "Cash in and cash out" },
  [routes.shops]: { title: "Branches", subtitle: "Store, warehouse, repair, production" },
  [routes.reports]: { title: "Reports", subtitle: "Sales, stock movement, and khata" },
  [routes.analytics]: { title: "Reports", subtitle: "Sales, stock movement, and khata" },
  [routes.settings]: { title: "Settings", subtitle: "Business, invoice print, printers, devices" },
};

export const navGroups = managementNav;
