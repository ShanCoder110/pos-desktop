import type { CSSProperties, ReactNode } from "react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/common/Button";
import { DRAWER_SIZES, type DrawerSize } from "@/shared/constants/drawer";
import { cn } from "@/utils/format";

export type { DrawerSize };

const SIZE_CLASS: Record<DrawerSize, string> = {
  sm: "is-sm",
  md: "is-md",
  lg: "is-lg",
  xl: "is-xl",
};

export function Drawer({
  open,
  title,
  subtitle,
  children,
  footer,
  size = "md",
  /** @deprecated Prefer `size="lg"`. Kept for existing call sites. */
  wide,
  form,
  dim = true,
  className,
  onClose,
}: {
  open: boolean;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: DrawerSize;
  wide?: boolean;
  form?: boolean;
  dim?: boolean;
  className?: string;
  onClose: () => void;
}) {
  const resolvedSize: DrawerSize = wide ? "lg" : size;
  const widthPx = DRAWER_SIZES[resolvedSize];

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const panelStyle: CSSProperties = {
    position: "fixed",
    top: 0,
    right: 0,
    left: "auto",
    bottom: 0,
    width: widthPx,
    maxWidth: "100vw",
    height: "100%",
    zIndex: 80,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    background: "var(--paper)",
    boxShadow: "-12px 0 32px rgb(0 0 0 / 28%)",
  };

  const backStyle: CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: 79,
    background: dim ? "rgb(0 0 0 / 48%)" : "transparent",
  };

  return createPortal(
    <>
      <div
        className={cn("ui-drawer-back", !dim && "is-clear")}
        style={backStyle}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={cn("ui-drawer", SIZE_CLASS[resolvedSize], className)}
        style={panelStyle}
        role="dialog"
        aria-modal="true"
      >
        <div className="ui-drawer-head">
          <div className="ui-drawer-head-copy">
            <h2 className="ui-drawer-title">{title}</h2>
            {subtitle}
          </div>
          <Button
            size="icon"
            variant="ghost"
            tabIndex={form ? -1 : undefined}
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} />
          </Button>
        </div>
        <div className={cn("ui-drawer-body", form && "is-form")}>{children}</div>
        {footer ? <div className="ui-drawer-foot">{footer}</div> : null}
      </aside>
    </>,
    document.body,
  );
}
