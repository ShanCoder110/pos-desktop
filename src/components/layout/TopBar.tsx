import { useLocation, useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { shops } from "@/shared/mock";

const titles: Record<string, string> = {
  "/": "Dashboard",
  "/pos": "POS",
  "/invoices": "Invoices",
  "/credit": "Credit sale",
  "/returns": "Returns",
  "/products": "Products",
  "/lots": "Stock lots",
  "/reorder": "Reorder",
  "/suppliers": "Suppliers",
  "/customers": "Customers",
  "/employees": "Employees",
  "/repair": "Repair shop",
  "/expenses": "Expenses",
  "/transactions": "Money",
  "/shops": "Branches",
  "/analytics": "Analytics",
  "/settings": "Settings",
};

export function TopBar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const title = titles[pathname] ?? "POS";

  return (
    <header className="flex h-11 shrink-0 items-center justify-between border-b border-line bg-paper px-3">
      <p className="text-[13px] font-semibold text-ink">{title}</p>
      <div className="flex items-center gap-2">
        <select
          defaultValue="sh1"
          className="h-7 rounded-md border border-line bg-bg px-2 text-[12px] text-sub"
        >
          {shops.map((shop) => (
            <option key={shop.id} value={shop.id}>
              {shop.name}
            </option>
          ))}
        </select>
        <span className="font-mono text-[12px] text-muted">13 Aug 2026</span>
        <Button size="sm" variant="ghost" icon={<LogOut size={14} />} onClick={() => navigate("/login")}>
          Out
        </Button>
      </div>
    </header>
  );
}
