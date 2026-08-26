import type { InputHTMLAttributes } from "react";

export function Checkbox({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input type="checkbox" className={className ? `ui-check [width:16px] [height:16px] [accent-color:var(--accent)] [cursor:pointer] ${className}` : "ui-check [width:16px] [height:16px] [accent-color:var(--accent)] [cursor:pointer]"} {...props} />;
}
