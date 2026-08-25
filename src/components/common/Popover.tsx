import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/utils/format";

export function Popover({
  open,
  onOpenChange,
  trigger,
  children,
  wide,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger: ReactNode;
  children: ReactNode;
  wide?: boolean;
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
    <div className="ui-pop" ref={ref}>
      {trigger}
      {shown ? <div className={cn("ui-pop-panel", wide && "is-wide")}>{children}</div> : null}
    </div>
  );
}
