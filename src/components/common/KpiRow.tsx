import { useRef, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useKpiScroll } from "@/hooks/useKpiScroll";
import { cn } from "@/utils/format";

/** Page-level summaries share the same scroll/reveal behavior everywhere. */
export function KpiRow({ className, children }: { className?: string; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const { pathname, search } = useLocation();
  const hidden = useKpiScroll(root, pathname + search);
  return (
    <div
      ref={root}
      className={cn("ui-kpi-reveal", hidden && "is-hidden")}
      aria-hidden={hidden}
      inert={hidden}
    >
      <div className="ui-kpi-content">
        <div className={cn("ui-kpi-row", className)}>{children}</div>
      </div>
    </div>
  );
}
