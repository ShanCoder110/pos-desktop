import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  BookOpen,
  Boxes,
  ClipboardList,
  LayoutDashboard,
  Package,
  Receipt,
  RotateCcw,
  Settings,
  ShoppingCart,
  Store,
  Truck,
  UserCog,
  Users,
  Wallet,
  Wrench,
  ArrowLeftRight,
} from "lucide-react";

export type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
};

/** Compact icon-rail items shown like the POS UI reference */
export const railNav: NavItem[] = [
  { to: "/pos", label: "POS", icon: ShoppingCart },
  { to: "/", label: "Home", icon: LayoutDashboard },
  { to: "/credit", label: "Credit", icon: BookOpen },
  { to: "/products", label: "Stock", icon: Package },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/invoices", label: "Invoices", icon: Receipt },
  { to: "/lots", label: "Lots", icon: Boxes },
  { to: "/reorder", label: "Reorder", icon: ClipboardList },
  { to: "/suppliers", label: "Suppliers", icon: Truck },
  { to: "/returns", label: "Returns", icon: RotateCcw },
  { to: "/employees", label: "Staff", icon: UserCog },
  { to: "/repair", label: "Repair", icon: Wrench },
  { to: "/expenses", label: "Expense", icon: Wallet },
  { to: "/transactions", label: "Money", icon: ArrowLeftRight },
  { to: "/shops", label: "Branch", icon: Store },
  { to: "/analytics", label: "Stats", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: Settings },
];

/** Kept for grouped menus elsewhere if needed */
export const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: "Sell",
    items: [
      { to: "/pos", label: "POS", icon: ShoppingCart },
      { to: "/invoices", label: "Invoices", icon: Receipt },
      { to: "/credit", label: "Credit sale", icon: BookOpen },
      { to: "/returns", label: "Returns", icon: RotateCcw },
    ],
  },
  {
    label: "Stock",
    items: [
      { to: "/products", label: "Products", icon: Package },
      { to: "/lots", label: "Lots", icon: Boxes },
      { to: "/reorder", label: "Reorder", icon: ClipboardList },
      { to: "/suppliers", label: "Suppliers", icon: Truck },
    ],
  },
  {
    label: "People",
    items: [
      { to: "/customers", label: "Customers", icon: Users },
      { to: "/employees", label: "Employees", icon: UserCog },
    ],
  },
  {
    label: "Shop",
    items: [
      { to: "/repair", label: "Repair", icon: Wrench },
      { to: "/expenses", label: "Expenses", icon: Wallet },
      { to: "/transactions", label: "Money", icon: ArrowLeftRight },
      { to: "/shops", label: "Branches", icon: Store },
    ],
  },
  {
    label: "More",
    items: [
      { to: "/", label: "Dashboard", icon: LayoutDashboard },
      { to: "/analytics", label: "Analytics", icon: BarChart3 },
      { to: "/settings", label: "Settings", icon: Settings },
    ],
  },
];
