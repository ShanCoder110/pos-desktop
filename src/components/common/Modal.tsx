import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/common/Button";
import { cn } from "@/utils/format";

export function Modal({
  open,
  title,
  children,
  footer,
  wide,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <>
      <div className="ui-modal-back" onClick={onClose} />
      <div className={cn("ui-modal", wide && "is-wide")} role="dialog" aria-modal="true">
        <div className="ui-modal-head">
          <h2 className="ui-modal-title">{title}</h2>
          <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close">
            <X size={16} />
          </Button>
        </div>
        <div className="ui-modal-body">{children}</div>
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
