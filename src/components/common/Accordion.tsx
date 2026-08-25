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
    <div className="ui-acc">
      <button type="button" className="ui-acc-btn" onClick={() => setOpen((v) => !v)}>
        {title}
        <ChevronDown size={14} style={{ transform: open ? "rotate(180deg)" : undefined }} />
      </button>
      {open ? <div className="ui-acc-body">{children}</div> : null}
    </div>
  );
}
