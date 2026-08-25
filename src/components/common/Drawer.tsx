import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/common/Button";
import { cn } from "@/utils/format";

export function Drawer({
  open,
  title,
  children,
  footer,
  wide,
  form,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  form?: boolean;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <>
      <div className="ui-drawer-back" onClick={onClose} />
      <aside className={cn("ui-drawer", wide && "is-wide")} role="dialog" aria-modal="true">
        <div className="ui-drawer-head">
          <h2 className="ui-drawer-title">{title}</h2>
          <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close">
            <X size={16} />
          </Button>
        </div>
        <div className={cn("ui-drawer-body", form && "is-form")}>{children}</div>
        {footer ? <div className="ui-drawer-foot">{footer}</div> : null}
      </aside>
    </>
  );
}
