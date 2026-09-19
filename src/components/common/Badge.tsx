import type { ReactNode } from "react";
import { cn } from "@/utils/format";

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "ok" | "warn" | "danger" | "info";
}) {
  return <span className={cn("ui-badge [display:inline-flex] [align-items:center] [height:20px] [padding:0_8px] [border-radius:999px] [font-size:11px] [font-weight:700] [background:var(--bg)] [color:var(--sub)] [border-radius:6px]", tone !== "neutral" && `is-${tone}`)}>{children}</span>;
}
