import type { ReactNode } from "react";
import { cn } from "@/utils/format";

export function EntityCell({
  title,
  subtitle,
  icon,
  tone = "teal",
}: {
  title: string;
  subtitle?: ReactNode;
  icon?: ReactNode;
  tone?: "teal" | "blue" | "violet" | "amber" | "rose";
}) {
  return (
    <div className="ui-entity-cell">
      <span className={cn("ui-entity-avatar", `is-${tone}`)} aria-hidden>
        {icon ?? title.trim().charAt(0).toUpperCase()}
      </span>
      <span className="ui-entity-copy">
        <strong>{title}</strong>
        {subtitle ? <small>{subtitle}</small> : null}
      </span>
    </div>
  );
}
