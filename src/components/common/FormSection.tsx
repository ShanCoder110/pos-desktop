import type { ReactNode } from "react";
import { cn } from "@/utils/format";

export function FormSection({
  title,
  icon,
  children,
  className,
}: {
  title?: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("ui-form-section", className)}>
      {title ? (
        <header className="ui-form-section-head">
          {icon ? <span className="ui-form-section-icon">{icon}</span> : null}
          <h3>{title}</h3>
        </header>
      ) : null}
      <div className="ui-form-section-body">{children}</div>
    </section>
  );
}
