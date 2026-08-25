import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/format";

type Variant = "outline" | "primary" | "danger" | "ghost" | "soft";

export function Button({
  variant = "outline",
  size,
  icon,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: "sm" | "icon";
  icon?: ReactNode;
}) {
  return (
    <button
      className={cn(
        "ui-btn",
        variant !== "outline" && `is-${variant}`,
        size === "sm" && "is-sm",
        size === "icon" && "is-icon",
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
