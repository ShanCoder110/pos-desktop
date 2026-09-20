import type { ReactNode } from "react";
import { cn } from "@/utils/format";

export function DetailToolbar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("detail-toolbar", className)}>{children}</div>;
}

export function DetailToolbarButton({
  variant = "ghost",
  icon,
  children,
  onClick,
  className,
}: {
  variant?: "ghost" | "accent" | "warn" | "info" | "edit" | "danger";
  icon: ReactNode;
  children: ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={cn(
        "detail-toolbar-btn",
        variant === "ghost" ? "is-ghost" : `is-${variant}`,
        className,
      )}
      onClick={onClick}
    >
      <span className="detail-toolbar-btn-icon">{icon}</span>
      <span>{children}</span>
    </button>
  );
}
