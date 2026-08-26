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
    <label className={cn("field [display:grid] [gap:6px]", error && "is-invalid", className)}>
      <span className="field-label [font-size:12px] [font-weight:600] [color:var(--sub)]">{label}</span>
      {children}
      {hint ? <span className="field-hint [font-size:11px] [color:var(--muted)]">{hint}</span> : null}
      {error ? <span className="field-error [font-size:11px] [color:var(--danger)]">{error}</span> : null}
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
    return <input className={cn("field-input [width:100%] [height:38px] [min-height:38px] [box-sizing:border-box] [border:1px_solid_var(--line)] [border-radius:8px] [background:var(--paper)] [color:var(--ink)] [padding:0_12px] [font-size:13.5px] [outline:none] [transition:border-color_0.15s,_box-shadow_0.15s,_background_0.15s]", className)} {...props} />;
  }
  return (
    <div className={cn("field-wrap [position:relative] [display:flex] [align-items:center]", startIcon ? "has-start" : undefined, endIcon ? "has-end" : undefined)}>
      {startIcon ? <span className="field-icon [position:absolute] [top:50%] [display:grid] [place-items:center] [color:var(--muted)] [transform:translateY(-50%)] [pointer-events:none] is-start">{startIcon}</span> : null}
      <input className={cn("field-input [width:100%] [height:38px] [min-height:38px] [box-sizing:border-box] [border:1px_solid_var(--line)] [border-radius:8px] [background:var(--paper)] [color:var(--ink)] [padding:0_12px] [font-size:13.5px] [outline:none] [transition:border-color_0.15s,_box-shadow_0.15s,_background_0.15s]", className)} {...props} />
      {endIcon ? <span className="field-icon [position:absolute] [top:50%] [display:grid] [place-items:center] [color:var(--muted)] [transform:translateY(-50%)] [pointer-events:none] is-end">{endIcon}</span> : null}
    </div>
  );
}

export function SelectInput({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn("field-select [width:100%] [height:38px] [min-height:38px] [box-sizing:border-box] [border:1px_solid_var(--line)] [border-radius:8px] [background:var(--paper)] [color:var(--ink)] [padding:0_12px] [font-size:13.5px] [outline:none] [transition:border-color_0.15s,_box-shadow_0.15s,_background_0.15s]", className)} {...props} />;
}

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn("field-textarea [width:100%] [height:38px] [min-height:38px] [box-sizing:border-box] [border:1px_solid_var(--line)] [border-radius:8px] [background:var(--paper)] [color:var(--ink)] [padding:0_12px] [font-size:13.5px] [outline:none] [transition:border-color_0.15s,_box-shadow_0.15s,_background_0.15s] [height:88px] [padding:10px_12px] [resize:none]", className)} {...props} />;
}

export function MoneyInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="field-affix [display:flex] [align-items:stretch] [border:1px_solid_var(--line)] [border-radius:8px] [background:var(--paper)] [overflow:hidden] [transition:border-color_0.15s,_box-shadow_0.15s,_background_0.15s]">
      <span>Rs</span>
      <input className={cn("field-input [width:100%] [height:38px] [min-height:38px] [box-sizing:border-box] [border:1px_solid_var(--line)] [border-radius:8px] [background:var(--paper)] [color:var(--ink)] [padding:0_12px] [font-size:13.5px] [outline:none] [transition:border-color_0.15s,_box-shadow_0.15s,_background_0.15s]", className)} inputMode="decimal" {...props} />
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
    <button type="button" onClick={() => onChange(!checked)} className={cn("toggle [display:flex] [align-items:center] [justify-content:space-between] [gap:12px] [padding:4px_0] [border:0] [background:transparent] [text-align:left] [cursor:pointer]", checked && "is-on")}>
      <span className="toggle-label [font-size:13px] [color:var(--ink)]">{label}</span>
      <span className="toggle-track [position:relative] [width:36px] [height:20px] [border-radius:999px] [background:var(--line)] [transition:background_0.15s_ease]">
        <span className="toggle-thumb [position:absolute] [top:2px] [left:2px] [width:16px] [height:16px] [border-radius:999px] [background:var(--paper)] [transition:transform_0.15s_ease]" />
      </span>
    </button>
  );
}
