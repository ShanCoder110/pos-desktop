import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export function Accordion({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="ui-acc [border:1px_solid_var(--line)] [border-radius:8px] [overflow:hidden]">
      <button type="button" className="ui-acc-btn [display:flex] [align-items:center] [justify-content:space-between] [width:100%] [height:36px] [padding:0_12px] [border:0] [background:var(--bg)] [color:var(--ink)] [font-size:12px] [font-weight:650] [cursor:pointer]" onClick={() => setOpen((v) => !v)}>
        {title}
        <ChevronDown size={14} style={{ transform: open ? "rotate(180deg)" : undefined }} />
      </button>
      {open ? <div className="ui-acc-body [padding:12px] [border-top:1px_solid_var(--line)]">{children}</div> : null}
    </div>
  );
}
