import type { ReactNode } from "react";
import { cn } from "@/utils/format";

export type KpiTone = "ok" | "warn" | "stale" | "danger" | "phantom";

export function KpiCard({
  label,
  value,
  hint,
  tone = "ok",
  icon,
  active,
  onClick,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: KpiTone;
  icon?: ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  const className = cn("ui-kpi", `is-${tone}`, onClick && "is-click", active && "is-on");
  const body = (
    <>
      <p className="ui-kpi-label">{label}</p>
      <p className="ui-kpi-value">{value}</p>
      {hint ? <p className="ui-kpi-hint">{hint}</p> : null}
      {icon ? <span className="ui-kpi-ico">{icon}</span> : null}
    </>
  );
  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick} aria-pressed={active}>
        {body}
      </button>
    );
  }
  return <article className={className}>{body}</article>;
}
