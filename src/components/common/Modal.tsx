import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/common/Button";
import { cn } from "@/utils/format";

export function Modal({
  open,
  title,
  subtitle,
  children,
  footer,
  wide,
  size,
  onClose,
}: {
  open: boolean;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  size?: "default" | "work";
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <>
      <div className="ui-modal-back [position:fixed] [inset:0] [z-index:50] [background:rgba(15,_23,_42,_0.4)]" onClick={onClose} />
      <div className={cn("ui-modal [position:fixed] [z-index:51] [top:12vh] [left:50%] [width:min(520px,_calc(100%_-_32px))] [max-height:76vh] [display:flex] [flex-direction:column] [transform:translateX(-50%)] [background:var(--paper)] [border:1px_solid_var(--line)] [border-radius:12px] [box-shadow:0_20px_40px_rgba(15,_23,_42,_0.18)]", wide && "is-wide", size === "work" && "is-work")} role="dialog" aria-modal="true">
        <div className="ui-modal-head [display:flex] [align-items:center] [justify-content:space-between] [gap:12px] [min-height:48px] [padding:0_16px] [border-bottom:1px_solid_var(--line)] [flex-shrink:0]">
          <div className="ui-modal-head-copy [display:grid] [gap:6px] [min-width:0]">
            <h2 className="ui-modal-title [font-size:14px] [font-weight:700] [color:var(--ink)]">{title}</h2>
            {subtitle}
          </div>
          <Button size="icon" variant="ghost" tabIndex={-1} onClick={onClose} aria-label="Close">
            <X size={16} />
          </Button>
        </div>
        <div className={cn("ui-modal-body [overflow:auto] [padding:16px] [flex:1]", size === "work" && "is-fill")}>{children}</div>
        {footer ? <div className="ui-modal-foot [display:flex] [justify-content:flex-end] [gap:8px] [padding:12px_16px] [border-top:1px_solid_var(--line)] [flex-shrink:0]">{footer}</div> : null}
      </div>
    </>
  );
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Delete",
  danger = true,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      footer={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p style={{ fontSize: 13, color: "var(--sub)" }}>{body}</p>
    </Modal>
  );
}
