import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/utils/format";

const PANEL_GAP = 6;
const PANEL_Z = 80;

export function Popover({
  open,
  onOpenChange,
  trigger,
  children,
  wide,
  panelClassName,
  /** Prefer aligning the panel’s right edge to the trigger (toolbar controls). */
  align = "start",
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger: ReactNode;
  children: ReactNode;
  wide?: boolean;
  panelClassName?: string;
  align?: "start" | "end";
}) {
  const [inner, setInner] = useState(false);
  const shown = open ?? inner;
  const setShown = onOpenChange ?? setInner;
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  const placePanel = useCallback(() => {
    const anchor = rootRef.current;
    const panel = panelRef.current;
    if (!anchor || !panel) return;

    const rect = anchor.getBoundingClientRect();
    const panelWidth = panel.offsetWidth || (wide ? 260 : 240);
    const panelHeight = panel.offsetHeight || 200;
    const maxLeft = window.innerWidth - panelWidth - 8;

    let left = align === "end" ? rect.right - panelWidth : rect.left;
    left = Math.min(Math.max(8, left), Math.max(8, maxLeft));

    const below = rect.bottom + PANEL_GAP;
    const above = rect.top - PANEL_GAP - panelHeight;
    const fitsBelow = below + panelHeight <= window.innerHeight - 8;
    const top = fitsBelow ? below : Math.max(8, above);

    setCoords({ top, left });
  }, [align, wide]);

  useLayoutEffect(() => {
    if (!shown) {
      setCoords(null);
      return;
    }
    placePanel();
    const frame = window.requestAnimationFrame(placePanel);
    return () => window.cancelAnimationFrame(frame);
  }, [placePanel, shown, children]);

  useEffect(() => {
    if (!shown) return;
    const onReflow = () => placePanel();
    window.addEventListener("scroll", onReflow, true);
    window.addEventListener("resize", onReflow);
    return () => {
      window.removeEventListener("scroll", onReflow, true);
      window.removeEventListener("resize", onReflow);
    };
  }, [placePanel, shown]);

  useEffect(() => {
    if (!shown) return;
    function onDoc(e: MouseEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setShown(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [setShown, shown]);

  const panelStyle: CSSProperties = coords
    ? {
        position: "fixed",
        top: coords.top,
        left: coords.left,
        zIndex: PANEL_Z,
      }
    : {
        position: "fixed",
        top: 0,
        left: 0,
        visibility: "hidden",
        pointerEvents: "none",
        zIndex: PANEL_Z,
      };

  return (
    <div className="ui-pop [position:relative]" ref={rootRef}>
      {trigger}
      {shown
        ? createPortal(
            <div
              ref={panelRef}
              className={cn(
                "ui-pop-panel [box-sizing:border-box] [width:240px] [padding:8px] [border:1px_solid_var(--line)] [border-radius:10px] [background:var(--paper)] [box-shadow:0_10px_28px_rgba(15,_23,_42,_0.12)]",
                wide && "is-wide",
                panelClassName,
              )}
              style={panelStyle}
            >
              {children}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
