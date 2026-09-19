import type { ReactNode } from "react";
import { cn } from "@/utils/format";

export function TableToolbar({
  children,
  total,
  label = "items",
  actions,
  className,
}: {
  children?: ReactNode;
  total?: number;
  label?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("ui-table-tools", className)}>
      <div className="ui-table-tools-main">{children}</div>
      <div className="ui-table-tools-side">
        {total !== undefined ? (
          <span className="ui-table-result-count" aria-live="polite">
            <strong>{total}</strong> {total === 1 ? label.replace(/s$/, "") : label}
          </span>
        ) : null}
        {actions}
      </div>
    </div>
  );
}
