import type { CSSProperties, ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";
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
const drawerStack: HTMLElement[] = [];
let backgroundInert = false;
let backgroundOverflow = "";

function topDrawer() {
  const ordered = [...drawerStack].sort((a, b) => Number(a.style.zIndex) - Number(b.style.zIndex));
  return ordered[ordered.length - 1];
}

function syncDrawerAccessibility() {
  const top = topDrawer();
  for (const panel of drawerStack) panel.inert = panel !== top;
}

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
  closeOnBackdrop = true,
  closeDisabled = false,
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
  /** Keep unsaved forms open when the backdrop is clicked. */
  closeOnBackdrop?: boolean;
  /** Keep the drawer open while an in-flight save must finish. */
  closeDisabled?: boolean;
  /** Nested drawers use a higher z-index and optional back navigation. */
  stackLevel?: number;
  onBack?: () => void;
  className?: string;
  onClose: () => void;
}) {
  const [present, setPresent] = useState(open);
  const [leaving, setLeaving] = useState(false);
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const openerRef = useRef<HTMLElement | null>(
    typeof document !== "undefined" && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );
  const resolvedSize: DrawerSize = wide ? "lg" : size;
  const widthPx = DRAWER_SIZES[resolvedSize];
  const panelZ = 80 + stackLevel * 2;
  const backZ = panelZ - 1;

  useEffect(() => {
    if (present) return;
    const rememberOpener = (event: FocusEvent) => {
      if (event.target instanceof HTMLElement && !event.target.closest(".ui-drawer"))
        openerRef.current = event.target;
    };
    document.addEventListener("focusin", rememberOpener);
    return () => document.removeEventListener("focusin", rememberOpener);
  }, [present]);

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
    const panel = panelRef.current;
    if (!panel) return;
    const returnFocus = openerRef.current;
    const app = document.getElementById("root");
    const firstDrawer = drawerStack.length === 0;
    if (firstDrawer) {
      backgroundInert = app?.inert ?? false;
      backgroundOverflow = document.body.style.overflow;
      if (app) app.inert = true;
      document.body.style.overflow = "hidden";
    }
    drawerStack.push(panel);
    syncDrawerAccessibility();
    const focusable = () =>
      [
        ...panel.querySelectorAll<HTMLElement>(
          "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]",
        ),
      ].filter(
        (node) =>
          node.tabIndex >= 0 && !node.closest("[inert]") && node.getClientRects().length > 0,
      );
    const focusFrame = requestAnimationFrame(() => {
      if (topDrawer() === panel && !panel.contains(document.activeElement)) {
        (focusable()[0] ?? panel).focus();
      }
    });
    function onTab(event: KeyboardEvent) {
      if (event.key !== "Tab" || topDrawer() !== panel || document.querySelector(".ui-modal"))
        return;
      const fields = focusable();
      const first = fields[0];
      const last = fields[fields.length - 1];
      if (!first || !last) {
        event.preventDefault();
        panel?.focus();
        return;
      }
      if (
        event.shiftKey &&
        (document.activeElement === first || !panel?.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || !panel?.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onTab, true);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onTab, true);
      drawerStack.splice(drawerStack.indexOf(panel), 1);
      syncDrawerAccessibility();
      if (!drawerStack.length) {
        if (app) app.inert = backgroundInert;
        document.body.style.overflow = backgroundOverflow;
      }
      if (returnFocus?.isConnected && !returnFocus.closest("[inert]")) returnFocus.focus();
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
        onClick={leaving || !closeOnBackdrop || closeDisabled ? undefined : onClose}
        aria-hidden="true"
      />
      <aside
        ref={panelRef}
        tabIndex={-1}
        className={cn("ui-drawer", SIZE_CLASS[resolvedSize], leaving && "is-leaving", className)}
        style={panelStyle}
        role="dialog"
        aria-labelledby={titleId}
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
                disabled={leaving || closeDisabled}
                onClick={onBack}
              >
                Back
              </Button>
            ) : null}
            <h2 id={titleId} className="ui-drawer-title">
              {title}
            </h2>
            {subtitle}
          </div>
          <Button
            size="icon"
            variant="ghost"
            disabled={leaving || closeDisabled}
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
