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
        <div className="ui-pop-list" onClick={() => setOpen(false)}>
          {children}
        </div>
      ) : (
        <p className="ui-page-meta" style={{ padding: 8 }}>
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
}: {
  icon?: ReactNode;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button type="button" className="ui-pop-item" onClick={onClick}>
      {icon}
      {children}
    </button>
  );
}
