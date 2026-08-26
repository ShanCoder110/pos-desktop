import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/utils/format";

export function Popover({
  open,
  onOpenChange,
  trigger,
  children,
  wide,
  panelClassName,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger: ReactNode;
  children: ReactNode;
  wide?: boolean;
  panelClassName?: string;
}) {
  const [inner, setInner] = useState(false);
  const shown = open ?? inner;
  const setShown = onOpenChange ?? setInner;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setShown(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [setShown]);

  return (
    <div className="ui-pop [position:relative]" ref={ref}>
      {trigger}
      {shown ? <div className={cn("ui-pop-panel [position:absolute] [top:calc(100%_+_6px)] [left:0] [z-index:24] [width:240px] [padding:8px] [border:1px_solid_var(--line)] [border-radius:10px] [background:var(--paper)] [box-shadow:0_10px_28px_rgba(15,_23,_42,_0.12)]", wide && "is-wide", panelClassName)}>{children}</div> : null}
    </div>
  );
}
