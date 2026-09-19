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
        "ui-btn [display:inline-flex] [align-items:center] [justify-content:center] [gap:6px] [height:32px] [padding:0_12px] [border:1px_solid_var(--line)] [border-radius:8px] [background:var(--paper)] [color:var(--ink)] [font-size:12px] [font-weight:650] [white-space:nowrap] [cursor:pointer] [transition:transform_.12s_ease,_box-shadow_.15s_ease,_background_.15s_ease,_border-color_.15s_ease]",
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
