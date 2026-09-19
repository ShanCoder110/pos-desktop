import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/common/Button";
import { Popover } from "@/components/common/Popover";

export function BulkActions({
  count,
  children,
}: {
  count: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button variant="soft" onClick={() => setOpen((v) => !v)}>
          Bulk actions
          {count ? ` (${count})` : ""}
          <ChevronDown size={14} />
        </Button>
      }
    >
      {count ? (
        <div className="ui-pop-list [display:grid] [max-height:240px] [overflow:auto]" onClick={() => setOpen(false)}>
          {children}
        </div>
      ) : (
        <p className="ui-page-meta [font-size:12px] [color:var(--muted)] [white-space:nowrap]" style={{ padding: 8 }}>
          Select rows first
        </p>
      )}
    </Popover>
  );
}

export function BulkAction({
  icon,
  children,
  onClick,
  danger,
}: {
  icon?: ReactNode;
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className={danger ? "ui-pop-item [display:flex] [align-items:center] [gap:8px] [width:100%] [min-height:32px] [padding:0_8px] [border:0] [border-radius:6px] [background:transparent] [color:var(--ink)] [font-size:12px] [font-weight:550] [text-align:left] [cursor:pointer] is-danger" : "ui-pop-item [display:flex] [align-items:center] [gap:8px] [width:100%] [min-height:32px] [padding:0_8px] [border:0] [border-radius:6px] [background:transparent] [color:var(--ink)] [font-size:12px] [font-weight:550] [text-align:left] [cursor:pointer]"}
      onClick={onClick}
    >
      {icon}
      {children}
    </button>
  );
}
