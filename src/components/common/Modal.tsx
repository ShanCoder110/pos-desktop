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
      <div className="ui-modal-back" onClick={onClose} />
      <div className={cn("ui-modal", wide && "is-wide", size === "work" && "is-work")} role="dialog" aria-modal="true">
        <div className="ui-modal-head">
          <div className="ui-modal-head-copy">
            <h2 className="ui-modal-title">{title}</h2>
            {subtitle}
          </div>
          <Button size="icon" variant="ghost" tabIndex={-1} onClick={onClose} aria-label="Close">
            <X size={16} />
          </Button>
        </div>
        <div className={cn("ui-modal-body", size === "work" && "is-fill")}>{children}</div>
        {footer ? <div className="ui-modal-foot">{footer}</div> : null}
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
