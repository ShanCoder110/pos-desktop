import type { InputHTMLAttributes } from "react";

export function Checkbox({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input type="checkbox" className={className ? `ui-check ${className}` : "ui-check"} {...props} />;
}
