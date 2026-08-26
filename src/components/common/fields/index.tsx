import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { cn } from "@/utils/format";

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("field", error && "is-invalid", className)}>
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
      {error ? <span className="field-error">{error}</span> : null}
    </label>
  );
}

export function TextInput({
  className,
  startIcon,
  endIcon,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  startIcon?: ReactNode;
  endIcon?: ReactNode;
}) {
  if (!startIcon && !endIcon) {
    return <input className={cn("field-input", className)} {...props} />;
  }
  return (
    <div className={cn("field-wrap", startIcon ? "has-start" : undefined, endIcon ? "has-end" : undefined)}>
      {startIcon ? <span className="field-icon is-start">{startIcon}</span> : null}
      <input className={cn("field-input", className)} {...props} />
      {endIcon ? <span className="field-icon is-end">{endIcon}</span> : null}
    </div>
  );
}

export function SelectInput({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn("field-select", className)} {...props} />;
}

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn("field-textarea", className)} {...props} />;
}

export function MoneyInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="field-affix">
      <span>Rs</span>
      <input className={cn("field-input", className)} inputMode="decimal" {...props} />
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className={cn("toggle", checked && "is-on")}>
      <span className="toggle-label">{label}</span>
      <span className="toggle-track">
        <span className="toggle-thumb" />
      </span>
    </button>
  );
}
