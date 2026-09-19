import type { ReactNode } from "react";
import type { DashboardDelta } from "@/shared/constants/dashboard";
import { cn } from "@/utils/format";

export type KpiTone = "ok" | "info" | "violet" | "warn" | "stale" | "danger" | "phantom";

export function KpiCard({
  label,
  value,
  hint,
  tone = "ok",
  icon,
  active,
  delta,
  invertDelta,
  onClick,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: KpiTone;
  icon?: ReactNode;
  active?: boolean;
  delta?: DashboardDelta;
  invertDelta?: boolean;
  onClick?: () => void;
}) {
  const className = cn(
    "ui-kpi [position:relative] [display:block] [width:100%] [padding:12px_14px_14px] [background:var(--paper)] [border:1px_solid_var(--line)] [border-radius:10px] [box-shadow:0_1px_2px_color-mix(in_srgb,var(--ink)_4%,transparent)] [outline:none] [text-align:left] [cursor:default] [font-family:inherit] [color:inherit] [appearance:none]",
    `is-${tone}`,
    onClick && "is-click",
    active && "is-on",
  );
  const deltaTone =
    !delta || delta.direction === "flat"
      ? "is-flat"
      : delta.direction === "new"
        ? "is-new"
        : invertDelta
          ? delta.direction === "up"
            ? "is-down"
            : "is-up"
          : delta.direction === "up"
            ? "is-up"
            : "is-down";
  const body = (
    <>
      <p className="ui-kpi-label [font-size:13px] [font-weight:700]">{label}</p>
      <p className="ui-kpi-value [margin-top:8px] [font-size:26px] [font-weight:800] [letter-spacing:-0.04em] [font-variant-numeric:tabular-nums] [line-height:1]">
        {value}
      </p>
      {delta ? <p className={cn("ui-kpi-delta", deltaTone)}>{delta.text}</p> : null}
      {hint ? (
        <p className="ui-kpi-hint [margin-top:6px] [font-size:10px] [font-weight:700] [letter-spacing:0.06em] [text-transform:uppercase] [max-width:78%] [line-height:1.3]">
          {hint}
        </p>
      ) : null}
      {icon ? (
        <span className="ui-kpi-ico [position:absolute] [top:10px] [right:10px] [width:32px] [height:32px] [display:grid] [place-items:center] [border-radius:10px]">
          {icon}
        </span>
      ) : null}
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        className={className}
        onClick={(event) => {
          onClick();
          event.currentTarget.blur();
        }}
        aria-pressed={active}
      >
        {body}
      </button>
    );
  }
  return <article className={className}>{body}</article>;
}
