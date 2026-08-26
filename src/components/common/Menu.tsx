import { useEffect, useRef, useState, type ReactNode } from "react";
import { MoreVertical } from "lucide-react";
import { Button } from "@/components/common/Button";

export function Menu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <Button size="icon" variant="ghost" onClick={() => setOpen((v) => !v)} aria-label="Row actions">
        <MoreVertical size={15} />
      </Button>
      {open ? (
        <div className="ui-menu [position:absolute] [top:calc(100%_+_4px)] [right:0] [z-index:20] [min-width:168px] [padding:6px] [border:1px_solid_var(--line)] [border-radius:8px] [background:var(--paper)] [box-shadow:0_10px_28px_rgba(15,_23,_42,_0.12)]" onClick={() => setOpen(false)}>
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function MenuItem({
  icon,
  danger,
  children,
  onClick,
}: {
  icon?: ReactNode;
  danger?: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button type="button" className={danger ? "is-danger" : undefined} onClick={onClick}>
      {icon}
      {children}
    </button>
  );
}
