import type { CSSProperties, ReactNode } from "react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, X } from "lucide-react";
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

const CLOSE_MS = 200;

function closeDuration() {
  if (typeof window === "undefined") return CLOSE_MS;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : CLOSE_MS;
}

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
  stackLevel = 0,
  onBack,
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
  /** Nested drawers use a higher z-index and optional back navigation. */
  stackLevel?: number;
  onBack?: () => void;
  className?: string;
  onClose: () => void;
}) {
  const [present, setPresent] = useState(open);
  const [leaving, setLeaving] = useState(false);
  const resolvedSize: DrawerSize = wide ? "lg" : size;
  const widthPx = DRAWER_SIZES[resolvedSize];
  const panelZ = 80 + stackLevel * 2;
  const backZ = panelZ - 1;

  useEffect(() => {
    if (open) {
      setPresent(true);
      setLeaving(false);
      return;
    }
    if (!present) return;
    setLeaving(true);
    const id = window.setTimeout(() => {
      setPresent(false);
      setLeaving(false);
    }, closeDuration());
    return () => window.clearTimeout(id);
  }, [open, present]);

  useEffect(() => {
    if (!present) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [present]);

  if (!present || typeof document === "undefined") return null;

  const panelStyle: CSSProperties = {
    position: "fixed",
    top: 0,
    right: 0,
    left: "auto",
    bottom: 0,
    width: widthPx,
    maxWidth: "100vw",
    height: "100%",
    zIndex: panelZ,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    background: "var(--paper)",
    boxShadow: "-12px 0 32px rgb(0 0 0 / 28%)",
  };

  const backStyle: CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: backZ,
    background: dim ? "rgb(0 0 0 / 48%)" : "transparent",
  };

  return createPortal(
    <>
      <div
        className={cn("ui-drawer-back", !dim && "is-clear", leaving && "is-leaving")}
        style={backStyle}
        onClick={leaving ? undefined : onClose}
        aria-hidden="true"
      />
      <aside
        className={cn("ui-drawer", SIZE_CLASS[resolvedSize], leaving && "is-leaving", className)}
        style={panelStyle}
        role="dialog"
        aria-modal="true"
        aria-hidden={leaving}
      >
        <div className="ui-drawer-head">
          <div className="ui-drawer-head-copy">
            {onBack ? (
              <Button
                size="sm"
                variant="ghost"
                className="mb-1 -ml-1"
                icon={<ArrowLeft size={15} />}
                disabled={leaving}
                onClick={onBack}
              >
                Back
              </Button>
            ) : null}
            <h2 className="ui-drawer-title">{title}</h2>
            {subtitle}
          </div>
          <Button
            size="icon"
            variant="ghost"
            tabIndex={form ? -1 : undefined}
            disabled={leaving}
            onClick={onBack ?? onClose}
            aria-label={onBack ? "Back to previous" : "Close"}
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
