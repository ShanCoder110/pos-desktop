import type { ReactNode } from "react";
import { cn } from "@/utils/format";

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "ok" | "warn" | "danger" | "info";
}) {
  return <span className={cn("ui-badge", tone !== "neutral" && `is-${tone}`)}>{children}</span>;
}
