import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/format";

type Variant = "primary" | "ghost" | "danger" | "outline" | "soft" | "dark";
type Size = "sm" | "md" | "icon";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
};

const variants: Record<Variant, string> = {
  primary: "bg-accent text-white hover:bg-accent-deep",
  dark: "bg-header text-white hover:bg-ink2",
  ghost: "text-sub hover:bg-bg",
  danger: "bg-danger text-white hover:bg-danger-deep",
  outline: "border border-line bg-paper text-ink hover:bg-bg",
  soft: "bg-accent-bg text-accent-deep hover:bg-teal-100",
};

const sizes: Record<Size, string> = {
  sm: "h-7 px-2.5 text-[12px] gap-1",
  md: "h-8 px-3 text-[13px] gap-1.5",
  icon: "h-8 w-8 p-0",
};

export function Button({
  variant = "outline",
  size = "md",
  icon,
  className,
  children,
  ...props
}: Props) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-md font-medium whitespace-nowrap disabled:opacity-40 disabled:pointer-events-none",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
