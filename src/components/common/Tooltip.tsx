import {
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/utils/format";

const GAP = 10;
const PAD = 8;

export function Tooltip({
  content,
  children,
  placement = "top",
  className,
  tipClassName,
  disabled = false,
  hoverOnly = false,
}: {
  content: ReactNode;
  children: ReactElement;
  placement?: "top" | "bottom" | "right";
  className?: string;
  tipClassName?: string;
  disabled?: boolean;
  /** Hover only — no focus tab stop (safe inside buttons). */
  hoverOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const mouse = useRef({ x: 0, y: 0 });
  const tipRef = useRef<HTMLDivElement | null>(null);
  const hasContent =
    content != null &&
    !(typeof content === "string" && content.trim() === "") &&
    !(typeof content === "number" && Number.isNaN(content));
  const enabled = !disabled && hasContent;

  const place = useCallback(() => {
    const tip = tipRef.current;
    if (!tip) return null;
    const rect = tip.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    let top: number;
    let left: number;
    if (placement === "right") {
      top = mouse.current.y - rect.height / 2;
      left = mouse.current.x + GAP;
    } else if (placement === "bottom") {
      top = mouse.current.y + GAP;
      left = mouse.current.x - rect.width / 2;
    } else {
      top = mouse.current.y - rect.height - GAP;
      left = mouse.current.x - rect.width / 2;
    }
    top = Math.max(PAD, Math.min(top, window.innerHeight - rect.height - PAD));
    left = Math.max(PAD, Math.min(left, window.innerWidth - rect.width - PAD));
    return { top, left };
  }, [placement]);

  const update = useCallback(() => {
    const next = place();
    if (next) setCoords(next);
  }, [place]);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    update();
  }, [open, update, content]);

  useEffect(() => {
    if (!open) return;
    const onScroll = () => update();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, update]);

  if (!enabled) return children;

  function show(e: React.MouseEvent | React.FocusEvent) {
    if (e.type === "focus") {
      const rect = e.currentTarget.getBoundingClientRect();
      mouse.current =
        placement === "right"
          ? { x: rect.right, y: rect.top + rect.height / 2 }
          : { x: rect.left + rect.width / 2, y: rect.top };
    } else {
      const me = e as React.MouseEvent;
      mouse.current = { x: me.clientX, y: me.clientY };
    }
    setCoords(null);
    setOpen(true);
  }

  const style: CSSProperties =
    coords == null
      ? {
          position: "fixed",
          top: 0,
          left: 0,
          visibility: "hidden",
          pointerEvents: "none",
          zIndex: 80,
        }
      : { position: "fixed", top: coords.top, left: coords.left, zIndex: 80 };

  return (
    <>
      <span
        className={cn(
          "ui-tooltip-trigger [display:inline-flex] [max-width:100%] [min-width:0]",
          className,
        )}
        tabIndex={hoverOnly ? undefined : 0}
        onMouseEnter={show}
        onMouseMove={(e) => {
          mouse.current = { x: e.clientX, y: e.clientY };
          if (open) requestAnimationFrame(update);
        }}
        onMouseLeave={() => setOpen(false)}
        onFocus={hoverOnly ? undefined : show}
        onBlur={hoverOnly ? undefined : () => setOpen(false)}
      >
        {children}
      </span>
      {open
        ? createPortal(
            <div
              ref={tipRef}
              role="tooltip"
              style={style}
              className={cn(
                "ui-tooltip [max-width:min(420px,_calc(100vw_-_16px))] [padding:8px_10px] [border-radius:8px] [background:var(--header)] [color:#fff] [font-size:12px] [font-weight:600] [line-height:1.35] [box-shadow:0_8px_20px_rgba(15,_23,_42,_0.2)] [pointer-events:none] [white-space:normal]",
                tipClassName,
              )}
            >
              {content}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

export function TruncatedTooltip({ text, className }: { text: string; className?: string }) {
  return (
    <Tooltip content={text}>
      <span
        className={cn(
          "ui-truncate [display:block] [overflow:hidden] [text-overflow:ellipsis] [white-space:nowrap] [max-width:100%]",
          className,
        )}
      >
        {text || "—"}
      </span>
    </Tooltip>
  );
}
