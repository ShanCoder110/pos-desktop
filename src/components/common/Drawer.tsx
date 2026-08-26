import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/common/Button";
import { cn } from "@/utils/format";

export function Drawer({
  open,
  title,
  subtitle,
  children,
  footer,
  wide,
  form,
  dim = true,
  className,
  onClose,
}: {
  open: boolean;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  form?: boolean;
  dim?: boolean;
  className?: string;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <>
      <div
        className={cn(
          "ui-drawer-back [position:fixed] [inset:0] [z-index:50]",
          dim ? "[background:rgba(15,_23,_42,_0.4)]" : "[background:transparent]",
        )}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className={cn("ui-drawer [position:fixed] [z-index:51] [top:0] [right:0] [width:min(420px,_100%)] [max-width:100vw] [height:100%] [display:flex] [flex-direction:column] [overflow:hidden] [background:var(--paper)] [box-shadow:-12px_0_32px_rgba(15,_23,_42,_0.14)] [transform:translateX(0)] [animation:ui-drawer-in_0.2s_ease]", wide && "is-wide", className)} role="dialog" aria-modal="true">
        <div className="ui-drawer-head [display:flex] [align-items:center] [justify-content:space-between] [gap:12px] [min-height:48px] [padding:0_16px] [border-bottom:1px_solid_var(--line)] [flex-shrink:0]">
          <div className="ui-drawer-head-copy [display:grid] [gap:6px] [min-width:0] [flex:1]">
            <h2 className="ui-drawer-title [font-size:14px] [font-weight:700] [color:var(--ink)]">{title}</h2>
            {subtitle}
          </div>
          <Button size="icon" variant="ghost" tabIndex={form ? -1 : undefined} onClick={onClose} aria-label="Close">
            <X size={16} />
          </Button>
        </div>
        <div className={cn("ui-drawer-body [overflow:auto] [padding:16px] [flex:1]", form && "is-form")}>{children}</div>
        {footer ? <div className="ui-drawer-foot [display:flex] [justify-content:flex-end] [gap:8px] [padding:12px_16px] [border-top:1px_solid_var(--line)] [flex-shrink:0]">{footer}</div> : null}
      </aside>
    </>
  );
}
