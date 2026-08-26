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
  const className = cn("ui-kpi [position:relative] [display:block] [width:100%] [padding:12px_14px_14px] [background:var(--paper)] [border:1px_solid_var(--line)] [border-radius:10px] [box-shadow:0_1px_2px_rgba(15,_23,_42,_0.04)] [overflow:hidden] [text-align:left] [cursor:default] [font-family:inherit] [color:inherit] [transition:transform_0.15s_ease,_box-shadow_0.15s_ease]", `is-${tone}`, onClick && "is-click", active && "is-on");
  const body = (
    <>
      <p className="ui-kpi-label [font-size:13px] [font-weight:700] [color:var(--ink)]">{label}</p>
      <p className="ui-kpi-value [margin-top:8px] [font-size:26px] [font-weight:800] [letter-spacing:-0.04em] [font-variant-numeric:tabular-nums] [color:var(--ink)] [line-height:1]">{value}</p>
      {hint ? <p className="ui-kpi-hint [margin-top:6px] [font-size:10px] [font-weight:700] [letter-spacing:0.06em] [text-transform:uppercase] [color:var(--muted)] [max-width:78%] [line-height:1.3]">{hint}</p> : null}
      {icon ? <span className="ui-kpi-ico [position:absolute] [top:10px] [right:10px] [width:32px] [height:32px] [display:grid] [place-items:center] [border-radius:10px] [background:var(--bg)] [color:var(--sub)]">{icon}</span> : null}
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
