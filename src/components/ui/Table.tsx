import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "@/utils/format";

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="page-table">
      <table className="w-full text-left">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
      {children}
    </thead>
  );
}

export function Th({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn("px-3 py-2 font-medium", className)} {...props} />;
}

export function Td({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("border-t border-slate-100 px-3 py-1.5 align-middle", className)} {...props} />;
}

export function MoneyCell({ n, muted }: { n: number; muted?: boolean }) {
  return (
    <td
      className={cn(
        "border-t border-slate-100 px-3 py-1.5 text-right tabular-nums",
        muted && "text-slate-400",
      )}
    >
      {n === 0 ? "—" : n.toLocaleString("en-PK")}
    </td>
  );
}
