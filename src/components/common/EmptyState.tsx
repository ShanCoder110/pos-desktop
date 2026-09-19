import type { ReactNode } from "react";
import { Inbox } from "lucide-react";
import { cn } from "@/utils/format";

export function EmptyState({
  icon,
  title,
  description,
  children,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("ui-empty-state", className)}>
      <span className="ui-empty-state-icon">{icon ?? <Inbox size={18} />}</span>
      <p>{title}</p>
      {description ? <small>{description}</small> : null}
      {children}
    </div>
  );
}
